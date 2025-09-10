// // middlewares/booking-guards.middleware.ts
import type { Request, Response, NextFunction } from "express";
import moment from "moment-timezone";
import { CONSOLE_COLOR } from "../../constant/console-color";
import prisma from "../../lib/prisma";
import CustomError from "../../models/custom-error/CustomError";
import { IRedisSavedWorkspaceStrategy } from "../../services/@redis/cache/interfaces/interfaces";
import { RedisStrategyFactory } from "../../services/@redis/cache/strategies/redisStrategyFactory";
import * as RPC from "../../services/@rabbitmq/rpc/functions";

// Ajusta rutas de import a tu proyecto:

export type AttendeeInput = {
    serviceId: string;
    durationMin: number;
    staffId?: string | null;
    categoryId?: string | null;
};

export type BookingInputNormalized = {
    idCompany: string;
    idWorkspace: string;
    startLocalISO: string; // "YYYY-MM-DDTHH:mm:ss"
    timeZoneClient: string;
    attendees: AttendeeInput[];
    excludeEventId?: string;
    note?: string;
    customer: {
        id: string;
        name?: string;
        phone?: string;
        email?: string;
    };
};

// Config del workspace, si no tienes tipado pon `any`
export type BookingConfig = any;

export type BookingCtx = {
    input: BookingInputNormalized;

    workspace?: any;
    config?: BookingConfig;
    timeZoneWorkspace?: string;

    when?: {
        startClient: moment.Moment;
        startWS: moment.Moment;
        endWS?: moment.Moment;
        dateWS: string;              // "YYYY-MM-DD"
        isToday: boolean;
        roundedNow?: moment.Moment;
    };

    customer?: { idClient: string; idClientWorkspace: string };

    limitsCheck?: {
        perUserPerDayOk: boolean;
        perUserConcurrentOk: boolean;
        reasons: string[];
    };

    features?: {
        enforceResourcesAllowlist: boolean;
        paymentsGate: boolean;
        idempotency: boolean;
    };

    idempotencyKey?: string;
    auditNotes?: string[];
};

declare module "express-serve-static-core" {
    interface Request {
        booking?: { ctx: BookingCtx };
        userInfo?: { ip: string; referrer?: string };
    }
}

export class BookingGuardsMiddleware {
    /* helper uniforme para 4xx */
    private static endBadRequest(
        res: Response,
        status: number,
        message: string,
        where: string,
        error?: unknown
    ) {
        if (error) {
            console.error(
                CONSOLE_COLOR.BgRed,
                `[${where}]`,
                message,
                error instanceof Error ? error.message : error,
                CONSOLE_COLOR.Reset
            );
        } else {
            console.warn(CONSOLE_COLOR.BgYellow, `[${where}] ${message}`, CONSOLE_COLOR.Reset);
        }
        return res.status(status).json({ message });
    }

