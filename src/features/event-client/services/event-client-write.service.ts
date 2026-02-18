import { Event, Prisma } from "@prisma/client";
import prisma from "../../../lib/prisma";
import CustomError from "../../../models/custom-error/CustomError";
import moment from "moment";
import { CONSOLE_COLOR } from "../../../constant/console-color";
import { TIME_SECONDS } from "../../../constant/time";
import { v4 as uuidv4 } from "uuid";
import {
    assignSequentially_SPECIAL,
    computeSlotConfig,
    getEventsOverlappingRange_SPECIAL,
    getUsersWhoCanPerformService_SPECIAL,
    groupEventsByUser_SPECIAL,
    mergeTouchingWindows_SPECIAL,
    subtractBusyFromShift_SPECIAL,
    type AvailabilityDepsSpecial,
} from "../../../services/@database/event/availability-special.service";
import { OnlineBookingConfig } from "../../../services/@redis/cache/interfaces/models/booking-config";
import { RedisStrategyFactory } from "../../../services/@redis/cache/strategies/redisStrategyFactory";
import { _getServicesSnapshotById } from "../../../services/@database/event/util/getInfoServices";
import { IRedisRoundRobinStrategy } from "../../../services/@redis/cache/strategies/roundRobin/interfaces";

type AddFromWebInput = {
    idCompany: string;
    idWorkspace: string;
    timeZoneClient: string;
    startLocalISO: string;
    attendees: Array<{
        serviceId: string;
        durationMin: number;
        staffId?: string | null;
        categoryId?: string | null;
    }>;
    excludeEventId?: string;
    note?: string;
    isCommentRead?: boolean;
    customer: {
        id: string;
        idClient?: string;
        idClientWorkspace?: string;
        name?: string;
        email?: string;
        phone?: string;
    };
    eventSourceType: "PLATFORM" | "WEB" | "WIDGET" | "GOOGLE" | "BOT";
};

type AddFromWebDeps = {
    timeZoneWorkspace: string;
    autoConfirmClientBookings?: boolean;
    businessHoursService: {
        getBusinessHoursFromRedis(idCompany: string, idWorkspace: string): Promise<any>;
    };
    workerHoursService: {
        getWorkerHoursFromRedis(userIds: string[], idWorkspace: string): Promise<any>;
    };
    temporaryHoursService: {
        getTemporaryHoursFromRedis(
            userIds: string[],
            idWorkspace: string,
            range?: { date?: string; start?: string; end?: string }
        ): Promise<any>;
    };
    bookingConfig: OnlineBookingConfig;
    cache?: AvailabilityDepsSpecial["cache"];
};

export class EventClientWriteService {
    /**
     * Elige un staff aplicando Weighted Smooth Round Robin
     * con hold temporal en Redis para evitar colisiones.
     */
    chooseStaffWithRR = async (
        idWorkspace: string,
        idBookingPage: string | undefined,
        idService: string,
        start: Date,
        end: Date,
        eligibles: string[],
        weightsMap: Record<string, number>
    ): Promise<string | null> => {
        if (!eligibles.length) return null;

        const rr = RedisStrategyFactory.getStrategy("roundRobin") as IRedisRoundRobinStrategy;

        // 1) Hold del slot (scoped por workspace + service)
        const acquired = await rr.acquireHold({
            idWorkspace,
            idService,
            startISO: start.toISOString(),
            endISO: end.toISOString(),
            ttlSec: TIME_SECONDS.MINUTE,
        });
        if (!acquired) return null; // otro proceso está reservando este mismo slot

        // 2) Weighted Smooth RR
        const chosen = await rr.pickWeightedSmoothRR({
            idWorkspace,
            idService,
            eligibles,
            weights: weightsMap,
            stateTTLSec: TIME_SECONDS.WEEK * 2,
        });

        if (!chosen) {
            await rr.releaseHold({
                idWorkspace,
                idService,
                startISO: start.toISOString(),
                endISO: end.toISOString(),
            });
            return null;
        }

        // Nota: el hold se mantiene hasta que completes/abortes la creación.
        return chosen;
    };

