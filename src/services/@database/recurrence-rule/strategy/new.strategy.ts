// // src/services/recurrence-rule/strategy/new.strategy.ts
// import { EventForBackend } from "../../event/dto/EventForBackend";
// import { Event, PrismaClient } from "@prisma/client";
// import { RRule } from "rrule";
// import { toPrismaEventCreate } from "../../event/util/toPrismaEventCreate";
// import { DEFAULT_RECURRENCE_COUNT, MAX_RECURRENCE_COUNT, parseDateString, RecurrenceStrategy } from "./type";
// import moment from "moment";
// import { createNotification } from "../../../../models/notification/util/trigger/for-action";
// import { ActionKey } from "../../../../models/notification/util/action-to-senctions";



// export class NewStrategy implements RecurrenceStrategy {
//     /**
//      * Primera creación de recurrencia: crea la regla y devuelve su ID.
//      */
//     async handleImmediate(
//         payload: EventForBackend,
//         tx: PrismaClient
//     ): Promise<string> {
//         const { event, recurrenceRule } = payload;
//         if (!recurrenceRule) {
//             throw new Error("No recurrence data provided for NEW strategy");
//         }

//         // Crear la nueva regla de recurrencia
//         const newRule = await tx.recurrenceRule.create({
//             data: {
//                 dtstart: new Date(recurrenceRule.dtstart),
//                 until: recurrenceRule.until ? new Date(recurrenceRule.until) : null,
//                 rrule: recurrenceRule.rrule,
//                 rdates: recurrenceRule.rdates ?? [],
//                 tzid: recurrenceRule.tzid,
//                 recurrenceStatusType: recurrenceRule.recurrenceStatusType!,
//                 // idCalendarFk: event.idCalendarFk!,
//                 idWorkspaceFk: event.idWorkspaceFk!,
//             },
//         });

//         // Devolver el ID para conectar la instancia actual
//         return newRule.id;
//     }

//     /**
//      * Genera en background las fechas de la regla recién creada (hasta COUNT_EVENT_MAX)
//      */
//     async handleBackground(
//         payload: EventForBackend,
//         prisma: PrismaClient,
//         _oldRuleId: string | undefined,
//         newRuleId?: string,
//         amountMax: number = DEFAULT_RECURRENCE_COUNT
//     ): Promise<void> {
//         if (!newRuleId) {
//             return;
//         }
//         const { event, eventParticipant } = payload;

//         // 1) Obtener la regla creada
//         const ruleRec = await prisma.recurrenceRule.findUniqueOrThrow({ where: { id: newRuleId } });

//         if (!ruleRec.dtstart) {
//             throw new Error("Recurrence rule must have a dtstart date");
//         }

//         // 1) Validamos y normalizamos amountMax
//         const raw = Number(amountMax);
//         const validated = Number.isInteger(raw) && raw > 0
//             ? raw
//             : DEFAULT_RECURRENCE_COUNT;

//         // 2) Nunca generamos más de MAX_RECURRENCE_COUNT
//         const count = Math.min(MAX_RECURRENCE_COUNT, validated);

//         // 2) Generar fechas futuras a partir de dtstart
//         const opts = RRule.parseString(ruleRec.rrule!);
//         opts.dtstart = ruleRec.dtstart;
//         opts.tzid = ruleRec.tzid!;
//         opts.count = count; // Limita a las siguientes 'amount' ocurrencias
//         const allDates = new RRule(opts).all();
//         const futureDates = allDates
//             .filter(d => d.getTime() > ruleRec.dtstart.getTime())
//             .slice(0, count);

//         // 3) Crear cada evento en DB
//         const baseCreate = toPrismaEventCreate(event);
//         const durationMs = new Date(event.endDate).getTime() - new Date(event.startDate).getTime();

