// // // middlewares/booking-guards.middleware.ts
// import type { Request, Response, NextFunction } from "express";
// import moment from "moment-timezone";
// import { CONSOLE_COLOR } from "../../constant/console-color";
// import prisma from "../../lib/prisma";
// import CustomError from "../../models/custom-error/CustomError";
// import { IRedisBookingPageBriefStrategy, IRedisSavedWorkspaceStrategy, IRedisWorkspaceBriefStrategy } from "../../services/@redis/cache/interfaces/interfaces";
// import { RedisStrategyFactory } from "../../services/@redis/cache/strategies/redisStrategyFactory";
// 
// import { BookingPageStatusType } from "../../services/@redis/cache/interfaces/models/booking-brief";
// import { getBookingPageByIds } from "../../services/@service-token-client/api-ms/bookingPage.ms";
// import { TIME_SECONDS } from "../../constant/time";
// import { getWorkspacesByIds } from "../../services/@service-token-client/api-ms/auth.ms";
// import { createClientWorkspaceByClientAndWorkspace, getClientWorkspacesByClientIds, getClientWorkspacesByIds } from "../../services/@service-token-client/api-ms/client.ms";
// import { config } from "googleapis/build/src/apis/config";
// import { ClientBrief, ClientWorkspaceBrief } from "../../services/@redis/cache/interfaces/models/client-brief";
// import { Response as ResponseBuild } from "../../models/messages/response";

// // Ajusta rutas de import a tu proyecto:

// export type AttendeeInput = {
//     serviceId: string;
//     durationMin: number;
//     staffId?: string | null;
//     categoryId?: string | null;
// };

// export type BookingInputNormalized = {
//     idCompany: string;
//     idWorkspace: string;
//     idBookingPage: string;
//     startLocalISO: string; // "YYYY-MM-DDTHH:mm:ss"
//     timeZoneClient: string;
//     attendees: AttendeeInput[];
//     excludeEventId?: string;
//     note?: string;
//     customer: {
//         id: string;
//         name?: string;
//         phone?: string;
//         email?: string;
//     };
// };

// // Config del workspace, si no tienes tipado pon `any`
// export type BookingConfig = any;

// export type BookingCtx = {
//     input?: BookingInputNormalized;

//     workspace?: any;
//     bookingPage?: any;
//     config?: BookingConfig;
//     timeZoneWorkspace?: string;

//     when?: {
//         startClient: moment.Moment;
//         startWS: moment.Moment;
//         endWS?: moment.Moment;
//         dateWS: string;              // "YYYY-MM-DD"
//         isToday: boolean;
//         roundedNow?: moment.Moment;
//     };

//     customer?: { idClient: string; idClientWorkspace: string };

//     limitsCheck?: {
//         perUserPerDayOk: boolean;
//         perUserConcurrentOk: boolean;
//         reasons: string[];
//     };

//     features?: {
//         enforceResourcesAllowlist: boolean;
//         paymentsGate: boolean;
//         idempotency: boolean;
//     };

//     idempotencyKey?: string;
//     auditNotes?: string[];
// };

// declare module "express-serve-static-core" {
//     interface Request {
//         booking?: { ctx: BookingCtx };
//         userInfo?: { ip: string; referrer?: string };
//     }
// }

// export class BookingGuardsMiddleware {
//     /* helper uniforme para 4xx */
//     // private static endBadRequest(
//     //     res: Response,
//     //     status: number,
//     //     message: string,
//     //     where: string,
//     //     error?: unknown
//     // ) {
//     //     if (error) {
//     //         console.error(
//     //             CONSOLE_COLOR.BgRed,
//     //             `[${where}]`,
//     //             message,
//     //             error instanceof Error ? error.message : error,
//     //             CONSOLE_COLOR.Reset
//     //         );
//     //     } else {
//     //         console.warn(CONSOLE_COLOR.BgYellow, `[${where}] ${message}`, CONSOLE_COLOR.Reset);
//     //     }
//     //     return res.status(status).json({ message });
//     // }

//     private static endBadRequest(
//         res: Response,
//         status: number,
//         message: string,
//         where: string,
//         error?: unknown
//     ) {
//         // Mapeo de códigos por origen del error
//         const ERROR_CODES_BY_WHERE: Record<string, string> = {
//             "BookingGuards.BaseValidation": "100",
//             "BookingGuards.ResolveWorkspace": "110",
//             "BookingGuards.ResolveBookingPage": "120",
//             "BookingGuards.ResolveClientWorkspace": "130",
//             "BookingGuards.EnforceTimeRules": "140",
//             "BookingGuards.EnforceUserLimits": "150",
//             "BookingGuards.FeatureFlagsAndIdempotency": "160",
//             "BookingGuards.BaseContextSimple": "170",
//         };

//         // Código numérico (como string) asociado al `where`
//         const code = ERROR_CODES_BY_WHERE[where] ?? "199";

//         if (error) {
//             console.error(
//                 CONSOLE_COLOR.BgRed,
//                 `[${where}]`,
//                 `code=${code}`,
//                 message,
//                 error instanceof Error ? error.message : error,
//                 CONSOLE_COLOR.Reset
//             );
//         } else {
//             console.warn(
//                 CONSOLE_COLOR.BgYellow,
//                 `[${where}] code=${code} ${message}`,
//                 CONSOLE_COLOR.Reset
//             );
//         }

//         return res
//             .status(status)
//             .json(
//                 ResponseBuild.build(
//                     message,
//                     status,
//                     false,     // ok
//                     null,      // item (en error lo dejamos null)
//                     code       // code numérico (string)
//                 )
//             );
//     }


//     /* ─────────────────────────────────────
//        1) INPUT: valida + normaliza (ctx.input)
//     ────────────────────────────────────── */
//     static BaseValidationAndNormalize() {
//         return (req: Request, res: Response, next: NextFunction) => {
//             try {
//                 const p = req.body ?? {};


//                 // console.log("mira que es p", p);
//                 console.log("mira que es p cuando editas", p);

//                 if (!p?.idCompany || !p?.idWorkspace || !p?.idBookingPage) {
//                     return this.endBadRequest(res, 400, "Faltan idCompany o idWorkspace o idBookingPage", "BookingGuards.BaseValidation");
//                 }


//                 const hasNew =
//                     typeof p?.startLocalISO === "string" &&
//                     /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(p.startLocalISO) &&
//                     typeof p?.timeZoneClient === "string";

//                 const hasLegacy =
//                     typeof p?.date === "string" &&
//                     /^\d{4}-\d{2}-\d{2}$/.test(p.date) &&
//                     typeof p?.timezone === "string" &&
//                     (p?.time ? /^\d{2}:\d{2}$/.test(p.time) : true);

//                 if (!hasNew && !hasLegacy) {
//                     return this.endBadRequest(
//                         res,
//                         400,
//                         "Faltan parámetros de tiempo: usa startLocalISO + timeZoneClient o bien date(+time) + timezone",
//                         "BookingGuards.BaseValidation"
//                     );
//                 }

//                 const startLocalISO = hasNew ? p.startLocalISO : `${p.date}T${(p.time ?? "00:00")}:00`;
//                 const timeZoneClient = hasNew ? p.timeZoneClient : p.timezone;

//                 if (!Array.isArray(p.attendees) || p.attendees.length === 0) {
//                     return this.endBadRequest(res, 400, "attendees vacío", "BookingGuards.BaseValidation");
//                 }

//                 for (let i = 0; i < p.attendees.length; i++) {
//                     const a = p.attendees[i];
//                     if (!a?.serviceId) {
//                         return this.endBadRequest(res, 400, `attendees[${i}].serviceId es requerido`, "BookingGuards.BaseValidation");
//                     }
//                     if (typeof a?.durationMin !== "number" || a.durationMin <= 0) {
//                         return this.endBadRequest(
//                             res,
//                             400,
//                             `attendees[${i}].durationMin debe ser > 0`,
//                             "BookingGuards.BaseValidation"
//                         );
//                     }
//                 }

//                 // if (!p?.customer?.id) {
//                 //     return this.endBadRequest(res, 400, "Falta id en customer", "BookingGuards.BaseValidation");
//                 // }