    /**
     * Crea o une a un evento de grupo (capacidad = maxParticipants del servicio).
     */
    async createOrJoinGroupEvent(
        tx: Prisma.TransactionClient,
        params: {
            idCompany: string;
            idWorkspace: string;
            idGroup?: string;
            seg: { serviceId: string; userId: string; start: moment.Moment; end: moment.Moment };
            svc: {
                id: string;
                name?: string | null;
                price?: number | null;
                discount?: number | null;
                duration?: number | null;
                maxParticipants?: number | null;
            };
            timeZoneWorkspace: string;
            note?: string | null;
            isCommentRead?: boolean;
            customer: { id: string; idClientWorkspace: string };
            autoConfirmClientBookings: boolean;
            eventSourceType: 'PLATFORM' | 'WEB' | 'WIDGET' | 'GOOGLE' | 'BOT';
        }
    ): Promise<{ event: Event; action: "created" | "joined" | "already-in" }> {
        const { idWorkspace, idCompany, seg, svc, timeZoneWorkspace, note, isCommentRead, customer, autoConfirmClientBookings, eventSourceType: EventSourceTypeFromParams } = params;
        const startDate = seg.start.toDate();
        const endDate = seg.end.toDate();
        const capacity = Math.max(1, svc.maxParticipants ?? 1);
        const isGroup = capacity > 1;

        // Determinar el estado según configuración
        const eventStatus = autoConfirmClientBookings ? 'ACCEPTED' : 'PENDING';
        const participantStatus = autoConfirmClientBookings ? 'ACCEPTED' : 'PENDING';
        const eventSourceType = EventSourceTypeFromParams ?? 'WEB';


        const CANCELLED_STATES = [
            'CANCELLED_BY_CLIENT',
            'CANCELLED_BY_CLIENT_REMOVED',
            "CANCELLED"
        ];

        // Lock por (pro+servicio+inicio)
        await tx.$executeRawUnsafe(
            `SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`,
            `${seg.userId}|${seg.serviceId}`,
            seg.start.toISOString()
        );

        // ¿Evento exacto ya existe?
        const existing = await tx.event.findFirst({
            where: {
                idServiceFk: seg.serviceId,
                idUserPlatformFk: seg.userId,
                startDate,
                endDate,
                groupEvents: { idWorkspaceFk: idWorkspace },
            },
            select: { id: true, idGroup: true },
        });

        if (existing) {
            // Individual
            if (!isGroup) {
                const same = await tx.eventParticipant.findFirst({
                    where: {
                        idGroup: existing.idGroup,
                        idClientWorkspaceFk: customer.idClientWorkspace,
                        deletedDate: null,
                    },
                    select: { id: true },
                });

                const ev = await tx.event.findUnique({
                    where: { id: existing.id },
                    include: { groupEvents: true },
                });
                if (same) return { event: ev!, action: "already-in" };
                throw new Error("Ese horario ya está ocupado.");
            }

            // Grupal
            const [count, already] = await Promise.all([
                tx.eventParticipant.count({
                    where: { idGroup: existing.idGroup, deletedDate: null },
                }),
                tx.eventParticipant.findFirst({
                    where: {
                        idGroup: existing.idGroup,
                        idClientWorkspaceFk: customer.idClientWorkspace,
                        deletedDate: null,
                    },
                    select: { id: true },
                }),
            ]);

            const ev = await tx.event.findUnique({
                where: { id: existing.id },
                include: { groupEvents: true },
            });

            if (already) return { event: ev!, action: "already-in" };
            if (count >= capacity) throw new Error("No quedan plazas disponibles en ese grupo.");

            await tx.eventParticipant.create({
                data: {
                    idGroup: existing.idGroup,
                    idClientFk: customer.id,
                    idClientWorkspaceFk: customer.idClientWorkspace,
                    eventStatusType: participantStatus,
                },
            });

            return { event: ev!, action: "joined" };
        }

        // Evitar solape con otros eventos del pro
        const overlappingOther = await tx.event.findFirst({
            where: {
                idUserPlatformFk: seg.userId,
                startDate: { lt: endDate },
                endDate: { gt: startDate },
                deletedDate: null,
                groupEvents: {
                    idWorkspaceFk: idWorkspace,
                    eventStatusType: {
                        notIn: CANCELLED_STATES as any,
                    },
                },
            },
            select: { id: true },
        });
        if (overlappingOther) throw new Error("Ese profesional ya tiene otro evento en ese horario.");

        let group = params.idGroup
            ? await tx.groupEvents.findUnique({ where: { id: params.idGroup } })
            : null;

        if (!group) {
            group = await tx.groupEvents.create({
                data: {
                    ...(params.idGroup ? { id: params.idGroup } : {}),
                    title: (svc.name ?? "Cita").slice(0, 100),
                    // startDate/endDate se sincronizan al final con los eventos reales del grupo
                    startDate,
                    endDate,
                    description: null,
                    idCompanyFk: idCompany,
                    idWorkspaceFk: idWorkspace,
                    commentClient: note ?? null,
                    isCommentRead: isCommentRead ?? false,
                    eventStatusType: eventStatus,
                    timeZone: timeZoneWorkspace,
                    eventParticipant: {
                        create: {
                            idClientFk: customer.id,
                            idClientWorkspaceFk: customer.idClientWorkspace,
                            eventStatusType: participantStatus,
                        },
                    },
                    eventSourceType,
                },
            });
        } else {
            const existingParticipant = await tx.eventParticipant.findFirst({
                where: {
                    idGroup: group.id,
                    idClientWorkspaceFk: customer.idClientWorkspace,
                    deletedDate: null,
                },
                select: { id: true },
            });
            if (!existingParticipant) {
                await tx.eventParticipant.create({
                    data: {
                        idGroup: group.id,
                        idClientFk: customer.id,
                        idClientWorkspaceFk: customer.idClientWorkspace,
                        eventStatusType: participantStatus,
                    },
                });
            }
        }

        // Crear evento nuevo
        const ev = await tx.event.create({
            data: {
                idCompanyFk: idCompany,
                idGroup: group.id,
                idServiceFk: seg.serviceId,
                idUserPlatformFk: seg.userId,
                startDate,
                endDate,
                title: svc.name ?? "Cita",
                description: null,
                eventPurposeType: "APPOINTMENT",

                serviceNameSnapshot: svc.name ?? null,
                servicePriceSnapshot: typeof svc.price === "number" ? svc.price : null,
                serviceDiscountSnapshot: typeof svc.discount === "number" ? svc.discount : null,
                serviceDurationSnapshot: typeof svc.duration === "number" ? svc.duration : null,
                serviceMaxParticipantsSnapshot: typeof svc.maxParticipants === "number" ? svc.maxParticipants : null,
            },
            include: { groupEvents: true },
        });

        await this._syncGroupStartEndDates(tx, group.id);

        return { event: ev as any, action: "created" };
    }