//         // for (const start of futureDates) {
//         //     const end = new Date(start.getTime() + durationMs);
//         //     await prisma.event.create({
//         //         data: {
//         //             ...baseCreate,
//         //             startDate: start,
//         //             endDate: end,
//         //             // calendar: { connect: { id: event.idCalendarFk! } },
//         //             idWorkspaceFk: event.idWorkspaceFk!,
//         //             idCompanyFk: event.idCompanyFk!,
//         //             // service: event.service?.id ? { connect: { id: event.service.id } } : undefined,
//         //             idServiceFk: event.service?.id ?? null,
//         //             recurrenceRule: { connect: { id: newRuleId } },
//         //             eventParticipant: {
//         //                 create: eventParticipant?.map(ep => ({
//         //                     idClientFk: ep.idClientFk!,
//         //                     idClientWorkspaceFk: ep.idClientWorkspaceFk!,
//         //                 })) ?? [],
//         //             },
//         //         },
//         //     });
//         // }

//         for (const start of futureDates) {
//             const end = new Date(start.getTime() + durationMs);

//             // 1) Crear el evento y obtener su id
//             const ev = await prisma.event.create({
//                 data: {
//                     ...baseCreate,
//                     startDate: start,
//                     endDate: end,
//                     idWorkspaceFk: event.idWorkspaceFk!,
//                     idCompanyFk: event.idCompanyFk!,
//                     // idServiceFk: event.service?.id ?? null,
//                     recurrenceRule: { connect: { id: newRuleId } },
//                     eventParticipant: {
//                         create: eventParticipant?.map(ep => ({
//                             idClientFk: ep.idClientFk!,
//                             idClientWorkspaceFk: ep.idClientWorkspaceFk!,
//                         })) ?? [],
//                     },
//                 },
//                 // include si lo necesitas; no es obligatorio para el id
//                 include: { eventParticipant: true }
//             });

//             // 2) Upsert del plan usando el id del evento
//             const action: ActionKey = "addFromRecurrence"; // ajusta según tu lógica

//             createNotification(ev,
//                 {
//                     actionSectionType: action,
//                 });
//         }

//     }

//     // async handleWindow(
//     //     payload: EventForBackend,
//     //     prisma: PrismaClient,
//     //     _oldRuleId?: string,
//     //     newRuleId?: string,
//     //     amountMax: number = DEFAULT_RECURRENCE_COUNT
//     // ): Promise<void> {
//     //     if (!newRuleId) throw new Error("NewStrategy.handleWindow requires newRuleId");

//     //     const { skipMainEvent, event, eventParticipant, recurrenceRule } = payload;
//     //     if (!recurrenceRule?.dtstart) throw new Error("Missing dtstart in recurrenceRule");

//     //     // 1) Prepara los límites en formato "YYYYMMDD"
//     //     const dtstartDay = moment(recurrenceRule.dtstart).format("YYYYMMDD");
//     //     const origDay = moment(event.startDate).format("YYYYMMDD");

//     //     // 2) Normaliza count
//     //     const raw = Number(amountMax);
//     //     const validated = Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_RECURRENCE_COUNT;
//     //     const count = Math.min(MAX_RECURRENCE_COUNT, validated);

//     //     // 3) Filtra y ordena los rdates como strings
//     //     const kept = (recurrenceRule.rdates ?? [])
//     //         .filter(r => {
//     //             // descartamos sólo los anteriores al dtstart, no el mismo día
//     //             if (r < dtstartDay) return false;

//     //             // si skipMainEvent === true, descartamos sólo el día del evento principal
//     //             if (!skipMainEvent && r === origDay) return false;

//     //             return true;
//     //         })

//     //         .sort()        // en YYYYMMDD, sort lexicográfico = cronológico
//     //         .slice(0, count);

//     //     if (!kept.length) {
//     //         console.log("No hay fechas válidas tras filtrar.");
//     //         return;
//     //     }

//     //     // 4) Extrae hora + duración del evento original
//     //     const startOrig = moment(event.startDate);
//     //     const durationMs = moment(event.endDate).diff(startOrig);
//     //     const H = startOrig.hour(), M = startOrig.minute(), S = startOrig.second();

//     //     const baseCreate = toPrismaEventCreate(event);
//     //     await Promise.all(
//     //         kept.map(r => {
//     //             // convierte "20250718" → momento justo en la hora original
//     //             const m = moment(r, "YYYYMMDD")
//     //                 .hour(H).minute(M).second(S).millisecond(0);
//     //             const start = m.toDate();
//     //             const end = moment(m).add(durationMs, "milliseconds").toDate();