    /* ─────────────────────────────────────
       1) INPUT: valida + normaliza (ctx.input)
    ────────────────────────────────────── */
    static BaseValidationAndNormalize() {
        return (req: Request, res: Response, next: NextFunction) => {
            try {
                const p = req.body ?? {};


                console.log("mira que es p", p);

                if (!p?.idCompany || !p?.idWorkspace) {
                    return this.endBadRequest(res, 400, "Faltan idCompany o idWorkspace", "BookingGuards.BaseValidation");
                }

                const hasNew =
                    typeof p?.startLocalISO === "string" &&
                    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(p.startLocalISO) &&
                    typeof p?.timeZoneClient === "string";

                const hasLegacy =
                    typeof p?.date === "string" &&
                    /^\d{4}-\d{2}-\d{2}$/.test(p.date) &&
                    typeof p?.timezone === "string" &&
                    (p?.time ? /^\d{2}:\d{2}$/.test(p.time) : true);

                if (!hasNew && !hasLegacy) {
                    return this.endBadRequest(
                        res,
                        400,
                        "Faltan parámetros de tiempo: usa startLocalISO + timeZoneClient o bien date(+time) + timezone",
                        "BookingGuards.BaseValidation"
                    );
                }

                const startLocalISO = hasNew ? p.startLocalISO : `${p.date}T${(p.time ?? "00:00")}:00`;
                const timeZoneClient = hasNew ? p.timeZoneClient : p.timezone;

                if (!Array.isArray(p.attendees) || p.attendees.length === 0) {
                    return this.endBadRequest(res, 400, "attendees vacío", "BookingGuards.BaseValidation");
                }

                for (let i = 0; i < p.attendees.length; i++) {
                    const a = p.attendees[i];
                    if (!a?.serviceId) {
                        return this.endBadRequest(res, 400, `attendees[${i}].serviceId es requerido`, "BookingGuards.BaseValidation");
                    }
                    if (typeof a?.durationMin !== "number" || a.durationMin <= 0) {
                        return this.endBadRequest(
                            res,
                            400,
                            `attendees[${i}].durationMin debe ser > 0`,
                            "BookingGuards.BaseValidation"
                        );
                    }
                }

                // if (!p?.customer?.id) {
                //     return this.endBadRequest(res, 400, "Falta id en customer", "BookingGuards.BaseValidation");
                // }

                const input = {
                    idCompany: p.idCompany,
                    idWorkspace: p.idWorkspace,
                    startLocalISO,
                    timeZoneClient,
                    attendees: p.attendees.map((a: any) => ({
                        serviceId: a.serviceId,
                        durationMin: a.durationMin,
                        staffId: a.staffId ?? null,
                        categoryId: a.categoryId ?? null,
                    })),
                    excludeEventId: p.excludeEventId,
                    note: p.note,
                    customer: {
                        id: p?.customer?.id,
                        name: p?.customer?.name,
                        phone: p?.customer?.phone,
                        email: p?.customer?.email,
                    },
                };

                req.booking = { ctx: { input } };
                return next();
            } catch (error: any) {
                return this.endBadRequest(res, 400, "Bad request", "BookingGuards.BaseValidation", error);
            }
        };
    }

    /* ─────────────────────────────────────
       2) WORKSPACE: cache/RPC + tz + config
    ────────────────────────────────────── */
    static ResolveWorkspace() {
        return async (req: Request, res: Response, next: NextFunction) => {
            try {
                const ctx = req.booking!.ctx;
                const { idWorkspace } = ctx.input;

                const savedWorkspace = RedisStrategyFactory.getStrategy("savedWorkspace") as IRedisSavedWorkspaceStrategy;
                let workspace = await savedWorkspace.getSavedWorkspaceByIdWorkspace(idWorkspace);
                if (!workspace) {
                    const rpcRes: any = await RPC.getEstablishmentByIdForFlow(idWorkspace);
                    workspace = rpcRes?.workspace ?? null;
                    if (workspace?.id) {
                        await savedWorkspace.setSavedWorkspaceByIdWorkspace(workspace.id, workspace, 60 * 60);
                    }
                }

                if (!workspace?.timeZone) {
                    return this.endBadRequest(res, 400, "No se pudo resolver el timezone del workspace", "BookingGuards.ResolveWorkspace");
                }

                console.log("esto es workspace", workspace);

                ctx.workspace = workspace;
                // tu config vive en workspace.config (o bookingConfig según casos)
                ctx.config = workspace?.config ?? {};
                ctx.timeZoneWorkspace = workspace.timeZone;

                return next();
            } catch (error: any) {
                return next(new CustomError("BookingGuards.ResolveWorkspace", error));
            }
        };
    }

    /* ─────────────────────────────────────
       3) CLIENTE EN WORKSPACE (RPC)
    ────────────────────────────────────── */
    static ResolveClientWorkspace() {
        return async (req: Request, res: Response, next: NextFunction) => {
            try {
                const ctx = req.booking!.ctx;
                const { idWorkspace, idCompany, customer } = ctx.input;

                const list = await RPC.getClientstByIdClientAndIdWorkspace(idWorkspace, [customer.id]);
                if (!list || list.length !== 1) {
                    return this.endBadRequest(res, 400, "No se encontró el cliente en el workspace", "BookingGuards.ResolveClientWorkspace");
                }

                ctx.customer = { idClient: customer.id, idClientWorkspace: list[0]?.id };
                return next();
            } catch (error: any) {
                return next(new CustomError("BookingGuards.ResolveClientWorkspace", error));
            }
        };
    }