    private async _syncGroupStartEndDates(tx: Prisma.TransactionClient, idGroup: string): Promise<void> {
        const agg = await tx.event.aggregate({
            where: {
                idGroup,
                deletedDate: null,
            },
            _min: { startDate: true },
            _max: { endDate: true },
        });

        const startDate = agg._min?.startDate ?? null;
        const endDate = agg._max?.endDate ?? null;
        if (!startDate || !endDate) return;

        await tx.groupEvents.update({
            where: { id: idGroup },
            data: {
                startDate,
                endDate,
            },
        });
    }

    // ───────────────── helpers internos ─────────────────

    /**
     * Devuelve true si es exactamente un servicio y ese servicio es grupal (clase),
     * es decir, maxParticipants > 1.
     */
    private isSingleGroupFromWeb(
        attendees: AddFromWebInput["attendees"],
        serviceById: Record<string, { maxParticipants?: number | null }>
    ): boolean {
        if (attendees.length !== 1) return false;
        const svc = serviceById[attendees[0].serviceId];
        const maxP = Math.max(1, svc?.maxParticipants ?? 1);
        return maxP > 1;
    }

    /**
     * Devuelve true si TODOS los servicios son individuales
     * (maxParticipants <= 1 en todos).
     * Pueden ser uno o varios.
     */
    private isOnlyIndividualServicesFromWeb(
        attendees: AddFromWebInput["attendees"],
        serviceById: Record<string, { maxParticipants?: number | null }>
    ): boolean {
        if (!attendees.length) return false;
        return attendees.every((a) => {
            const svc = serviceById[a.serviceId];
            const maxP = Math.max(1, svc?.maxParticipants ?? 1);
            return maxP === 1;
        });
    }