//     //             return prisma.event.create({
//     //                 data: {
//     //                     ...baseCreate,
//     //                     startDate: start,
//     //                     endDate: end,
//     //                     // calendar: { connect: { id: event.idCalendarFk! } },
//     //                     idWorkspaceFk: event.idWorkspaceFk!,
//     //                     idCompanyFk: event.idCompanyFk!,
//     //                     // service: event.service?.id
//     //                     //     ? { connect: { id: event.service.id } }
//     //                     //     : undefined,
//     //                     idServiceFk: event.service?.id ?? null,
//     //                     recurrenceRule: { connect: { id: newRuleId } },
//     //                     eventParticipant: {
//     //                         create: eventParticipant?.map(ep => ({
//     //                             idClientFk: ep.idClientFk!,
//     //                             idClientWorkspaceFk: ep.idClientWorkspaceFk!,
//     //                         })) ?? []
//     //                     },

//     //                 }
//     //             });
//     //         })
//     //     );
//     // }


//     async handleWindow(
//         payload: EventForBackend,
//         prisma: PrismaClient,
//         _oldRuleId?: string,
//         newRuleId?: string,
//         amountMax: number = DEFAULT_RECURRENCE_COUNT
//     ): Promise<void> {
//         if (!newRuleId) throw new Error("NewStrategy.handleWindow requires newRuleId");

//         const { skipMainEvent, event, eventParticipant, recurrenceRule } = payload;
//         if (!recurrenceRule?.dtstart) throw new Error("Missing dtstart in recurrenceRule");

//         // 1) Prepara límites "YYYYMMDD"
//         const dtstartDay = moment(recurrenceRule.dtstart).format("YYYYMMDD");
//         const origDay = moment(event.startDate).format("YYYYMMDD");

//         // 2) Normaliza count y topea
//         const raw = Number(amountMax);
//         const validated = Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_RECURRENCE_COUNT;
//         const count = Math.min(MAX_RECURRENCE_COUNT, validated);

//         // 3) Filtra rdates (descarta < dtstartDay y, si skipMainEvent, descarta el día original)
//         const kept = (recurrenceRule.rdates ?? [])
//             .filter((r) => {
//                 if (r < dtstartDay) return false;
//                 if (skipMainEvent && r === origDay) return false;
//                 return true;
//             })
//             .sort() // "YYYYMMDD" → orden lexicográfico = cronológico
//             .slice(0, count);

//         if (!kept.length) {
//             console.log("[handleWindow] No hay fechas válidas tras filtrar.");
//             return;
//         }

//         // 4) Hora y duración del evento original
//         const startOrig = moment(event.startDate);
//         const durationMs = moment(event.endDate).diff(startOrig);
//         const H = startOrig.hour();
//         const M = startOrig.minute();
//         const S = startOrig.second();

//         // 5) Base para crear eventos (título, snapshots, etc.)
//         const baseCreate = toPrismaEventCreate(event);

//         // 6) Procesa por ocurrencia: EVENTO → PLAN en transacción por cada fecha
//         for (const r of kept) {
//             const m = moment(r, "YYYYMMDD").hour(H).minute(M).second(S).millisecond(0);
//             const start = m.toDate();
//             const end = moment(m).add(durationMs, "milliseconds").toDate();

//             await prisma.$transaction(async (tx) => {
//                 // 6.1 Crear el evento
//                 const ev = await tx.event.create({
//                     data: {
//                         ...baseCreate,
//                         startDate: start,
//                         endDate: end,
//                         idWorkspaceFk: event.idWorkspaceFk!,
//                         idCompanyFk: event.idCompanyFk!,
//                         idServiceFk: event.service?.id ?? null,
//                         recurrenceRule: { connect: { id: newRuleId } },
//                         eventParticipant: {
//                             create:
//                                 eventParticipant?.map((ep) => ({
//                                     idClientFk: ep.idClientFk!,
//                                     idClientWorkspaceFk: ep.idClientWorkspaceFk!,
//                                 })) ?? [],
//                         },
//                     },
//                     include: { eventParticipant: true }

//                 });

//                 // 6.2 Crear NotificationPlan (siempre nuevo)
//                 const action: ActionKey = "addFromRecurrence";