//                 const input = {
//                     idCompany: p.idCompany,
//                     idWorkspace: p.idWorkspace,
//                     idBookingPage: p.idBookingPage,
//                     startLocalISO,
//                     timeZoneClient,
//                     attendees: p.attendees.map((a: any) => ({
//                         serviceId: a.serviceId,
//                         durationMin: a.durationMin,
//                         staffId: a.staffId ?? null,
//                         categoryId: a.categoryId ?? null,
//                     })),
//                     excludeEventId: p?.excludeEventId,
//                     note: p?.note,
//                     isCommentRead: p?.isCommentRead,
//                     customer: {
//                         id: p?.customer?.id,
//                         name: p?.customer?.name,
//                         phone: p?.customer?.phone,
//                         email: p?.customer?.email,
//                     },
//                     // Usado en editar reservas
//                     idEvent: p?.idEvent,
//                     deletedEventIds: p?.deletedEventIds,
//                 };

//                 req.booking = { ctx: { input } };
//                 return next();
//             } catch (error: any) {
//                 return this.endBadRequest(res, 400, "Bad request", "BookingGuards.BaseValidation", error);
//             }
//         };
//     }


//     /* ─────────────────────────────────────
//        2) WORKSPACE: cache/RPC + tz + config
//     ────────────────────────────────────── */
//     static ResolveWorkspace() {
//         return async (req: Request, res: Response, next: NextFunction) => {
//             try {

//                 const ctx = req.booking!.ctx;
//                 const { idWorkspace } = ctx.input;
//                 // console.log("resolviendo workspace para idWorkspace", idWorkspace);
//                 const workspaceBriefStrategy = RedisStrategyFactory.getStrategy("workspaceBrief") as IRedisWorkspaceBriefStrategy;
//                 let workspace: any = await workspaceBriefStrategy.getWorkspaceById(idWorkspace);
//                 console.log("buscando workspace en cache");
//                 // let workspace = null;
//                 if (!workspace) {
//                     // const rpcRes: any = await RPC.getEstablishmentByIdForFlow(idWorkspace);
//                     const workspaceRes = await getWorkspacesByIds([idWorkspace]);
//                     console.log("buscando workspace en DB");
//                     workspace = workspaceRes?.[0] ?? null;
//                     if (workspace?.id) {
//                         // await savedWorkspace.setSavedWorkspaceByIdWorkspace(workspace.id, workspace, 60 * 60);
//                         await workspaceBriefStrategy.setWorkspace(workspace, TIME_SECONDS.HOUR);

//                     }
//                 }

//                 console.log("mira que es workspace", workspace?.id);
//                 if (!workspace?.timeZone) {
//                     return this.endBadRequest(res, 400, "No se pudo resolver el timezone del workspace", "BookingGuards.ResolveWorkspace");
//                 }

//                 // console.log("esto es workspace", workspace);

//                 ctx.workspace = workspace;
//                 // tu config vive en workspace.config (o bookingConfig según casos)
//                 ctx.config = workspace?.config || workspace?.generalConfigJson || {};
//                 ctx.timeZoneWorkspace = workspace.timeZone;

//                 return next();
//             } catch (error: any) {
//                 return next(new CustomError("BookingGuards.ResolveWorkspace", error));
//             }
//         };
//     }

//     /* ─────────────────────────────────────
//     2.5) BookingPage Obtiene la configuración específica de la página de reservas
//  ────────────────────────────────────── */
//     static ResolveBookingPage() {
//         return async (req: Request, res: Response, next: NextFunction) => {
//             try {
//                 const ctx = req.booking!.ctx;
//                 const { idBookingPage } = ctx.input;




//                 const bookingPageStrategy = RedisStrategyFactory.getStrategy("bookingPageBrief") as IRedisBookingPageBriefStrategy;
//                 let bp = await bookingPageStrategy.getBookingPageById(idBookingPage);
//                 if (!bp) {
//                     console.log("no está en cache, voy a buscarlo rpc");
//                     // const rpcRes: any = await RPC.getEstablishmentByIdForFlow(idBookingPage);
//                     const briefResponse = await getBookingPageByIds([idBookingPage], ctx.input.idWorkspace);
//                     bp = briefResponse?.[0] ?? null;
//                     if (bp?.id) {
//                         // await savedWorkspace.setSavedWorkspaceByIdWorkspace(workspace.id, workspace, 60);
//                         await bookingPageStrategy.setBookingPage(bp, TIME_SECONDS.HOUR);
//                     }
//                 }
//                 console.log("mira que es bp2", bp?.id);

//                 // TODO: Esto ya no lo tendran los bookingPages publicados
//                 // if (bp?.bookingPageStatusType !== ("PUBLISHED" as BookingPageStatusType)) {
//                 //     return this.endBadRequest(res, 400, "La página de reservas no está publicada", "BookingGuards.ResolveBookingPage");
//                 // }


//                 // console.log("esto es bookingPage", bp);
//                 ctx.bookingPage = bp;
//                 // ctx.config = bp?.bookingPageConfJson ?? {};

//                 return next();
//             } catch (error: any) {
//                 return next(new CustomError("BookingGuards.ResolveWorkspace", error));
//             }
//         };
//     }

//     /* ─────────────────────────────────────
//        3) CLIENTE EN WORKSPACE (RPC)
//     ────────────────────────────────────── */
//     static ResolveClientWorkspace() {
//         return async (req: Request, res: Response, next: NextFunction) => {
//             try {
//                 const ctx = req.booking!.ctx;
//                 const { idWorkspace, customer, idCompany } = ctx.input;

//                 // console.log("mira el workspace id que llega", idWorkspace);
//                 // console.log("mira el customer id que llega", customer?.id);

//                 if (!customer?.id) {
//                     return this.endBadRequest(res, 400, "No se pudo resolver el cliente", "BookingGuards.ResolveClientWorkspace");
//                 }

//                 if (!idWorkspace) {
//                     return this.endBadRequest(res, 400, "No se pudo resolver el workspace", "BookingGuards.ResolveClientWorkspace");
//                 }

//                 // Usar el cliente MS en lugar del RPC
//                 const list = await getClientWorkspacesByClientIds([customer?.id], idWorkspace);
//                 let clientWorkspaceBrief: ClientWorkspaceBrief = null;
//                 console.log("mira que es list", list);
//                 if (!list || list.length === 0) {
//                     console.log(`${CONSOLE_COLOR.BgYellow}[BookingGuards.ResolveClientWorkspace] No existe clientWorkspace, se crea uno nuevo${CONSOLE_COLOR.Reset}`);
//                     const result = await createClientWorkspaceByClientAndWorkspace(customer.id, idWorkspace);
//                     console.log("mira que es result", result);
//                     clientWorkspaceBrief = result;
//                 } else {
//                     clientWorkspaceBrief = list[0];
//                 }

//                 console.log(`${CONSOLE_COLOR.BgGray}[BookingGuards.ResolveClientWorkspace] Cliente workspace obtenido o creado${CONSOLE_COLOR.Reset}`, clientWorkspaceBrief);

//                 if (!clientWorkspaceBrief || !clientWorkspaceBrief.id) {
//                     console.log(`${CONSOLE_COLOR.BgRed}[BookingGuards.ResolveClientWorkspace] No se pudo resolver el cliente en el workspace${CONSOLE_COLOR.Reset}`);
//                     return this.endBadRequest(res, 400, "No se pudo resolver el cliente en el workspace", "BookingGuards.ResolveClientWorkspace");
//                 }

//                 if (clientWorkspaceBrief?.isBanned) {
//                     console.log(`${CONSOLE_COLOR.BgRed}[BookingGuards.ResolveClientWorkspace] El cliente está baneado en el workspace${CONSOLE_COLOR.Reset}`);
//                     return this.endBadRequest(res, 400, "El cliente está baneado en el workspace", "BookingGuards.ResolveClientWorkspace");
//                 }

//                 if (clientWorkspaceBrief?.client?.isBanned) {
//                     console.log(`${CONSOLE_COLOR.BgRed}[BookingGuards.ResolveClientWorkspace] El cliente está baneado en el workspace${CONSOLE_COLOR.Reset}`);
//                     return this.endBadRequest(res, 400, "El cliente está baneado en el workspace", "BookingGuards.ResolveClientWorkspace");
//                 }

//                 console.log(`${CONSOLE_COLOR.BgYellow}[BookingGuards.ResolveClientWorkspace] Cliente resuelto en workspace${CONSOLE_COLOR.Reset}`);
//                 console.log("mira que es customer", customer);
//                 console.log("mira que es idWorkspace", idWorkspace);

//                 // console.log(`${CONSOLE_COLOR.BgMagenta}[BookingGuards.ResolveClientWorkspace] Lista de clientWorkspaces obtenida:${CONSOLE_COLOR.Reset}`, list);
//                 // const clientWorkspace = list[0];
//                 ctx.customer = {
//                     idClient: clientWorkspaceBrief.idClientFk || customer.id,
//                     idClientWorkspace: clientWorkspaceBrief.id
//                 };