    /* ─────────────────────────────────────
       4) REGLAS DE TIEMPO (ventana / lead times)
    ────────────────────────────────────── */
    static EnforceTimeRules() {
        return (req: Request, res: Response, next: NextFunction) => {
            try {
                const ctx = req.booking!.ctx;
                const { startLocalISO, timeZoneClient, attendees } = ctx.input;
                const tzWS = ctx.timeZoneWorkspace!;

                const startClient = moment.tz(startLocalISO, "YYYY-MM-DDTHH:mm:ss", timeZoneClient);
                if (!startClient.isValid()) {
                    return this.endBadRequest(res, 400, "startLocalISO inválido", "BookingGuards.EnforceTimeRules");
                }

                const startWS = startClient.clone().tz(tzWS);
                const nowWS = moment().tz(tzWS);
                const dateWS = startWS.format("YYYY-MM-DD");
                const isToday = startWS.isSame(nowWS, "day");

                // Config ventana de reserva
                const bw = (ctx.config?.bookingWindow ?? {}) as {
                    minLeadTimeMin?: number;
                    maxAdvanceDays?: number;
                    sameDayCutoffHourLocal?: number;
                };

                const minLead = Math.max(0, bw.minLeadTimeMin ?? 0);
                const maxAdv = Math.max(0, bw.maxAdvanceDays ?? 365);
                const cutoff = bw.sameDayCutoffHourLocal;

                // No días pasados
                if (startWS.clone().startOf("day").isBefore(nowWS.clone().startOf("day"))) {
                    return this.endBadRequest(res, 400, "El día seleccionado ya ha pasado en el huso horario del negocio.", "BookingGuards.EnforceTimeRules");
                }
                // // Lead time
                // if (startWS.isBefore(nowWS.clone().add(minLead, "minutes"))) {
                //     return this.endBadRequest(res, 400, "La hora seleccionada ya no está disponible por lead time.", "BookingGuards.EnforceTimeRules");
                // }
                // Max advance
                if (startWS.isAfter(nowWS.clone().add(maxAdv, "days").endOf("day"))) {
                    return this.endBadRequest(res, 400, "Fuera de la ventana de reserva permitida.", "BookingGuards.EnforceTimeRules");
                }
                // Cutoff mismo día (si se usa)
                if (isToday && typeof cutoff === "number" && nowWS.hour() >= cutoff) {
                    return this.endBadRequest(res, 400, "Las reservas para hoy ya no están disponibles.", "BookingGuards.EnforceTimeRules");
                }

                const totalDuration = attendees.reduce((acc: number, a: any) => acc + (a?.durationMin ?? 0), 0);
                const endWS = startWS.clone().add(totalDuration, "minutes");

                ctx.when = { startClient, startWS, endWS, dateWS, isToday, roundedNow: nowWS };
                return next();
            } catch (error: any) {
                return next(new CustomError("BookingGuards.EnforceTimeRules", error));
            }
        };
    }