//                 createNotification(ev,
//                     {
//                         actionSectionType: action,
//                     });
//             });
//         }
//     }

// }


// src/services/recurrence-rule/strategy/new.strategy.ts
import { EventForBackend } from "../../event/dto/EventForBackend";
import { Event, PrismaClient } from "@prisma/client";
import { RRule } from "rrule";
import { toPrismaEventCreate } from "../../event/util/toPrismaEventCreate";
import {
    DEFAULT_RECURRENCE_COUNT,
    MAX_RECURRENCE_COUNT,
    parseDateString,
    RecurrenceStrategy
} from "./type";
import moment from "moment";
import { createNotification } from "../../../../models/notification/util/trigger/for-action";
import { ActionKey } from "../../../../models/notification/util/action-to-senctions";
import { v4 as uuidv4 } from "uuid"; // 🟢 para idGroup/booking code

export class NewStrategy implements RecurrenceStrategy {
    /**
     * Primera creación de recurrencia: crea la regla y devuelve su ID.
     */
    async handleImmediate(
        payload: EventForBackend,
        tx: PrismaClient
    ): Promise<string> {
        const { event, recurrenceRule } = payload;
        if (!recurrenceRule) {
            throw new Error("No recurrence data provided for NEW strategy");
        }

        // Crear la nueva regla de recurrencia
        const newRule = await tx.recurrenceRule.create({
            data: {
                dtstart: new Date(recurrenceRule.dtstart),
                until: recurrenceRule.until ? new Date(recurrenceRule.until) : null,
                rrule: recurrenceRule.rrule,
                rdates: recurrenceRule.rdates ?? [],
                tzid: recurrenceRule.tzid,
                recurrenceStatusType: recurrenceRule.recurrenceStatusType!,
                // idCalendarFk: event.idCalendarFk!,
                idWorkspaceFk: event.idWorkspaceFk!,
            },
        });

        // Devolver el ID para conectar la instancia actual
        return newRule.id;
    }

    /**
     * Genera en background las fechas de la regla recién creada (hasta COUNT_EVENT_MAX)
     */
    async handleBackground(
        payload: EventForBackend,
        prisma: PrismaClient,
        _oldRuleId: string | undefined,
        newRuleId?: string,
        amountMax: number = DEFAULT_RECURRENCE_COUNT
    ): Promise<void> {
        if (!newRuleId) {
            return;
        }
        const { event, eventParticipant } = payload;

        // 1) Obtener la regla creada
        const ruleRec = await prisma.recurrenceRule.findUniqueOrThrow({ where: { id: newRuleId } });

        if (!ruleRec.dtstart) {
            throw new Error("Recurrence rule must have a dtstart date");
        }

        // 1) Validamos y normalizamos amountMax
        const raw = Number(amountMax);
        const validated = Number.isInteger(raw) && raw > 0
            ? raw
            : DEFAULT_RECURRENCE_COUNT;

        // 2) Nunca generamos más de MAX_RECURRENCE_COUNT
        const count = Math.min(MAX_RECURRENCE_COUNT, validated);

        // 2) Generar fechas futuras a partir de dtstart
        const opts = RRule.parseString(ruleRec.rrule!);
        opts.dtstart = ruleRec.dtstart;
        opts.tzid = ruleRec.tzid!;
        opts.count = count; // Limita a las siguientes 'amount' ocurrencias
        const allDates = new RRule(opts).all();
        const futureDates = allDates
            .filter(d => d.getTime() > ruleRec.dtstart.getTime())
            .slice(0, count);

        // 3) Crear cada evento en DB
        const baseCreate = toPrismaEventCreate(event);
        const durationMs = new Date(event.endDate).getTime() - new Date(event.startDate).getTime();

        for (const start of futureDates) {
            const end = new Date(start.getTime() + durationMs);

            // 1) Crear el evento y obtener su id
            const ev = await prisma.event.create({
                data: {
                    ...baseCreate,
                    startDate: start,
                    endDate: end,
                    idWorkspaceFk: event.idWorkspaceFk!,
                    idCompanyFk: event.idCompanyFk!,
                    // Cada instancia recurrente tiene su propio booking code
                    idGroup: uuidv4(), // 🟢 nuevo idGroup para esta ocurrencia
                    // idServiceFk: event.service?.id ?? null,
                    recurrenceRule: { connect: { id: newRuleId } },
                    eventParticipant: {
                        create: eventParticipant?.map(ep => ({
                            idClientFk: ep.idClientFk!,
                            idClientWorkspaceFk: ep.idClientWorkspaceFk!,
                        })) ?? [],
                    },
                },
                // include si lo necesitas; no es obligatorio para el id
                include: { eventParticipant: true }
            });

            // 2) Notificación para la nueva instancia de recurrencia
            const action: ActionKey = "addFromRecurrence";

            const idGroup = (ev as any)?.idGroup;
            if (idGroup) {
                createNotification(idGroup, {
                    actionSectionType: action,
                });
            }
        }

    }