//                 console.log(`${CONSOLE_COLOR.BgGreen}[BookingGuards.ResolveClientWorkspace] Cliente resuelto en workspace${CONSOLE_COLOR.Reset}`, ctx.customer);

//                 return next();
//             } catch (error: any) {
//                 return next(new CustomError("BookingGuards.ResolveClientWorkspace", error));
//             }
//         };
//     }


//     /* ─────────────────────────────────────
//        4) REGLAS DE TIEMPO (ventana / lead times)
//     ────────────────────────────────────── */
//     static EnforceTimeRules() {
//         return (req: Request, res: Response, next: NextFunction) => {
//             try {
//                 const ctx = req.booking!.ctx;
//                 const { startLocalISO, timeZoneClient, attendees } = ctx.input;
//                 const tzWS = ctx.timeZoneWorkspace!;

//                 const startClient = moment.tz(startLocalISO, "YYYY-MM-DDTHH:mm:ss", timeZoneClient);
//                 if (!startClient.isValid()) {
//                     return this.endBadRequest(res, 400, "startLocalISO inválido", "BookingGuards.EnforceTimeRules");
//                 }

//                 const startWS = startClient.clone().tz(tzWS);
//                 const nowWS = moment().tz(tzWS);
//                 const dateWS = startWS.format("YYYY-MM-DD");
//                 const isToday = startWS.isSame(nowWS, "day");

//                 // Config ventana de reserva
//                 const bw = (ctx.config?.bookingWindow ?? {}) as {
//                     minLeadTimeMin?: number;
//                     maxAdvanceDays?: number;
//                     sameDayCutoffHourLocal?: number;
//                 };

//                 console.log("mira que es bw", bw);

//                 const minLead = Math.max(0, bw.minLeadTimeMin ?? 0);
//                 const maxAdv = Math.max(0, bw.maxAdvanceDays ?? 365);
//                 const cutoff = bw.sameDayCutoffHourLocal;

//                 // No días pasados
//                 if (startWS.clone().startOf("day").isBefore(nowWS.clone().startOf("day"))) {
//                     return this.endBadRequest(res, 400, "El día seleccionado ya ha pasado en el huso horario del negocio.", "BookingGuards.EnforceTimeRules");
//                 }
//                 // // Lead time
//                 if (startWS.isBefore(nowWS.clone().add(minLead, "minutes"))) {
//                     return this.endBadRequest(res, 400, "La hora seleccionada ya no está disponible por lead time.", "BookingGuards.EnforceTimeRules");
//                 }

//                 // Max advance
//                 if (startWS.isAfter(nowWS.clone().add(maxAdv, "days").endOf("day"))) {
//                     return this.endBadRequest(res, 400, "Fuera de la ventana de reserva permitida.", "BookingGuards.EnforceTimeRules");
//                 }
//                 // Cutoff mismo día (si se usa)
//                 //   TODO: Completamente innecesario, seguramente se elimine en el futuro
//                 // if (isToday && typeof cutoff === "number" && nowWS.hour() >= cutoff) {
//                 //     return this.endBadRequest(res, 400, "Las reservas para hoy ya no están disponibles.", "BookingGuards.EnforceTimeRules");
//                 // }

//                 const totalDuration = attendees.reduce((acc: number, a: any) => acc + (a?.durationMin ?? 0), 0);
//                 const endWS = startWS.clone().add(totalDuration, "minutes");

//                 ctx.when = { startClient, startWS, endWS, dateWS, isToday, roundedNow: nowWS };
//                 return next();
//             } catch (error: any) {
//                 return next(new CustomError("BookingGuards.EnforceTimeRules", error));
//             }
//         };
//     }

//     /* ─────────────────────────────────────
//        5) LÍMITES POR USUARIO (día / concurrentes)
//     ────────────────────────────────────── */
//     // static EnforceUserLimits() {
//     //     return async (req: Request, res: Response, next: NextFunction) => {
//     //         try {
//     //             const ctx = req.booking!.ctx;

//     //             // ---- Limits con defaults seguros
//     //             const lim = (ctx.config?.limits ?? {}) as {
//     //                 perUserPerDay?: number;
//     //                 perUserConcurrent?: number;
//     //                 maxServicesPerBooking?: number;
//     //             };

//     //             // Si no lo configuras, aplicamos estas políticas por defecto:
//     //             const maxServicesPerBooking = Number.isFinite(lim.maxServicesPerBooking)
//     //                 ? Number(lim.maxServicesPerBooking)
//     //                 : 1; // ⬅️ por defecto, 1 servicio por reserva

//     //             const perUserPerDay = Number.isFinite(lim.perUserPerDay)
//     //                 ? Number(lim.perUserPerDay)
//     //                 : 1; // ⬅️ por defecto, 1 cita al día

//     //             const perUserConcurrent = Number.isFinite(lim.perUserConcurrent)
//     //                 ? Number(lim.perUserConcurrent)
//     //                 : 0; // 0 = sin límite concurrente por defecto

//     //             // ---- (A) Chequeo: servicios por reserva
//     //             const servicesCount = ctx.input.attendees.length;
//     //             if (maxServicesPerBooking > 0 && servicesCount > maxServicesPerBooking) {
//     //                 return this.endBadRequest(
//     //                     res,
//     //                     400,
//     //                     `Solo se permiten ${maxServicesPerBooking} servicio(s) por reserva.`,
//     //                     "BookingGuards.EnforceUserLimits"
//     //                 );
//     //             }

//     //             // Si no tenemos cliente o ventana temporal calculada, continúa
//     //             if (!ctx.customer || !ctx.when) {
//     //                 return next();
//     //             }

//     //             const { idClientWorkspace } = ctx.customer;
//     //             const slotStartWS = ctx.when.startWS.clone();
//     //             const slotEndWS = ctx.when.endWS!.clone();

//     //             // Rangos día en WS → a UTC para query
//     //             const dayStartUTC = slotStartWS.clone().startOf("day").utc().toDate();
//     //             const dayEndUTC = slotStartWS.clone().endOf("day").utc().toDate();

//     //             const slotStartUTC = slotStartWS.clone().utc().toDate();
//     //             const slotEndUTC = slotEndWS.clone().utc().toDate();

//     //             const reasons: string[] = [];

//     //             // ---- (B) Chequeo: límite de citas por día
//     //             if (perUserPerDay > 0) {
//     //                 const countDay = await prisma.eventParticipant.count({
//     //                     where: {
//     //                         idClientWorkspaceFk: idClientWorkspace,
//     //                         deletedDate: null,
//     //                         event: {
//     //                             deletedDate: null,
//     //                             startDate: { lt: dayEndUTC },
//     //                             endDate: { gt: dayStartUTC },
//     //                         },
//     //                     },
//     //                 });

//     //                 if (countDay >= perUserPerDay) {
//     //                     reasons.push(`Has alcanzado el máximo de citas por día (${countDay}/${perUserPerDay}).`);
//     //                 }
//     //             }

//     //             // ---- (C) Chequeo: solapes concurrentes (opcional)
//     //             if (perUserConcurrent > 0) {
//     //                 const overlappingCount = await prisma.eventParticipant.count({
//     //                     where: {
//     //                         idClientWorkspaceFk: idClientWorkspace,
//     //                         deletedDate: null,
//     //                         event: {
//     //                             deletedDate: null,
//     //                             startDate: { lt: slotEndUTC },
//     //                             endDate: { gt: slotStartUTC },
//     //                         },
//     //                     },
//     //                 });

//     //                 if (overlappingCount >= perUserConcurrent) {
//     //                     reasons.push(`Límite de reservas simultáneas alcanzado (${overlappingCount}/${perUserConcurrent}).`);
//     //                 }
//     //             }

//     //             if (reasons.length > 0) {
//     //                 // 409: reglas del negocio infringidas
//     //                 return this.endBadRequest(res, 409, reasons.join(" "), "BookingGuards.EnforceUserLimits");
//     //             }

//     //             return next();
//     //         } catch (error: any) {
//     //             return next(new CustomError("BookingGuards.EnforceUserLimits", error));
//     //         }
//     //     };
//     // }

//     static EnforceUserLimits() {
//         return async (req: Request, res: Response, next: NextFunction) => {
//             try {
//                 const ctx = req.booking!.ctx;

//                 // ---- Limits con defaults seguros
//                 const lim = (ctx.config?.limits ?? {}) as {
//                     perUserPerDay?: number;
//                     perUserConcurrent?: number;
//                     maxServicesPerBooking?: number;
//                 };