    // ───────────────── addEventFromWeb ─────────────────

    async addEventFromWeb(input: AddFromWebInput, deps: AddFromWebDeps) {
        try {
            const {
                idCompany, idWorkspace, timeZoneClient, startLocalISO,
                attendees, excludeEventId, note, isCommentRead, customer,
                eventSourceType = 'WEB',
            } = input;
            const {
                timeZoneWorkspace, businessHoursService, workerHoursService,
                temporaryHoursService, bookingConfig, cache, autoConfirmClientBookings
            } = deps;

            console.log(CONSOLE_COLOR.FgMagenta, "[addEventFromWeb] input:", input, CONSOLE_COLOR.Reset);

            // ───────────── Validaciones básicas ─────────────
            if (!idCompany || !idWorkspace) throw new Error("Faltan idCompany/idWorkspace");
            if (!timeZoneWorkspace) throw new Error("Falta timeZoneWorkspace");
            if (!timeZoneClient) throw new Error("Falta timeZoneClient");
            if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(startLocalISO))
                throw new Error("startLocalISO debe ser YYYY-MM-DDTHH:mm:ss");
            if (!Array.isArray(attendees) || attendees.length === 0) throw new Error("attendees vacío");
            if (!customer?.id) throw new Error("Falta customer.id");
            if (!customer?.idClientWorkspace) throw new Error("Falta customer.idClientWorkspace");

            console.log(CONSOLE_COLOR.FgCyan, "[addEventFromWeb] startLocalISO:", startLocalISO, CONSOLE_COLOR.Reset);

            // ───────────── Conversión de fechas (cliente → workspace) ─────────────
            const startClient = moment.tz(startLocalISO, "YYYY-MM-DDTHH:mm:ss", timeZoneClient);
            if (!startClient.isValid()) throw new Error("startLocalISO inválido");

            const startWS = startClient.clone().tz(timeZoneWorkspace);
            const dateWS = startWS.format("YYYY-MM-DD");

            const todayWS = moment().tz(timeZoneWorkspace).startOf("day");
            if (startWS.clone().startOf("day").isBefore(todayWS, "day")) {
                console.log(CONSOLE_COLOR.BgRed, "[addEventFromWeb] Día pasado en TZ workspace", CONSOLE_COLOR.Reset);
                return { ok: false as const };
            }

            const { roundedNow, isToday } = computeSlotConfig({
                intervalMinutes: 5,
                timeZoneWorkspace,
                dayStartLocal: startWS.clone().startOf("day"),
            });

            if (isToday && startWS.isBefore(roundedNow)) {
                console.log(CONSOLE_COLOR.BgRed, "[addEventFromWeb] Hora pasada en TZ workspace", CONSOLE_COLOR.Reset);
                return { ok: false as const };
            }

            // ───────────── Elegibles por servicio (quién puede hacer el servicio) ─────────────
            const userIdsByService = new Map<string, string[]>();
            for (const a of attendees) {
                if (a.staffId) {
                    userIdsByService.set(a.serviceId, [a.staffId]);
                } else {
                    const users = await getUsersWhoCanPerformService_SPECIAL(
                        idWorkspace, a.serviceId, a.categoryId, cache
                    );
                    userIdsByService.set(a.serviceId, users);
                }
            }

            const allUserIds = Array.from(
                new Set(Array.from(userIdsByService.values()).flat())
            );
            if (allUserIds.length === 0) {
                console.log(CONSOLE_COLOR.BgRed, "[addEventFromWeb] No hay profesionales elegibles", CONSOLE_COLOR.Reset);
                return { ok: false as const };
            }

            // ───────────── Reglas del día (ventanas de trabajo reales por user) ─────────────
            const businessHours = await businessHoursService.getBusinessHoursFromRedis(idCompany, idWorkspace);
            const workerHoursMap = await workerHoursService.getWorkerHoursFromRedis(allUserIds, idWorkspace);
            const temporaryHoursMap = await temporaryHoursService.getTemporaryHoursFromRedis(
                allUserIds,
                idWorkspace,
                { date: dateWS }
            );

            const events = await getEventsOverlappingRange_SPECIAL(
                idWorkspace,
                allUserIds,
                dateWS,
                dateWS,
                excludeEventId
            );
            const eventsByUser = groupEventsByUser_SPECIAL(events);

            type MM = { start: moment.Moment; end: moment.Moment };
            const weekDay = startWS.format("dddd").toUpperCase() as any;

            const bizShifts: string[][] = (() => {
                const biz = (businessHours as any)?.[weekDay];
                return biz === null ? [] : Array.isArray(biz) ? biz : [];
            })();

            const shiftsByUserLocal: Record<string, MM[]> = {};
            for (const uid of allUserIds) {
                let workShifts: string[][] = [];
                const tmp = (temporaryHoursMap as any)?.[uid]?.[dateWS];

                if (tmp === null) workShifts = [];
                else if (Array.isArray(tmp) && tmp.length > 0) workShifts = tmp;
                else {
                    const workerDay = (workerHoursMap as any)?.[uid]?.[weekDay];
                    if (workerDay === null) workShifts = [];
                    else if (Array.isArray(workerDay) && workerDay.length > 0) workShifts = workerDay;
                    else workShifts = bizShifts;
                }

                shiftsByUserLocal[uid] = (workShifts || []).map(([s, e]) => ({
                    start: moment.tz(`${dateWS}T${s}`, "YYYY-MM-DDTHH:mm:ss", timeZoneWorkspace),
                    end: moment.tz(`${dateWS}T${e}`, "YYYY-MM-DDTHH:mm:ss", timeZoneWorkspace),
                }));
            }

            const freeWindowsByUser: Record<string, MM[]> = {};
            for (const uid of allUserIds) {
                const busy = (eventsByUser[uid] || []).map((ev) => ({
                    start: moment(ev.startDate).tz(timeZoneWorkspace),
                    end: moment(ev.endDate).tz(timeZoneWorkspace),
                }));

                const raw = shiftsByUserLocal[uid] || [];
                const free: MM[] = [];

                for (const sh of raw) {
                    const startClamped = isToday ? moment.max(sh.start, roundedNow) : sh.start.clone();
                    if (!startClamped.isBefore(sh.end)) continue;
                    free.push(...subtractBusyFromShift_SPECIAL(startClamped, sh.end, busy));
                }
                freeWindowsByUser[uid] = mergeTouchingWindows_SPECIAL(free);
            }

            // ───────────── Snapshot servicios (saber si es grupal / individual) ─────────────
            const serviceById = await _getServicesSnapshotById({ idCompany, idWorkspace, attendees });

            // Pesos RR (0–100; default 100)
            const rawIds = Array.isArray(bookingConfig?.resources?.ids)
                ? (bookingConfig!.resources!.ids as unknown as [string, number][])
                : [];

            const weightsMap: Record<string, number> = Object.fromEntries(
                rawIds.map(([id, w]) => [id, Number.isFinite(w) ? w : 100])
            );

            // ───────────── Clasificación (helpers nuevos) ─────────────
            const isSingleGroup = this.isSingleGroupFromWeb(attendees, serviceById);
            const onlyIndividual = this.isOnlyIndividualServicesFromWeb(attendees, serviceById);
            const isSingleIndividual = onlyIndividual && attendees.length === 1;
            const sharedGroupId =
                onlyIndividual && attendees.length > 1 ? uuidv4() : undefined;

            // Cuando hay más de un servicio (todos individuales) queremos un idGroup
            // que será EL ID DEL PRIMER EVENTO creado.
            // const shouldCreateGroupId = onlyIndividual && attendees.length > 1;

            let assignment: Array<{ serviceId: string; userId: string; start: moment.Moment; end: moment.Moment }> = [];

            // ───────────── PATH ESPECIAL: 1 servicio GRUPAL (clase) ─────────────
            if (isSingleGroup) {
                const svcReq = attendees[0];
                const svcSnap = serviceById[svcReq.serviceId];
                const dur = svcReq.durationMin ?? (svcSnap?.duration ?? 0);
                const endWS = startWS.clone().add(dur, "minutes");
                const elig = userIdsByService.get(svcReq.serviceId) ?? [];

                // 1) intentar UNIRSE a un evento existente por solape
                if (elig.length) {
                    const overlappingEvents = await prisma.event.findMany({
                        where: {
                            idServiceFk: svcReq.serviceId,
                            idUserPlatformFk: { in: elig },
                            startDate: { lt: endWS.toDate() },
                            endDate: { gt: startWS.toDate() },
                            groupEvents: {
                                idWorkspaceFk: idWorkspace,
                                eventStatusType: {
                                    notIn: ["CANCELLED", "CANCELLED_BY_CLIENT", "CANCELLED_BY_CLIENT_REMOVED"]
                                }
                            },
                            ...(excludeEventId ? { id: { not: excludeEventId } } : {}),
                            deletedDate: null,
                        },
                        orderBy: { startDate: "asc" },
                        select: {
                            id: true,
                            idUserPlatformFk: true,
                            startDate: true,
                            endDate: true,
                            groupEvents: {
                                select: {
                                    eventParticipant: {
                                        where: { deletedDate: null },
                                        select: { idClientFk: true, idClientWorkspaceFk: true },
                                    },
                                },
                            },
                        },
                    });

                    const pick = (() => {
                        if (!overlappingEvents.length) return null;
                        const exact = overlappingEvents.find(ev =>
                            moment(ev.startDate).isSame(startWS, "minute") &&
                            moment(ev.endDate).isSame(endWS, "minute")
                        );
                        if (exact) return exact;
                        return overlappingEvents
                            .map(ev => ({ ev, d: Math.abs(moment(ev.startDate).diff(startWS, "minutes")) }))
                            .sort((a, b) => a.d - b.d)[0].ev;
                    })();

                    if (pick && pick.idUserPlatformFk) {
                        const capacity = Math.max(1, svcSnap?.maxParticipants ?? 1);
                        const booked = pick.groupEvents?.eventParticipant?.length ?? 0;
                        const hasSeat = booked < capacity;

                        const alreadyIn = (pick.groupEvents?.eventParticipant ?? []).some(p =>
                            p.idClientFk === customer.id || p.idClientWorkspaceFk === customer.idClientWorkspace
                        );

                        if (hasSeat && !alreadyIn) {
                            assignment = [{
                                serviceId: svcReq.serviceId,
                                userId: pick.idUserPlatformFk,
                                start: startWS.clone().seconds(0).milliseconds(0),
                                end: endWS.clone().seconds(0).milliseconds(0),
                            }];
                        }
                    }
                }

                // 2) si no había evento con plazas, crear el primero con RR
                if (assignment.length === 0) {
                    const eligAvail = (userIdsByService.get(svcReq.serviceId) ?? []).filter(uid =>
                        (freeWindowsByUser[uid] ?? []).some(w =>
                            startWS.isSameOrAfter(w.start) && endWS.isSameOrBefore(w.end)
                        )
                    );

                    const chosen = await this.chooseStaffWithRR(
                        idWorkspace,
                        undefined, // idBookingPage (no lo tenemos aquí)
                        svcReq.serviceId,
                        startWS.toDate(),
                        endWS.toDate(),
                        eligAvail,
                        weightsMap
                    );
                    if (!chosen) {
                        console.log(CONSOLE_COLOR.BgRed, "[addEventFromWeb] Grupo: ningún pro disponible para el slot", CONSOLE_COLOR.Reset);
                        return { ok: false as const };
                    }
                    assignment = [{
                        serviceId: svcReq.serviceId,
                        userId: chosen,
                        start: startWS.clone().seconds(0).milliseconds(0),
                        end: endWS.clone().seconds(0).milliseconds(0),
                    }];
                }
            } else {
                // ───────────── PATH NORMAL (individuos) ─────────────

                if (isSingleIndividual) {
                    // RR para individual (sin backtracking)
                    const svcReq = attendees[0];
                    const dur = svcReq.durationMin ?? (serviceById[svcReq.serviceId]?.duration ?? 0);
                    const endWS = startWS.clone().add(dur, "minutes");

                    const eligAvail = (userIdsByService.get(svcReq.serviceId) ?? []).filter(uid =>
                        (freeWindowsByUser[uid] ?? []).some(w =>
                            startWS.isSameOrAfter(w.start) && endWS.isSameOrBefore(w.end)
                        )
                    );

                    const chosen = await this.chooseStaffWithRR(
                        idWorkspace,
                        undefined, // idBookingPage (no lo tenemos aquí)
                        svcReq.serviceId,
                        startWS.toDate(),
                        endWS.toDate(),
                        eligAvail,
                        weightsMap
                    );
                    if (!chosen) {
                        console.log(CONSOLE_COLOR.BgRed, "[addEventFromWeb] Individual: ningún pro disponible para el slot", CONSOLE_COLOR.Reset);
                        return { ok: false as const };
                    }

                    assignment = [{
                        serviceId: svcReq.serviceId,
                        userId: chosen,
                        start: startWS.clone().seconds(0).milliseconds(0),
                        end: endWS.clone().seconds(0).milliseconds(0),
                    }];
                } else {
                    // Multi-servicio → flujo actual (sin RR)
                    // Verificación previa
                    for (const svc of attendees) {
                        const elig = userIdsByService.get(svc.serviceId) ?? [];
                        const algunoTieneHueco = elig.some((uid) =>
                            (freeWindowsByUser[uid] ?? []).some(
                                (w) => w.end.diff(w.start, "minutes") >= svc.durationMin
                            )
                        );
                        if (!algunoTieneHueco) {
                            console.log(CONSOLE_COLOR.BgRed, "[addEventFromWeb] No hay hueco suficiente para al menos uno de los servicios.", CONSOLE_COLOR.Reset);
                            return { ok: false as const };
                        }
                    }

                    const eligibleUsersByService: Record<string, string[]> = {};
                    for (const a of attendees) {
                        eligibleUsersByService[a.serviceId] = userIdsByService.get(a.serviceId) ?? [];
                    }

                    const _assignment: typeof assignment = [];
                    const ok = assignSequentially_SPECIAL({
                        idx: 0,
                        start: startWS.clone().seconds(0).milliseconds(0),
                        attendees,
                        eligibleUsersByService,
                        freeWindowsByUser,
                        usedByUserAt: [],
                        assignment: _assignment,
                    });

                    if (!ok) {
                        console.log(CONSOLE_COLOR.BgRed, "[addEventFromWeb] El inicio elegido ya no está disponible (cambió la disponibilidad).", CONSOLE_COLOR.Reset);
                        return { ok: false as const };
                    }
                    assignment = _assignment;
                }
            }

            // ───────────── total/end para la respuesta ─────────────
            const totalDuration = attendees.reduce((acc, a) => acc + a.durationMin, 0);
            const endWS = startWS.clone().add(totalDuration, "minutes");

            // Helper local: extrae el "evento núcleo" de lo que devuelva createOrJoinGroupEvent
            function getCoreEvent(
                createdItem: any
            ): { id?: string; idGroup?: string | null } | null {
                if (!createdItem) return null;
                // Si viene como { event, notification }, usamos event
                if (createdItem.event) return createdItem.event as any;
                // Si viene ya como evento plano
                return createdItem as any;
            }



            // NUEVO: siempre asignamos idGroup a TODOS los eventos creados en este bloque,
            // usando el id del primero como booking code si no viene ya uno asignado.
            const created = await prisma.$transaction(async (tx) => {
                const eventsCreated: any[] = [];

                for (const seg of assignment) {
                    const svc = serviceById[seg.serviceId];
                    if (!svc) throw new Error("Servicio no disponible o no pertenece a este workspace.");

                    const result = await this.createOrJoinGroupEvent(tx, {
                        idWorkspace,
                        idCompany,
                        idGroup: sharedGroupId,
                        seg,
                        svc,
                        timeZoneWorkspace,
                        note,
                        isCommentRead,
                        customer: {
                            id: customer.id,
                            idClientWorkspace: customer.idClientWorkspace!,
                        },
                        autoConfirmClientBookings,
                        eventSourceType,
                        // ya no usamos shouldCreateGroupId aquí
                    });

                    eventsCreated.push(result);
                }

                // 🟢 SIEMPRE: asegurar idGroup tipo "booking code" para TODOS los eventos de este bloque
                const coreEvents = eventsCreated
                    .map((c) => getCoreEvent(c))
                    .filter((e) => e && typeof e.id === "string") as {
                        id: string;
                        idGroup?: string | null;
                    }[];

                if (coreEvents.length > 0) {
                    // Si ya viene idGroup del primero, lo respetamos.
                    // Si no, usamos su propio id como booking code.
                    const targetGroupId = coreEvents[0].idGroup ?? coreEvents[0].id;
                    const ids = coreEvents.map((e) => e.id);

                    await tx.event.updateMany({
                        where: { id: { in: ids } },
                        data: { idGroup: targetGroupId },
                    });

                    // Sincronizar copias en memoria
                    for (const item of eventsCreated) {
                        const ev = getCoreEvent(item);
                        if (ev && ids.includes(ev.id!)) {
                            ev.idGroup = targetGroupId;
                        }
                    }
                }

                return eventsCreated;
            });


            // Intentamos extraer un posible objeto notification retornado por createOrJoinGroupEvent
            const notifications = (created as any[])
                .map((c) => c?.notification)
                .filter((n) => !!n);

            const primaryNotification = notifications[0] ?? null;

            // Para devolver idGroup en la respuesta
            const coreEventsForGroup = created
                .map((c) => getCoreEvent(c))
                .filter((e) => e && typeof e.id === "string") as {
                    id: string;
                    idGroup?: string | null;
                }[];

            // const groupId =
            //     shouldCreateGroupId && coreEventsForGroup.length > 0
            //         ? coreEventsForGroup[0].idGroup ?? coreEventsForGroup[0].id
            //         : null;

            const groupId =
                coreEventsForGroup.length > 0
                    ? coreEventsForGroup[0].idGroup ?? coreEventsForGroup[0].id
                    : null;

            return {
                ok: true as const,
                appointment: {
                    startLocalISO: startWS.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
                    endLocalISO: endWS.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
                    timeZoneClient,
                    timeZoneWorkspace,
                    totalDurationMin: totalDuration,
                },
                assignments: assignment.map((a) => ({
                    serviceId: a.serviceId,
                    userId: a.userId,
                    startUTC: a.start.toISOString(),
                    endUTC: a.end.toISOString(),
                    startLocalClient: a.start.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
                    endLocalClient: a.end.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
                })),
                created,
                // Nuevo: devolvemos también el objeto notification (si existe)
                notification: primaryNotification,
                notifications,
                // OLD = Para que el front pueda saber si es multi-servicio agrupado
                // NUEVO = siempre devolvemos idGroup si existe, funciona como un idBooking
                idGroup: groupId,
            };
        } catch (error: any) {
            console.error("Error en EventV2Service:", error);
            throw new CustomError("Error al crear evento", error);
        }
    }

}