    /* ─────────────────────────────────────
       5) LÍMITES POR USUARIO (día / concurrentes)
    ────────────────────────────────────── */
    static EnforceUserLimits() {
        return async (req: Request, res: Response, next: NextFunction) => {
            try {
                const ctx = req.booking!.ctx;

                // ---- Limits con defaults seguros
                const lim = (ctx.config?.limits ?? {}) as {
                    perUserPerDay?: number;
                    perUserConcurrent?: number;
                    maxServicesPerBooking?: number;
                };

                // Si no lo configuras, aplicamos estas políticas por defecto:
                const maxServicesPerBooking = Number.isFinite(lim.maxServicesPerBooking)
                    ? Number(lim.maxServicesPerBooking)
                    : 1; // ⬅️ por defecto, 1 servicio por reserva

                const perUserPerDay = Number.isFinite(lim.perUserPerDay)
                    ? Number(lim.perUserPerDay)
                    : 1; // ⬅️ por defecto, 1 cita al día

                const perUserConcurrent = Number.isFinite(lim.perUserConcurrent)
                    ? Number(lim.perUserConcurrent)
                    : 0; // 0 = sin límite concurrente por defecto

                // ---- (A) Chequeo: servicios por reserva
                const servicesCount = ctx.input.attendees.length;
                if (maxServicesPerBooking > 0 && servicesCount > maxServicesPerBooking) {
                    return this.endBadRequest(
                        res,
                        400,
                        `Solo se permiten ${maxServicesPerBooking} servicio(s) por reserva.`,
                        "BookingGuards.EnforceUserLimits"
                    );
                }

                // Si no tenemos cliente o ventana temporal calculada, continúa
                if (!ctx.customer || !ctx.when) {
                    return next();
                }

                const { idClientWorkspace } = ctx.customer;
                const slotStartWS = ctx.when.startWS.clone();
                const slotEndWS = ctx.when.endWS!.clone();

                // Rangos día en WS → a UTC para query
                const dayStartUTC = slotStartWS.clone().startOf("day").utc().toDate();
                const dayEndUTC = slotStartWS.clone().endOf("day").utc().toDate();

                const slotStartUTC = slotStartWS.clone().utc().toDate();
                const slotEndUTC = slotEndWS.clone().utc().toDate();

                const reasons: string[] = [];

                // ---- (B) Chequeo: límite de citas por día
                if (perUserPerDay > 0) {
                    const countDay = await prisma.eventParticipant.count({
                        where: {
                            idClientWorkspaceFk: idClientWorkspace,
                            deletedDate: null,
                            event: {
                                deletedDate: null,
                                startDate: { lt: dayEndUTC },
                                endDate: { gt: dayStartUTC },
                            },
                        },
                    });

                    if (countDay >= perUserPerDay) {
                        reasons.push(`Has alcanzado el máximo de citas por día (${countDay}/${perUserPerDay}).`);
                    }
                }

                // ---- (C) Chequeo: solapes concurrentes (opcional)
                if (perUserConcurrent > 0) {
                    const overlappingCount = await prisma.eventParticipant.count({
                        where: {
                            idClientWorkspaceFk: idClientWorkspace,
                            deletedDate: null,
                            event: {
                                deletedDate: null,
                                startDate: { lt: slotEndUTC },
                                endDate: { gt: slotStartUTC },
                            },
                        },
                    });

                    if (overlappingCount >= perUserConcurrent) {
                        reasons.push(`Límite de reservas simultáneas alcanzado (${overlappingCount}/${perUserConcurrent}).`);
                    }
                }

                if (reasons.length > 0) {
                    // 409: reglas del negocio infringidas
                    return this.endBadRequest(res, 409, reasons.join(" "), "BookingGuards.EnforceUserLimits");
                }

                return next();
            } catch (error: any) {
                return next(new CustomError("BookingGuards.EnforceUserLimits", error));
            }
        };
    }


    /* ─────────────────────────────────────
       6) (Opcional) Feature flags + Idempotencia
    ────────────────────────────────────── */
    static FeatureFlagsAndIdempotency() {
        return async (req: Request, _res: Response, next: NextFunction) => {
            try {
                const ctx = req.booking!.ctx;
                // Flags simples (extiende si quieres)
                ctx.features = {
                    enforceResourcesAllowlist: !!ctx.config?.resources?.mode,
                    paymentsGate: ctx.config?.payments?.required === true,
                    idempotency: true,
                };

                // Clave idempotencia
                ctx.idempotencyKey = [
                    ctx.input.idWorkspace,
                    ctx.input.customer.id,
                    ctx.input.startLocalISO,
                    ...ctx.input.attendees.map(a => `${a.serviceId}:${a.durationMin}:${a.staffId ?? "any"}`)
                ].join("|");

                // TODO: aquí podrías consultar un Redis para rechazar duplicados a corto plazo
                // TODO: Mandar al LOG (audit): intento de reserva con idempotencyKey

                return next();
            } catch (error: any) {
                return next(new CustomError("BookingGuards.FeatureFlagsAndIdempotency", error));
            }
        };
    }
}