//                 // console.log(`${CONSOLE_COLOR.FgCyan}[BookingGuards.EnforceUserLimits] ${ctx?.config}${CONSOLE_COLOR.Reset}`);

//                 // Si no lo configuras, aplicamos estas políticas por defecto:
//                 const maxServicesPerBooking = Number.isFinite(lim.maxServicesPerBooking)
//                     ? Number(lim.maxServicesPerBooking)
//                     : 1; // ⬅️ por defecto, 1 servicio por reserva

//                 const perUserPerDay = Number.isFinite(lim.perUserPerDay)
//                     ? Number(lim.perUserPerDay)
//                     : 1; // ⬅️ por defecto, 1 reserva al día

//                 const perUserConcurrent = Number.isFinite(lim.perUserConcurrent)
//                     ? Number(lim.perUserConcurrent)
//                     : 0; // 0 = sin límite concurrente por defecto

//                 // ---- (A) Chequeo: servicios por reserva
//                 const servicesCount = ctx.input.attendees.length;
//                 if (maxServicesPerBooking > 0 && servicesCount > maxServicesPerBooking) {
//                     return this.endBadRequest(
//                         res,
//                         400,
//                         `Solo se permiten ${maxServicesPerBooking} servicio(s) por reserva.`,
//                         "BookingGuards.EnforceUserLimits"
//                     );
//                 }

//                 // Si no tenemos cliente o ventana temporal calculada, continúa
//                 if (!ctx.customer || !ctx.when) {
//                     return next();
//                 }

//                 const { idClientWorkspace } = ctx.customer;
//                 const slotStartWS = ctx.when.startWS.clone();
//                 const slotEndWS = ctx.when.endWS!.clone();

//                 // Rangos día en WS → a UTC para query
//                 const dayStartUTC = slotStartWS.clone().startOf("day").utc().toDate();
//                 const dayEndUTC = slotStartWS.clone().endOf("day").utc().toDate();

//                 const slotStartUTC = slotStartWS.clone().utc().toDate();
//                 const slotEndUTC = slotEndWS.clone().utc().toDate();

//                 const reasons: string[] = [];

//                 // Helper para calcular el identificador de "reserva" (booking)
//                 const bookingKeyFromEvent = (ev: { id: string; idGroup: string | null }) =>
//                     ev.idGroup ? `g:${ev.idGroup}` : `e:${ev.id}`;

//                 // ---- (B) Chequeo: límite de reservas por día (NO por servicios)
//                 if (perUserPerDay > 0) {
//                     const dayParticipations = await prisma.eventParticipant.findMany({
//                         where: {
//                             idClientWorkspaceFk: idClientWorkspace,
//                             deletedDate: null,
//                             event: {
//                                 deletedDate: null,
//                                 startDate: { lt: dayEndUTC },
//                                 endDate: { gt: dayStartUTC },
//                             },
//                         },
//                         select: {
//                             event: {
//                                 select: {
//                                     id: true,
//                                     idGroup: true,
//                                 },
//                             },
//                         },
//                     });

//                     const bookingIdsDay = new Set<string>();

//                     for (const p of dayParticipations) {
//                         const ev = p.event;
//                         if (!ev) continue;
//                         bookingIdsDay.add(bookingKeyFromEvent(ev));
//                     }

//                     const countDayBookings = bookingIdsDay.size;

//                     if (countDayBookings >= perUserPerDay) {
//                         reasons.push(
//                             `Has alcanzado el máximo de reservas por día (${countDayBookings}/${perUserPerDay}).`
//                         );
//                     }
//                 }

//                 // ---- (C) Chequeo: límite de reservas simultáneas (NO por servicios)
//                 if (perUserConcurrent > 0) {
//                     const overlappingParticipations = await prisma.eventParticipant.findMany({
//                         where: {
//                             idClientWorkspaceFk: idClientWorkspace,
//                             deletedDate: null,
//                             event: {
//                                 deletedDate: null,
//                                 startDate: { lt: slotEndUTC },
//                                 endDate: { gt: slotStartUTC },
//                             },
//                         },
//                         select: {
//                             event: {
//                                 select: {
//                                     id: true,
//                                     idGroup: true,
//                                 },
//                             },
//                         },
//                     });

//                     const bookingIdsOverlap = new Set<string>();

//                     for (const p of overlappingParticipations) {
//                         const ev = p.event;
//                         if (!ev) continue;
//                         bookingIdsOverlap.add(bookingKeyFromEvent(ev));
//                     }

//                     const overlappingBookings = bookingIdsOverlap.size;

//                     if (overlappingBookings >= perUserConcurrent) {
//                         reasons.push(
//                             `Límite de reservas simultáneas alcanzado (${overlappingBookings}/${perUserConcurrent}).`
//                         );
//                     }
//                 }

//                 if (reasons.length > 0) {
//                     // 409: reglas del negocio infringidas
//                     return this.endBadRequest(
//                         res,
//                         409,
//                         reasons.join(" "),
//                         "BookingGuards.EnforceUserLimits"
//                     );
//                 }

//                 return next();
//             } catch (error: any) {
//                 return next(new CustomError("BookingGuards.EnforceUserLimits", error));
//             }
//         };
//     }


//     /* ─────────────────────────────────────
//        6) (Opcional) Feature flags + Idempotencia
//     ────────────────────────────────────── */
//     static FeatureFlagsAndIdempotency() {
//         return async (req: Request, _res: Response, next: NextFunction) => {
//             try {
//                 const ctx = req.booking!.ctx;
//                 // Flags simples (extiende si quieres)
//                 ctx.features = {
//                     enforceResourcesAllowlist: !!ctx.config?.resources?.mode,
//                     paymentsGate: ctx.config?.payments?.required === true,
//                     idempotency: true,
//                 };

//                 // Clave idempotencia
//                 ctx.idempotencyKey = [
//                     ctx.input.idWorkspace,
//                     ctx.input.customer.id,
//                     ctx.input.startLocalISO,
//                     ...ctx.input.attendees.map(a => `${a.serviceId}:${a.durationMin}:${a.staffId ?? "any"}`)
//                 ].join("|");

//                 // TODO: aquí podrías consultar un Redis para rechazar duplicados a corto plazo
//                 // TODO: Mandar al LOG (audit): intento de reserva con idempotencyKey

//                 return next();
//             } catch (error: any) {
//                 return next(new CustomError("BookingGuards.FeatureFlagsAndIdempotency", error));
//             }
//         };
//     }




//     // Nuevos middlewares aquí...
//     /**
//  * Contexto mínimo común para endpoints de cliente/consultas.
//  *
//  * - NO valida slots ni attendees.
//  * - Solo exige:
//  *    - idWorkspace
//  *    - customer.id (igual que ResolveClientWorkspace)
//  * - Deja opcionales idCompany / idBookingPage / meta adicionales.
//  *
//  * Resultado:
//  *   req.booking.ctx.input = {
//  *     idWorkspace,
//  *     idCompany?,
//  *     idBookingPage?,
//  *     customer: { id, name?, email?, phone? },
//  *     extra: { ... } // opcional, passthrough
//  *   }
//  */
//     static BaseContextSimple() {
//         return (req: Request, res: Response, next: NextFunction) => {
//             try {
//                 const p = req.body ?? {};

//                 // idWorkspace obligatorio
//                 if (!p?.idWorkspace) {
//                     return this.endBadRequest(
//                         res,
//                         400,
//                         "Falta idWorkspace",
//                         "BookingGuards.BaseContextSimple"
//                     );
//                 }

//                 // customer con al menos id (compatible con ResolveClientWorkspace)
//                 const customer = p?.customer ?? {};
//                 if (!customer?.id) {
//                     return this.endBadRequest(
//                         res,
//                         400,
//                         "Falta customer.id",
//                         "BookingGuards.BaseContextSimple"
//                     );
//                 }

//                 // Construimos input "ligero"
//                 const input: any = {
//                     idWorkspace: p.idWorkspace,
//                     idEvent: p.idEvent ?? undefined, // opcional
//                     // opcionales: no rompemos nada si vienen
//                     // idCompany: p?.idCompany,
//                     // idBookingPage: p?.idBookingPage,
//                     customer: {
//                         id: customer.id,
//                         name: customer.name,
//                         email: customer.email,
//                         phone: customer.phone,
//                     },
//                     // cualquier cosa adicional que quieras pasar sin validar fuerte
//                     extra: p.extra ?? undefined,
//                 };

//                 if (!req.booking) {
//                     (req as any).booking = {};
//                 }

//                 req.booking.ctx = {
//                     ...(req.booking.ctx || {}),
//                     input,
//                 };