    async handleWindow(
        payload: EventForBackend,
        prisma: PrismaClient,
        _oldRuleId?: string,
        newRuleId?: string,
        amountMax: number = DEFAULT_RECURRENCE_COUNT
    ): Promise<void> {
        if (!newRuleId) throw new Error("NewStrategy.handleWindow requires newRuleId");

        const { skipMainEvent, event, eventParticipant, recurrenceRule } = payload;
        if (!recurrenceRule?.dtstart) throw new Error("Missing dtstart in recurrenceRule");

        // 1) Prepara límites "YYYYMMDD"
        const dtstartDay = moment(recurrenceRule.dtstart).format("YYYYMMDD");
        const origDay = moment(event.startDate).format("YYYYMMDD");

        // 2) Normaliza count y topea
        const raw = Number(amountMax);
        const validated = Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_RECURRENCE_COUNT;
        const count = Math.min(MAX_RECURRENCE_COUNT, validated);

        // 3) Filtra rdates (descarta < dtstartDay y, si skipMainEvent, descarta el día original)
        const kept = (recurrenceRule.rdates ?? [])
            .filter((r) => {
                if (r < dtstartDay) return false;
                if (skipMainEvent && r === origDay) return false;
                return true;
            })
            .sort() // "YYYYMMDD" → orden lexicográfico = cronológico
            .slice(0, count);

        if (!kept.length) {
            console.log("[handleWindow] No hay fechas válidas tras filtrar.");
            return;
        }

        // 4) Hora y duración del evento original
        const startOrig = moment(event.startDate);
        const durationMs = moment(event.endDate).diff(startOrig);
        const H = startOrig.hour();
        const M = startOrig.minute();
        const S = startOrig.second();

        // 5) Base para crear eventos (título, snapshots, etc.)
        const baseCreate = toPrismaEventCreate(event);

        // 6) Procesa por ocurrencia: EVENTO → PLAN en transacción por cada fecha
        for (const r of kept) {
            const m = moment(r, "YYYYMMDD").hour(H).minute(M).second(S).millisecond(0);
            const start = m.toDate();
            const end = moment(m).add(durationMs, "milliseconds").toDate();

            await prisma.$transaction(async (tx) => {
                // 6.1 Crear el evento
                const ev = await tx.event.create({
                    data: {
                        ...baseCreate,
                        startDate: start,
                        endDate: end,
                        idWorkspaceFk: event.idWorkspaceFk!,
                        idCompanyFk: event.idCompanyFk!,
                        idServiceFk: event.service?.id ?? null,
                        recurrenceRule: { connect: { id: newRuleId } },
                        // Cada ocurrencia creada en ventana también con booking propio
                        idGroup: uuidv4(), // 🟢 nuevo idGroup para esta ocurrencia
                        eventParticipant: {
                            create:
                                eventParticipant?.map((ep) => ({
                                    idClientFk: ep.idClientFk!,
                                    idClientWorkspaceFk: ep.idClientWorkspaceFk!,
                                })) ?? [],
                        },
                    },
                    include: { eventParticipant: true }

                });

                // 6.2 Crear NotificationPlan (siempre nuevo)
                const action: ActionKey = "addFromRecurrence";

                const idGroup = (ev as any)?.idGroup;
                if (idGroup) {
                    createNotification(idGroup, {
                        actionSectionType: action,
                    });
                }
            });
        }
    }

}