//                 return next();
//             } catch (error: any) {
//                 return this.endBadRequest(
//                     res,
//                     400,
//                     "Bad request",
//                     "BookingGuards.BaseContextSimple",
//                     error
//                 );
//             }
//         };
//     }
// }



// // middlewares/booking-guards.middleware.ts
import type { NextFunction, Request, Response } from "express";
import moment from "moment-timezone";
import { CONSOLE_COLOR } from "../../constant/console-color";
import prisma from "../../lib/prisma";
import CustomError from "../../models/custom-error/CustomError";
import {
    IRedisBookingPageBriefStrategy,
    IRedisWorkspaceBriefStrategy,
} from "../../services/@redis/cache/interfaces/interfaces";
import { RedisStrategyFactory } from "../../services/@redis/cache/strategies/redisStrategyFactory";

import { TIME_SECONDS } from "../../constant/time";
import { Response as ResponseBuild } from "../../models/messages/response";
import {
    ClientWorkspaceBrief,
} from "../../services/@redis/cache/interfaces/models/client-brief";
import { getWorkspacesByIds } from "../../services/@service-token-client/api-ms/auth.ms";
import { getBookingPageByIds } from "../../services/@service-token-client/api-ms/bookingPage.ms";
import {
    createClientWorkspaceByClientAndWorkspace,
    getClientWorkspacesByClientIds,
} from "../../services/@service-token-client/api-ms/client.ms";
import { config } from "googleapis/build/src/apis/config";

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
    idBookingPage: string;
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
    input?: BookingInputNormalized;

    workspace?: any;
    bookingPage?: any;
    config?: BookingConfig;
    timeZoneWorkspace?: string;

    when?: {
        startClient: moment.Moment;
        startWS: moment.Moment;
        endWS?: moment.Moment;
        dateWS: string; // "YYYY-MM-DD"
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
        // Mapeo de códigos por origen del error
        const ERROR_CODES_BY_WHERE: Record<string, string> = {
            "BookingGuards.BaseValidation": "100",
            "BookingGuards.ResolveWorkspace": "110",
            "BookingGuards.ResolveBookingPage": "120",
            "BookingGuards.ResolveClientWorkspace": "130",
            "BookingGuards.EnforceTimeRules": "140",
            "BookingGuards.EnforceUserLimits": "150",
            "BookingGuards.FeatureFlagsAndIdempotency": "160",
            "BookingGuards.BaseContextSimple": "170",
        };

        // Código numérico (como string) asociado al `where`
        const code = ERROR_CODES_BY_WHERE[where] ?? "199";

        if (error) {
            console.error(
                CONSOLE_COLOR.BgRed,
                `[${where}]`,
                `code=${code}`,
                message,
                error instanceof Error ? error.message : error,
                CONSOLE_COLOR.Reset
            );
        } else {
            console.warn(
                CONSOLE_COLOR.BgYellow,
                `[${where}] code=${code} ${message}`,
                CONSOLE_COLOR.Reset
            );
        }

        return res
            .status(status)
            .json(
                ResponseBuild.build(
                    message,
                    status,
                    false, // ok
                    null, // item (en error lo dejamos null)
                    code // code numérico (string)
                )
            );
    }

    /* ─────────────────────────────────────
       1) INPUT: valida + normaliza (ctx.input)
       Código de error base: 100 (BookingGuards.BaseValidation)
    ────────────────────────────────────── */
    static BaseValidationAndNormalize() {
        return (req: Request, res: Response, next: NextFunction) => {
            try {
                const p = req.body ?? {};

                if (!p?.idCompany || !p?.idWorkspace) {
                    return this.endBadRequest(
                        res,
                        400,
                        "Faltan idCompany o idWorkspace",
                        "BookingGuards.BaseValidation" // code: 100
                    );
                }

                if (!p?.idBookingPage) {
                    console.log(`${CONSOLE_COLOR.FgYellow}[BookingGuards.BaseValidation] idBookingPage no proporcionado, se asume null${CONSOLE_COLOR.Reset}`);
                    console.log(`${CONSOLE_COLOR.FgYellow}[BookingGuards.BaseValidation] No es obligatorio, se asigna null${CONSOLE_COLOR.Reset}`);
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
                        "BookingGuards.BaseValidation" // code: 100
                    );
                }

                const startLocalISO = hasNew
                    ? p.startLocalISO
                    : `${p.date}T${p.time ?? "00:00"}:00`;
                const timeZoneClient = hasNew ? p.timeZoneClient : p.timezone;

                if (!Array.isArray(p.attendees) || p.attendees.length === 0) {
                    return this.endBadRequest(
                        res,
                        400,
                        "attendees vacío",
                        "BookingGuards.BaseValidation" // code: 100
                    );
                }

                for (let i = 0; i < p.attendees.length; i++) {
                    const a = p.attendees[i];
                    if (!a?.serviceId) {
                        return this.endBadRequest(
                            res,
                            400,
                            `attendees[${i}].serviceId es requerido`,
                            "BookingGuards.BaseValidation" // code: 100
                        );
                    }
                    if (typeof a?.durationMin !== "number" || a.durationMin <= 0) {
                        return this.endBadRequest(
                            res,
                            400,
                            `attendees[${i}].durationMin debe ser > 0`,
                            "BookingGuards.BaseValidation" // code: 100
                        );
                    }
                }

                console.log("mira que es idCompany", p?.idCompany);
                const input = {
                    idCompany: p.idCompany,
                    idWorkspace: p.idWorkspace,
                    idBookingPage: p.idBookingPage,
                    startLocalISO,
                    timeZoneClient,
                    attendees: p.attendees.map((a: any) => ({
                        serviceId: a.serviceId,
                        durationMin: a.durationMin,
                        staffId: a.staffId ?? null,
                        categoryId: a.categoryId ?? null,
                    })),
                    excludeEventId: p?.excludeEventId,
                    note: p?.note,
                    isCommentRead: p?.isCommentRead,
                    customer: {
                        id: p?.customer?.id,
                        name: p?.customer?.name,
                        phone: p?.customer?.phone,
                        email: p?.customer?.email,
                    },
                    // Usado en editar reservas
                    idEvent: p?.idEvent,
                    deletedEventIds: p?.deletedEventIds,
                };

                req.booking = { ctx: { input } };
                return next();
            } catch (error: any) {
                return this.endBadRequest(
                    res,
                    400,
                    "Bad request",
                    "BookingGuards.BaseValidation", // code: 100
                    error
                );
            }
        };
    }

    /* ─────────────────────────────────────
       2) WORKSPACE: cache/RPC + tz + config
       Código de error base: 110 (BookingGuards.ResolveWorkspace)
    ────────────────────────────────────── */
    static ResolveWorkspace() {
        return async (req: Request, res: Response, next: NextFunction) => {
            try {
                const ctx = req.booking!.ctx;
                const { idWorkspace } = ctx.input;
                console.log("resolviendo workspace para idWorkspace", idWorkspace);
                const workspaceBriefStrategy =
                    RedisStrategyFactory.getStrategy(
                        "workspaceBrief"
                    ) as IRedisWorkspaceBriefStrategy;
                let workspace: any =
                    await workspaceBriefStrategy.getWorkspaceById(idWorkspace);
                console.log("buscando workspace en cache");

                if (!workspace) {
                    const workspaceRes = await getWorkspacesByIds([idWorkspace]);
                    console.log("buscando workspace en DB");
                    console.log("mira que es workspaceRes", workspaceRes);
                    workspace = workspaceRes?.[0] ?? null;
                    if (workspace?.id) {
                        await workspaceBriefStrategy.setWorkspace(
                            workspace,
                            TIME_SECONDS.HOUR
                        );
                    }
                } else {
                    console.log(`${CONSOLE_COLOR.FgGreen}[BookingGuards.ResolveWorkspace] Workspace encontrado en cache${CONSOLE_COLOR.Reset}`);
                }

                console.log("mira que es workspace", workspace?.id);
                if (!workspace?.timeZone) {
                    return this.endBadRequest(
                        res,
                        400,
                        "No se pudo resolver el timezone del workspace",
                        "BookingGuards.ResolveWorkspace" // code: 110
                    );
                }

                ctx.workspace = workspace;
                ctx.config = workspace?.generalConfigJson || {};
                ctx.timeZoneWorkspace = workspace.timeZone;


                console.log(`${CONSOLE_COLOR.FgCyan}[BookingGuards.ResolveWorkspace] Workspace resuelto${CONSOLE_COLOR.Reset}`, ctx.config);
                return next();
            } catch (error: any) {
                return next(
                    new CustomError("BookingGuards.ResolveWorkspace", error)
                );
            }
        };
    }

    /* ─────────────────────────────────────
       2.5) BookingPage: configuración página reservas
       Código de error base previsto: 120 (BookingGuards.ResolveBookingPage)
       (Actualmente sin endBadRequest activo)


       TODO: Esto está desfasado, ya no se usa BookingPage.
    ────────────────────────────────────── */
    static ResolveBookingPage() {
        return async (req: Request, res: Response, next: NextFunction) => {
            try {
                const ctx = req.booking!.ctx;
                const { idBookingPage } = ctx.input;

                const bookingPageStrategy =
                    RedisStrategyFactory.getStrategy(
                        "bookingPageBrief"
                    ) as IRedisBookingPageBriefStrategy;
                let bp = await bookingPageStrategy.getBookingPageById(
                    idBookingPage
                );
                if (!bp) {
                    console.log("no está en cache, voy a buscarlo rpc");
                    const briefResponse = await getBookingPageByIds(
                        [idBookingPage],
                        ctx.input.idWorkspace
                    );
                    bp = briefResponse?.[0] ?? null;
                    if (bp?.id) {
                        await bookingPageStrategy.setBookingPage(
                            bp,
                            TIME_SECONDS.HOUR
                        );
                    }
                }
                console.log("mira que es bp2", bp?.id);

                // TODO: Esto ya no lo tendrán los bookingPages publicados
                // if (bp?.bookingPageStatusType !== ("PUBLISHED" as BookingPageStatusType)) {
                //     return this.endBadRequest(res, 400, "La página de reservas no está publicada", "BookingGuards.ResolveBookingPage"); // code: 120
                // }

                ctx.bookingPage = bp;
                return next();
            } catch (error: any) {
                return next(
                    new CustomError("BookingGuards.ResolveBookingPage", error)
                );
            }
        };
    }

    /* ─────────────────────────────────────
       3) CLIENTE EN WORKSPACE (RPC)
       Código de error base: 130 (BookingGuards.ResolveClientWorkspace)
    ────────────────────────────────────── */
    static ResolveClientWorkspace() {
        return async (req: Request, res: Response, next: NextFunction) => {
            try {
                const ctx = req.booking!.ctx;
                const { idWorkspace, customer, idCompany } = ctx.input;

                console.log("mira que es idWorkspace", idWorkspace);
                console.log("mira que es idCompany", idCompany);


                if (!customer?.id) {
                    return this.endBadRequest(
                        res,
                        400,
                        "No se pudo resolver el cliente",
                        "BookingGuards.ResolveClientWorkspace" // code: 130
                    );
                }

                if (!idCompany) {
                    return this.endBadRequest(
                        res,
                        400,
                        "No se pudo resolver el company del cliente",
                        "BookingGuards.ResolveClientWorkspace" // code: 130
                    );
                }

                const list = await getClientWorkspacesByClientIds(
                    [customer?.id],
                    idCompany
                );
                let clientWorkspaceBrief: ClientWorkspaceBrief = null;
                console.log("mira que es list", list);
                if (!list || list.length === 0) {
                    console.log(
                        `${CONSOLE_COLOR.BgYellow}[BookingGuards.ResolveClientWorkspace] No existe clientWorkspace, se crea uno nuevo${CONSOLE_COLOR.Reset}`
                    );
                    const result =
                        await createClientWorkspaceByClientAndWorkspace(
                            customer.id,
                            idWorkspace,
                            idCompany
                        );
                    console.log("mira que es result", result);
                    clientWorkspaceBrief = result;
                } else {
                    clientWorkspaceBrief = list[0];
                }

                console.log(
                    `${CONSOLE_COLOR.BgGray}[BookingGuards.ResolveClientWorkspace] Cliente workspace obtenido o creado${CONSOLE_COLOR.Reset}`,
                    clientWorkspaceBrief
                );

                if (!clientWorkspaceBrief || !clientWorkspaceBrief.id) {
                    console.log(
                        `${CONSOLE_COLOR.BgRed}[BookingGuards.ResolveClientWorkspace] No se pudo resolver el cliente en el workspace${CONSOLE_COLOR.Reset}`
                    );
                    return this.endBadRequest(
                        res,
                        400,
                        "No se pudo resolver el cliente en el workspace",
                        "BookingGuards.ResolveClientWorkspace" // code: 130
                    );
                }

                if (clientWorkspaceBrief?.isBanned) {
                    console.log(
                        `${CONSOLE_COLOR.BgRed}[BookingGuards.ResolveClientWorkspace] El cliente está baneado en el workspace${CONSOLE_COLOR.Reset}`
                    );
                    return this.endBadRequest(
                        res,
                        400,
                        "El cliente está baneado en el workspace",
                        "BookingGuards.ResolveClientWorkspace" // code: 130
                    );
                }

                if (clientWorkspaceBrief?.client?.isBanned) {
                    console.log(
                        `${CONSOLE_COLOR.BgRed}[BookingGuards.ResolveClientWorkspace] El cliente está baneado en el workspace${CONSOLE_COLOR.Reset}`
                    );
                    return this.endBadRequest(
                        res,
                        400,
                        "El cliente está baneado en el workspace",
                        "BookingGuards.ResolveClientWorkspace" // code: 130
                    );
                }

                console.log(
                    `${CONSOLE_COLOR.BgYellow}[BookingGuards.ResolveClientWorkspace] Cliente resuelto en workspace${CONSOLE_COLOR.Reset}`
                );
                console.log("mira que es customer", customer);
                // console.log("mira que es idWorkspace", idWorkspace);
                console.log("mira la compañía", idCompany);

                ctx.customer = {
                    idClient: clientWorkspaceBrief.idClientFk || customer.id,
                    idClientWorkspace: clientWorkspaceBrief.id,
                };

                console.log(
                    `${CONSOLE_COLOR.BgGreen}[BookingGuards.ResolveClientWorkspace] Cliente resuelto en workspace${CONSOLE_COLOR.Reset}`,
                    ctx.customer
                );

                return next();
            } catch (error: any) {
                return next(
                    new CustomError("BookingGuards.ResolveClientWorkspace", error)
                );
            }
        };
    }

    /* ─────────────────────────────────────
       4) REGLAS DE TIEMPO (ventana / lead times)
       Código de error base: 140 (BookingGuards.EnforceTimeRules)
    ────────────────────────────────────── */
    static EnforceTimeRules() {
        return (req: Request, res: Response, next: NextFunction) => {
            try {
                const ctx = req.booking!.ctx;
                const { startLocalISO, timeZoneClient, attendees } = ctx.input;
                const tzWS = ctx.timeZoneWorkspace!;

                const startClient = moment.tz(
                    startLocalISO,
                    "YYYY-MM-DDTHH:mm:ss",
                    timeZoneClient
                );
                if (!startClient.isValid()) {
                    return this.endBadRequest(
                        res,
                        400,
                        "startLocalISO inválido",
                        "BookingGuards.EnforceTimeRules" // code: 140
                    );
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

                console.log("mira que es bw", bw);

                const minLead = Math.max(0, bw.minLeadTimeMin ?? 0);
                const maxAdv = Math.max(0, bw.maxAdvanceDays ?? 365);

                // No días pasados
                if (
                    startWS
                        .clone()
                        .startOf("day")
                        .isBefore(nowWS.clone().startOf("day"))
                ) {
                    return this.endBadRequest(
                        res,
                        400,
                        "El día seleccionado ya ha pasado en el huso horario del negocio.",
                        "BookingGuards.EnforceTimeRules" // code: 140
                    );
                }

                // Lead time
                if (
                    startWS.isBefore(nowWS.clone().add(minLead, "minutes"))
                ) {
                    return this.endBadRequest(
                        res,
                        400,
                        "La hora seleccionada ya no está disponible por lead time.",
                        "BookingGuards.EnforceTimeRules" // code: 140
                    );
                }

                // Max advance
                if (
                    startWS.isAfter(
                        nowWS.clone().add(maxAdv, "days").endOf("day")
                    )
                ) {
                    return this.endBadRequest(
                        res,
                        400,
                        "Fuera de la ventana de reserva permitida.",
                        "BookingGuards.EnforceTimeRules" // code: 140
                    );
                }

                const totalDuration = attendees.reduce(
                    (acc: number, a: any) => acc + (a?.durationMin ?? 0),
                    0
                );
                const endWS = startWS.clone().add(totalDuration, "minutes");

                ctx.when = {
                    startClient,
                    startWS,
                    endWS,
                    dateWS,
                    isToday,
                    roundedNow: nowWS,
                };
                return next();
            } catch (error: any) {
                return next(
                    new CustomError("BookingGuards.EnforceTimeRules", error)
                );
            }
        };
    }

    /* ─────────────────────────────────────
       5) LÍMITES POR USUARIO (día / concurrentes)
       Código de error base: 150 (BookingGuards.EnforceUserLimits)
    ────────────────────────────────────── */
    static EnforceUserLimits(enableDebug = false) {
        return async (req: Request, res: Response, next: NextFunction) => {
            try {
                const ctx = req.booking!.ctx;

                const debugLog = (...args: unknown[]) => {
                    if (!enableDebug) {
                        return;
                    }
                    console.log(...args);
                };

                const debugJson = (label: string, value: unknown) => {
                    if (!enableDebug) {
                        return;
                    }
                    console.log(label, JSON.stringify(value, null, 2));
                };

                debugLog(`${CONSOLE_COLOR.BgCyan}[EnforceUserLimits] ===== INICIO DEBUG =====${CONSOLE_COLOR.Reset}`);
                debugJson(`${CONSOLE_COLOR.FgCyan}[EnforceUserLimits] Config completa:${CONSOLE_COLOR.Reset}`, ctx.config);

                // ---- Limits con defaults seguros
                const lim = (ctx.config?.limits ?? {}) as {
                    perUserPerDay?: number;
                    perUserConcurrent?: number;
                    maxServicesPerBooking?: number;
                };

                debugLog(`${CONSOLE_COLOR.FgYellow}[EnforceUserLimits] Limits raw:${CONSOLE_COLOR.Reset}`, lim);

                // Si no lo configuras, aplicamos estas políticas por defecto:
                const maxServicesPerBooking = Number.isFinite(
                    lim.maxServicesPerBooking
                )
                    ? Number(lim.maxServicesPerBooking)
                    : 1; // por defecto, 1 servicio por reserva

                const perUserPerDay = Number.isFinite(lim.perUserPerDay)
                    ? Number(lim.perUserPerDay)
                    : 1; // por defecto, 1 reserva al día

                const perUserConcurrent = Number.isFinite(
                    lim.perUserConcurrent
                )
                    ? Number(lim.perUserConcurrent)
                    : 0; // 0 = sin límite concurrente por defecto

                debugLog(`${CONSOLE_COLOR.FgGreen}[EnforceUserLimits] Límites calculados:${CONSOLE_COLOR.Reset}`);
                debugLog(`  - maxServicesPerBooking: ${maxServicesPerBooking}`);
                debugLog(`  - perUserPerDay: ${perUserPerDay}`);
                debugLog(`  - perUserConcurrent: ${perUserConcurrent}`);

                // ---- (A) Chequeo: servicios por reserva
                const servicesCount = ctx.input.attendees.length;
                debugLog(`${CONSOLE_COLOR.FgMagenta}[EnforceUserLimits] Servicios en esta reserva: ${servicesCount}${CONSOLE_COLOR.Reset}`);
                if (
                    maxServicesPerBooking > 0 &&
                    servicesCount > maxServicesPerBooking
                ) {
                    debugLog(`${CONSOLE_COLOR.BgRed}[EnforceUserLimits] ❌ Excede límite de servicios por reserva${CONSOLE_COLOR.Reset}`);
                    return this.endBadRequest(
                        res,
                        400,
                        `Solo se permiten ${maxServicesPerBooking} servicio(s) por reserva.`,
                        "BookingGuards.EnforceUserLimits" // code: 150
                    );
                }

                debugLog(`${CONSOLE_COLOR.FgGreen}[EnforceUserLimits] ✅ Validación de servicios por reserva pasada${CONSOLE_COLOR.Reset}`);

                // Si no tenemos cliente o ventana temporal calculada, continúa
                if (!ctx.customer || !ctx.when) {
                    debugLog(`${CONSOLE_COLOR.FgYellow}[EnforceUserLimits] ⚠️ No hay customer o when, saltando límites temporales${CONSOLE_COLOR.Reset}`);
                    debugLog(`  - ctx.customer: ${!!ctx.customer}`);
                    debugLog(`  - ctx.when: ${!!ctx.when}`);
                    return next();
                }

                const { idClientWorkspace } = ctx.customer;
                const slotStartWS = ctx.when.startWS.clone();
                const slotEndWS = ctx.when.endWS!.clone();

                debugLog(`${CONSOLE_COLOR.FgBlue}[EnforceUserLimits] Cliente y tiempo:${CONSOLE_COLOR.Reset}`);
                debugLog(`  - idClientWorkspace: ${idClientWorkspace}`);
                debugLog(`  - slotStartWS: ${slotStartWS.format()}`);
                debugLog(`  - slotEndWS: ${slotEndWS.format()}`);

                // Rangos día en WS → a UTC para query
                const dayStartUTC = slotStartWS
                    .clone()
                    .startOf("day")
                    .utc()
                    .toDate();
                const dayEndUTC = slotStartWS
                    .clone()
                    .endOf("day")
                    .utc()
                    .toDate();

                const slotStartUTC = slotStartWS.clone().utc().toDate();
                const slotEndUTC = slotEndWS.clone().utc().toDate();

                debugLog(`${CONSOLE_COLOR.FgBlue}[EnforceUserLimits] Rangos UTC para queries:${CONSOLE_COLOR.Reset}`);
                debugLog(`  - dayStartUTC: ${dayStartUTC.toISOString()}`);
                debugLog(`  - dayEndUTC: ${dayEndUTC.toISOString()}`);
                debugLog(`  - slotStartUTC: ${slotStartUTC.toISOString()}`);
                debugLog(`  - slotEndUTC: ${slotEndUTC.toISOString()}`);

                const reasons: string[] = [];

                // En el nuevo modelo, EventParticipant cuelga del grupo (idGroup -> GroupEvents)
                // por lo que el identificador de booking es siempre el idGroup.
                const CANCELLED_GROUP_STATUSES = [
                    "CANCELLED",
                    "CANCELLED_BY_CLIENT",
                    "CANCELLED_BY_CLIENT_REMOVED",
                ] as const;

                debugLog(`${CONSOLE_COLOR.FgMagenta}[EnforceUserLimits] Estados cancelados considerados:${CONSOLE_COLOR.Reset}`, CANCELLED_GROUP_STATUSES);

                // ---- (B) Chequeo: límite de reservas por día (NO por servicios)
                if (perUserPerDay > 0) {
                    debugLog(`${CONSOLE_COLOR.BgBlue}[EnforceUserLimits] === Verificando límite de reservas por día ===${CONSOLE_COLOR.Reset}`);
                    debugLog(`  - Límite configurado: ${perUserPerDay} reservas/día`);
                    const dayParticipations =
                        await prisma.eventParticipant.findMany({
                            where: {
                                idClientWorkspaceFk: idClientWorkspace,
                                deletedDate: null,
                                groupEvents: {
                                    deletedDate: null,
                                    startDate: { lt: dayEndUTC },
                                    endDate: { gt: dayStartUTC },
                                    eventStatusType: {
                                        notIn: CANCELLED_GROUP_STATUSES as any,
                                    },
                                },
                            },
                            select: {
                                idGroup: true,
                                groupEvents: {
                                    select: {
                                        id: true,
                                        eventStatusType: true,
                                        startDate: true,
                                        endDate: true,
                                    },
                                },
                            },
                        });

                    debugLog(`${CONSOLE_COLOR.FgYellow}[EnforceUserLimits] Participaciones encontradas en el día: ${dayParticipations.length}${CONSOLE_COLOR.Reset}`);
                    
                    const bookingIdsDay = new Set<string>();

                    for (const p of dayParticipations) {
                        debugLog(`  - Procesando participación, idGroup: ${p.idGroup}`);
                        if (!p?.idGroup) {
                            debugLog(`    ⚠️ Sin idGroup, saltando`);
                            continue;
                        }
                        if (p.groupEvents) {
                            debugLog(`    - Estado: ${p.groupEvents.eventStatusType}`);
                            debugLog(`    - Start: ${p.groupEvents.startDate}`);
                            debugLog(`    - End: ${p.groupEvents.endDate}`);
                        }
                        bookingIdsDay.add(`g:${p.idGroup}`);
                        debugLog(`    ✓ Grupo activo, añadido: g:${p.idGroup}`);
                    }

                    const countDayBookings = bookingIdsDay.size;
                    debugLog(`${CONSOLE_COLOR.FgGreen}[EnforceUserLimits] Total de reservas activas en el día: ${countDayBookings}${CONSOLE_COLOR.Reset}`);
                    debugLog(`${CONSOLE_COLOR.FgGreen}[EnforceUserLimits] IDs de grupos: ${Array.from(bookingIdsDay).join(", ")}${CONSOLE_COLOR.Reset}`);

                    if (countDayBookings >= perUserPerDay) {
                        const msg = `Has alcanzado el máximo de reservas por día (${countDayBookings}/${perUserPerDay}).`;
                        debugLog(`${CONSOLE_COLOR.BgRed}[EnforceUserLimits] ❌ ${msg}${CONSOLE_COLOR.Reset}`);
                        reasons.push(msg);
                    } else {
                        debugLog(`${CONSOLE_COLOR.FgGreen}[EnforceUserLimits] ✅ Límite por día OK (${countDayBookings}/${perUserPerDay})${CONSOLE_COLOR.Reset}`);
                    }
                } else {
                    debugLog(`${CONSOLE_COLOR.FgYellow}[EnforceUserLimits] ⚠️ perUserPerDay = 0, sin límite de reservas por día${CONSOLE_COLOR.Reset}`);
                }

                // ---- (C) Chequeo: límite de reservas simultáneas (NO por servicios)
                if (perUserConcurrent > 0) {
                    debugLog(`${CONSOLE_COLOR.BgBlue}[EnforceUserLimits] === Verificando límite de reservas simultáneas ===${CONSOLE_COLOR.Reset}`);
                    debugLog(`  - Límite configurado: ${perUserConcurrent} reservas simultáneas`);
                    
                    const overlappingParticipations =
                        await prisma.eventParticipant.findMany({
                            where: {
                                idClientWorkspaceFk: idClientWorkspace,
                                deletedDate: null,
                                groupEvents: {
                                    deletedDate: null,
                                    startDate: { lt: slotEndUTC },
                                    endDate: { gt: slotStartUTC },
                                    eventStatusType: {
                                        notIn: CANCELLED_GROUP_STATUSES as any,
                                    },
                                },
                            },
                            select: {
                                idGroup: true,
                                groupEvents: {
                                    select: {
                                        id: true,
                                        eventStatusType: true,
                                        startDate: true,
                                        endDate: true,
                                    },
                                },
                            },
                        });

                    debugLog(`${CONSOLE_COLOR.FgYellow}[EnforceUserLimits] Participaciones solapadas encontradas: ${overlappingParticipations.length}${CONSOLE_COLOR.Reset}`);
                    
                    const bookingIdsOverlap = new Set<string>();

                    for (const p of overlappingParticipations) {
                        debugLog(`  - Procesando participación solapada, idGroup: ${p.idGroup}`);
                        if (!p?.idGroup) {
                            debugLog(`    ⚠️ Sin idGroup, saltando`);
                            continue;
                        }
                        if (p.groupEvents) {
                            debugLog(`    - Estado: ${p.groupEvents.eventStatusType}`);
                            debugLog(`    - Start: ${p.groupEvents.startDate}`);
                            debugLog(`    - End: ${p.groupEvents.endDate}`);
                        }
                        bookingIdsOverlap.add(`g:${p.idGroup}`);
                        debugLog(`    ✓ Grupo activo solapado, añadido: g:${p.idGroup}`);
                    }

                    const overlappingBookings = bookingIdsOverlap.size;
                    debugLog(`${CONSOLE_COLOR.FgGreen}[EnforceUserLimits] Total de reservas activas solapadas: ${overlappingBookings}${CONSOLE_COLOR.Reset}`);
                    debugLog(`${CONSOLE_COLOR.FgGreen}[EnforceUserLimits] IDs de grupos solapados: ${Array.from(bookingIdsOverlap).join(", ")}${CONSOLE_COLOR.Reset}`);

                    if (overlappingBookings >= perUserConcurrent) {
                        const msg = `Límite de reservas simultáneas alcanzado (${overlappingBookings}/${perUserConcurrent}).`;
                        debugLog(`${CONSOLE_COLOR.BgRed}[EnforceUserLimits] ❌ ${msg}${CONSOLE_COLOR.Reset}`);
                        reasons.push(msg);
                    } else {
                        debugLog(`${CONSOLE_COLOR.FgGreen}[EnforceUserLimits] ✅ Límite simultáneo OK (${overlappingBookings}/${perUserConcurrent})${CONSOLE_COLOR.Reset}`);
                    }
                } else {
                    debugLog(`${CONSOLE_COLOR.FgYellow}[EnforceUserLimits] ⚠️ perUserConcurrent = 0, sin límite de reservas simultáneas${CONSOLE_COLOR.Reset}`);
                }

                if (reasons.length > 0) {
                    debugLog(`${CONSOLE_COLOR.BgRed}[EnforceUserLimits] ❌ RECHAZANDO RESERVA - Razones:${CONSOLE_COLOR.Reset}`, reasons);
                    // 409: reglas del negocio infringidas
                    return this.endBadRequest(
                        res,
                        409,
                        reasons.join(" "),
                        "BookingGuards.EnforceUserLimits" // code: 150
                    );
                }

                debugLog(`${CONSOLE_COLOR.BgGreen}[EnforceUserLimits] ✅ TODOS LOS LÍMITES PASADOS - Permitiendo reserva${CONSOLE_COLOR.Reset}`);
                debugLog(`${CONSOLE_COLOR.BgCyan}[EnforceUserLimits] ===== FIN DEBUG =====${CONSOLE_COLOR.Reset}`);

                return next();
            } catch (error: any) {
                return next(
                    new CustomError("BookingGuards.EnforceUserLimits", error)
                );
            }
        };
    }

    /* ─────────────────────────────────────
       6) (Opcional) Feature flags + Idempotencia
       Código de error base: 160 (BookingGuards.FeatureFlagsAndIdempotency)
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
                    ...ctx.input.attendees.map(
                        (a) =>
                            `${a.serviceId}:${a.durationMin}:${a.staffId ?? "any"
                            }`
                    ),
                ].join("|");

                // TODO: aquí podrías consultar un Redis para rechazar duplicados a corto plazo
                // TODO: Mandar al LOG (audit): intento de reserva con idempotencyKey

                return next();
            } catch (error: any) {
                return next(
                    new CustomError(
                        "BookingGuards.FeatureFlagsAndIdempotency",
                        error
                    )
                );
            }
        };
    }

    // Nuevos middlewares aquí...

    /**
     * Contexto mínimo común para endpoints de cliente/consultas.
     *
     * - NO valida slots ni attendees.
     * - Solo exige:
     *    - idWorkspace
     *    - customer.id (igual que ResolveClientWorkspace)
     * - Deja opcionales idCompany / idBookingPage / meta adicionales.
     *
     * Resultado:
     *   req.booking.ctx.input = {
     *     idWorkspace,
     *     idCompany?,
     *     idBookingPage?,
     *     customer: { id, name?, email?, phone? },
     *     extra: { ... } // opcional, passthrough
     *   }
     *
     * Código de error base: 170 (BookingGuards.BaseContextSimple)
     */
    static BaseContextSimple() {
        return (req: Request, res: Response, next: NextFunction) => {
            try {
                const p = req.body ?? {};

                // idWorkspace obligatorio
                if (!p?.idWorkspace) {
                    return this.endBadRequest(
                        res,
                        400,
                        "Falta idWorkspace",
                        "BookingGuards.BaseContextSimple" // code: 170
                    );
                }

                if (!p?.idCompany) {
                    return this.endBadRequest(
                        res,
                        400,
                        "Falta idCompany",
                        "BookingGuards.BaseContextSimple" // code: 170
                    );
                }

                // customer con al menos id (compatible con ResolveClientWorkspace)
                const customer = p?.customer ?? {};
                if (!customer?.id) {
                    return this.endBadRequest(
                        res,
                        400,
                        "Falta customer.id",
                        "BookingGuards.BaseContextSimple" // code: 170
                    );
                }

                // Construimos input "ligero"
                const input: any = {
                    idCompany: p.idCompany,
                    idWorkspace: p.idWorkspace,
                    idEvent: p.idEvent ?? undefined, // opcional
                    customer: {
                        id: customer.id,
                        name: customer.name,
                        email: customer.email,
                        phone: customer.phone,
                    },
                    // cualquier cosa adicional que quieras pasar sin validar fuerte
                    extra: p.extra ?? undefined,
                };

                if (!req.booking) {
                    (req as any).booking = {};
                }

                req.booking.ctx = {
                    ...(req.booking.ctx || {}),
                    input,
                };

                return next();
            } catch (error: any) {
                return this.endBadRequest(
                    res,
                    400,
                    "Bad request",
                    "BookingGuards.BaseContextSimple", // code: 170
                    error
                );
            }
        };
    }
}
