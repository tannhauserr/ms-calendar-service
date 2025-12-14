// // src/services/recurrence-rule/strategy/all.strategy.ts
// import { EventForBackend } from "../../event/dto/EventForBackend";
// import { PrismaClient, Prisma, Event } from "@prisma/client";
// import { RRule } from "rrule";
// import { toPrismaEventCreate } from "../../event/util/toPrismaEventCreate";
// import { toPrismaEventUpdate } from "../../event/util/toPrismaEventUpdate";
// import { DEFAULT_RECURRENCE_COUNT, getRecurrenceDates, MAX_RECURRENCE_COUNT, RecurrenceStrategy } from "./type";
// import { createNotification } from "../../../../models/notification/util/trigger/for-action";
// import { deleteRecordsRoutingKeys, publishDeleteRecordsMessage } from "../../../@rabbitmq/pubsub/functions";
// import { ActionKey } from "../../../../models/notification/util/action-to-senctions";

// const COUNT_EVENT_MAX = 15;

// export class AllStrategy implements RecurrenceStrategy {

//     async handleImmediate(
//         payload: EventForBackend,
//         tx: PrismaClient
//     ): Promise<string> {
//         const { event, recurrenceRuleUpdate } = payload;
//         if (!recurrenceRuleUpdate?.id) throw new Error("No rule ID");

//         const ruleId = recurrenceRuleUpdate.id;
//         const cutDate = new Date(event.startDate);

//         // 1) Cerrar la regla antigua justo antes de cutDate
//         const untilOld = new Date(cutDate.getTime() - 1);
//         await tx.recurrenceRule.update({ where: { id: ruleId }, data: { until: untilOld } });

//         // 2) Crear nueva regla iniciada en cutDate
//         const originalRule = await tx.recurrenceRule.findUniqueOrThrow({ where: { id: ruleId } });
//         const newRule = await tx.recurrenceRule.create({
//             data: {
//                 dtstart: cutDate,
//                 rrule: recurrenceRuleUpdate.rrule!,
//                 rdates: recurrenceRuleUpdate.rdates || [],
//                 tzid: recurrenceRuleUpdate.tzid!,
//                 until: recurrenceRuleUpdate.until ? new Date(recurrenceRuleUpdate.until) : null,
//                 recurrenceStatusType: recurrenceRuleUpdate.recurrenceStatusType!,
//                 // idCalendarFk: originalRule.idCalendarFk
//                 idWorkspaceFk: originalRule.idWorkspaceFk
//             }
//         });

//         // 3) Devolver nueva regla para que el servicio actualice solo la instancia actual
//         return newRule.id;
//     }

//     // Dentro de AllStrategy


//     // AllStrategy.handleBackground (sin transacciones, reusa IDs antiguos)
//     // =======================
//     handleBackground = async (
//         payload: EventForBackend,
//         prisma: PrismaClient,
//         oldRuleId: string,
//         newRuleId: string,
//         amountMax: number = COUNT_EVENT_MAX
//     ): Promise<void> => {
//         // 1) Viejas ocurrencias futuras de la regla antigua (con IDs)
//         const now = new Date();
//         const oldEvents = await prisma.event.findMany({
//             where: { idRecurrenceRuleFk: oldRuleId, startDate: { gt: now } },
//             select: { id: true, startDate: true, endDate: true },
//             orderBy: { startDate: "asc" }
//         });
//         const oldDates = oldEvents.map(e => e.startDate);

//         // 2) Normaliza/topes
//         const raw = Number(amountMax);
//         const validated = Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_RECURRENCE_COUNT;
//         const count = Math.min(MAX_RECURRENCE_COUNT, validated);

//         // 3) Nuevas fechas según la nueva regla
//         const newRule = await prisma.recurrenceRule.findUniqueOrThrow({ where: { id: newRuleId } });
//         const opts = RRule.parseString(newRule.rrule!);
//         opts.dtstart = newRule.dtstart;
//         opts.tzid = newRule.tzid!;
//         opts.count = count;

//         const allRuleDates = new RRule(opts).all();
//         const futureDates = allRuleDates.filter(d => d.getTime() > newRule.dtstart.getTime());

//         // 4) Unificar sin duplicados y limitar (mantiene la intención original)
//         const seen = new Set<number>();
//         const uniqueDates: Date[] = [];
//         for (const d of [...oldDates, ...futureDates]) {
//             const t = d.getTime();
//             if (!seen.has(t)) {
//                 seen.add(t);
//                 uniqueDates.push(d);
//             }
//         }
//         // Orden garantizado ascendente por timestamp
//         uniqueDates.sort((a, b) => a.getTime() - b.getTime());
//         const datesToCreate = uniqueDates.slice(0, COUNT_EVENT_MAX);

//         // 5) Borrar todas las futuras de la regla antigua
//         if (oldEvents.length) {
//             const ids = oldEvents.map(e => e.id);
//             await prisma.eventParticipant.deleteMany({ where: { idEventFk: { in: ids } } });
//             await prisma.event.deleteMany({ where: { id: { in: ids } } });

//             try {
//                 publishDeleteRecordsMessage(
//                     { table: "calendarEvents", ids },
//                     deleteRecordsRoutingKeys.notification
//                 );
//             } catch (err) {
//                 console.error("[AllStrategy.handleBackground] publishDeleteRecordsMessage error:", err);
//             }
//         }

//         // 6) Recrear: primero emparejadas reutilizando IDs antiguos, luego extras con IDs nuevos
//         const baseCreate = toPrismaEventCreate(payload.event);
//         const defaultDurationMs =
//             new Date(payload.event.endDate).getTime() -
//             new Date(payload.event.startDate).getTime();

//         // 6.a) Empareja por índice (orden estable por fecha)
//         const pairCount = Math.min(oldEvents.length, datesToCreate.length);


//         console.log("mira que es payload", JSON.stringify(payload));



//         for (let i = 0; i < pairCount; i++) {
//             const old = oldEvents[i];
//             const start = datesToCreate[i];
//             const durationMs = (old?.endDate?.getTime?.() ?? 0) - (old?.startDate?.getTime?.() ?? 0) || defaultDurationMs;
//             const end = new Date(start.getTime() + durationMs);

//             const ev = await prisma.event.create({
//                 data: {
//                     id: old.id, // ← reutiliza el ID antiguo
//                     ...baseCreate,
//                     startDate: start,
//                     endDate: end,
//                     idWorkspaceFk: payload.event.idWorkspaceFk!,
//                     idCompanyFk: payload.event.idCompanyFk!,
//                     idServiceFk: payload.event.service?.id ?? null,
//                     recurrenceRule: { connect: { id: newRuleId } },
//                     eventParticipant: {
//                         create:
//                             payload.eventParticipant?.map(ep => ({
//                                 idClientFk: ep.idClientFk!,
//                                 idClientWorkspaceFk: ep.idClientWorkspaceFk!
//                             })) ?? []
//                     }
//                 },
//                 include: { eventParticipant: true }
//             });

//             // 🔔 Notificar solo si la instancia ya existía y cambió algo relevante (hora/duración/estado)
//             const durationOld = (old?.endDate?.getTime?.() ?? 0) - (old?.startDate?.getTime?.() ?? 0);
//             const durationNew = end.getTime() - start.getTime();
//             const statusOld = (old as any)?.status ?? null;
//             const statusNew = (ev as any)?.status ?? null; // usa el valor real creado

//             const stateChanged =
//                 old.startDate.getTime() !== start.getTime() || // cambió el inicio
//                 durationOld !== durationNew ||                 // cambió la duración
//                 statusOld !== statusNew;                       // cambió el estado

//             console.log("[AllStrategy] stateChanged?", stateChanged, {
//                 startOld: old.startDate.toISOString(),
//                 startNew: start.toISOString(),
//                 durationOld,
//                 durationNew,
//                 statusOld,
//                 statusNew,
//             });

//             if (stateChanged) {
//                 const action: ActionKey = "addFromRecurrence";
//                 createNotification(ev, { actionSectionType: action });
//             }

//         }

//         // 6.b) Fechas extra (sin ID antiguo disponible)
//         for (let i = pairCount; i < datesToCreate.length; i++) {
//             const start = datesToCreate[i];
//             const end = new Date(start.getTime() + defaultDurationMs);

//             const ev = await prisma.event.create({
//                 data: {
//                     ...baseCreate,
//                     startDate: start,
//                     endDate: end,
//                     idWorkspaceFk: payload.event.idWorkspaceFk!,
//                     idCompanyFk: payload.event.idCompanyFk!,
//                     idServiceFk: payload.event.service?.id ?? null,
//                     recurrenceRule: { connect: { id: newRuleId } },
//                     eventParticipant: {
//                         create:
//                             payload.eventParticipant?.map(ep => ({
//                                 idClientFk: ep.idClientFk!,
//                                 idClientWorkspaceFk: ep.idClientWorkspaceFk!
//                             })) ?? []
//                     }
//                 },
//                 include: { eventParticipant: true }
//             });

//             const action: ActionKey = "addFromRecurrence";
//             createNotification(ev, { actionSectionType: action });
//         }
//     };



//     // =======================
//     // AllStrategy.handleWindow (sin transacciones, reusa IDs antiguos)
//     // =======================
//     handleWindow = async (
//         payload: EventForBackend,
//         prisma: PrismaClient,
//         oldRuleId?: string,
//         newRuleId?: string,
//         amountMax: number = DEFAULT_RECURRENCE_COUNT
//     ): Promise<void> => {
//         if (!oldRuleId || !newRuleId) {
//             throw new Error("AllStrategy.handleWindow requiere oldRuleId y newRuleId");
//         }

//         const { event, eventParticipant } = payload;
//         const windowStart = new Date(event.startDate);

//         // 1) Viejas ocurrencias desde windowStart (IDs + fechas) ordenadas
//         const futureOld = await prisma.event.findMany({
//             where: { idRecurrenceRuleFk: oldRuleId, startDate: { gte: windowStart } },
//             select: { id: true, startDate: true, endDate: true },
//             orderBy: { startDate: "asc" }
//         });

//         // 2) Fechas nuevas (rdates/rrule) ≥ windowStart
//         const candidateDates = getRecurrenceDates(payload, amountMax)
//             .filter(d => d.getTime() >= windowStart.getTime())
//             .sort((a, b) => a.getTime() - b.getTime());

//         if (!candidateDates.length) {
//             // No recreamos nada; nada que borrar/crear
//             return;
//         }

//         // 3) Borrar futuros (antiguos) primero
//         if (futureOld.length) {
//             const idsToDelete = futureOld.map(e => e.id);
//             await prisma.eventParticipant.deleteMany({ where: { idEventFk: { in: idsToDelete } } });
//             await prisma.event.deleteMany({ where: { id: { in: idsToDelete } } });

//             // 🔔 Notificar borrado masivo
//             try {
//                 publishDeleteRecordsMessage(
//                     { table: "calendarEvents", ids: idsToDelete },
//                     deleteRecordsRoutingKeys.notification
//                 );
//             } catch (err) {
//                 console.error("[AllStrategy.handleWindow] publishDeleteRecordsMessage error:", err);
//             }
//         }

//         // 4) Hora + duración base
//         const origStart = new Date(event.startDate);
//         const origEnd = new Date(event.endDate);
//         const durationMsBase = origEnd.getTime() - origStart.getTime();
//         const [hour, minute, second, ms] = [
//             origStart.getHours(),
//             origStart.getMinutes(),
//             origStart.getSeconds(),
//             origStart.getMilliseconds(),
//         ];

//         const baseCreate = toPrismaEventCreate(event);

//         // 5) Recrear: emparejadas reutilizando IDs antiguos, luego extras
//         const pairCount = Math.min(futureOld.length, candidateDates.length);

//         console.log("mira que es event", JSON.stringify(event));

//         // 5.a) Emparejadas con el MISMO id
//         for (let i = 0; i < pairCount; i++) {
//             const old = futureOld[i];
//             const dateOnly = candidateDates[i];

//             const start = new Date(dateOnly);
//             start.setHours(hour, minute, second, ms);

//             const durationMs =
//                 (old?.endDate?.getTime?.() ?? 0) - (old?.startDate?.getTime?.() ?? 0) || durationMsBase;

//             const end = new Date(start.getTime() + durationMs);

//             const ev = await prisma.event.create({
//                 data: {
//                     id: old.id, // ← reutiliza el ID antiguo
//                     ...baseCreate,
//                     startDate: start,
//                     endDate: end,
//                     idWorkspaceFk: event.idWorkspaceFk!,
//                     idCompanyFk: event.idCompanyFk!,
//                     idServiceFk: event.service?.id ?? null,
//                     recurrenceRule: { connect: { id: newRuleId } },
//                     eventParticipant: {
//                         create:
//                             eventParticipant?.map(ep => ({
//                                 idClientFk: ep.idClientFk!,
//                                 idClientWorkspaceFk: ep.idClientWorkspaceFk!,
//                             })) ?? []
//                     }
//                 },
//                 include: { eventParticipant: true }
//             });

//             // 🔔 Notificar solo si la instancia ya existía y cambió algo relevante (hora/duración/estado)
//             const durationOld = (old?.endDate?.getTime?.() ?? 0) - (old?.startDate?.getTime?.() ?? 0);
//             const durationNew = end.getTime() - start.getTime();
//             const statusOld = (old as any)?.status ?? null;
//             const statusNew = (ev as any)?.status ?? null; // usa el valor real creado

//             const stateChanged =
//                 old.startDate.getTime() !== start.getTime() || // cambió el inicio
//                 durationOld !== durationNew ||                 // cambió la duración
//                 statusOld !== statusNew;                       // cambió el estado

//             console.log("[AllStrategy] stateChanged?", stateChanged, {
//                 startOld: old.startDate.toISOString(),
//                 startNew: start.toISOString(),
//                 durationOld,
//                 durationNew,
//                 statusOld,
//                 statusNew,
//             });

//             if (stateChanged) {
//                 const action: ActionKey = "addFromRecurrence";
//                 createNotification(ev, { actionSectionType: action });
//             }
//         }

//         // 5.b) Extras (candidatas sin ID antiguo)
//         for (let i = pairCount; i < candidateDates.length; i++) {
//             const dateOnly = candidateDates[i];

//             const start = new Date(dateOnly);
//             start.setHours(hour, minute, second, ms);

//             const end = new Date(start.getTime() + durationMsBase);

//             const ev = await prisma.event.create({
//                 data: {
//                     ...baseCreate,
//                     startDate: start,
//                     endDate: end,
//                     idWorkspaceFk: event.idWorkspaceFk!,
//                     idCompanyFk: event.idCompanyFk!,
//                     idServiceFk: event.service?.id ?? null,
//                     recurrenceRule: { connect: { id: newRuleId } },
//                     eventParticipant: {
//                         create:
//                             eventParticipant?.map(ep => ({
//                                 idClientFk: ep.idClientFk!,
//                                 idClientWorkspaceFk: ep.idClientWorkspaceFk!,
//                             })) ?? []
//                     }
//                 },
//                 include: { eventParticipant: true }
//             });

//             const action: ActionKey = "addFromRecurrence";
//             createNotification(ev, { actionSectionType: action });
//         }

//         console.log(`✅ [AllStrategy.handleWindow] Recreated ${candidateDates.length} instances (reused ${pairCount} IDs)`);
//     }


// }


// src/services/recurrence-rule/strategy/all.strategy.ts
import { EventForBackend } from "../../event/dto/EventForBackend";
import { PrismaClient, Prisma, Event } from "@prisma/client";
import { RRule } from "rrule";
import { toPrismaEventCreate } from "../../event/util/toPrismaEventCreate";
import { toPrismaEventUpdate } from "../../event/util/toPrismaEventUpdate";
import {
    DEFAULT_RECURRENCE_COUNT,
    getRecurrenceDates,
    MAX_RECURRENCE_COUNT,
    RecurrenceStrategy
} from "./type";
import { createNotification } from "../../../../models/notification/util/trigger/for-action";
import {
    deleteRecordsRoutingKeys,
    publishDeleteRecordsMessage
} from "../../../@rabbitmq/pubsub/functions";
import { ActionKey } from "../../../../models/notification/util/action-to-senctions";
import { v4 as uuidv4 } from "uuid"; // 🟢 para idGroup / booking code

const COUNT_EVENT_MAX = 15;

export class AllStrategy implements RecurrenceStrategy {

    async handleImmediate(
        payload: EventForBackend,
        tx: PrismaClient
    ): Promise<string> {
        const { event, recurrenceRuleUpdate } = payload;
        if (!recurrenceRuleUpdate?.id) throw new Error("No rule ID");

        const ruleId = recurrenceRuleUpdate.id;
        const cutDate = new Date(event.startDate);

        // 1) Cerrar la regla antigua justo antes de cutDate
        const untilOld = new Date(cutDate.getTime() - 1);
        await tx.recurrenceRule.update({ where: { id: ruleId }, data: { until: untilOld } });

        // 2) Crear nueva regla iniciada en cutDate
        const originalRule = await tx.recurrenceRule.findUniqueOrThrow({ where: { id: ruleId } });
        const newRule = await tx.recurrenceRule.create({
            data: {
                dtstart: cutDate,
                rrule: recurrenceRuleUpdate.rrule!,
                rdates: recurrenceRuleUpdate.rdates || [],
                tzid: recurrenceRuleUpdate.tzid!,
                until: recurrenceRuleUpdate.until ? new Date(recurrenceRuleUpdate.until) : null,
                recurrenceStatusType: recurrenceRuleUpdate.recurrenceStatusType!,
                // idCalendarFk: originalRule.idCalendarFk
                idWorkspaceFk: originalRule.idWorkspaceFk
            }
        });

        // 3) Devolver nueva regla para que el servicio actualice solo la instancia actual
        return newRule.id;
    }

    // AllStrategy.handleBackground (sin transacciones, reusa IDs antiguos)
    // =======================
    handleBackground = async (
        payload: EventForBackend,
        prisma: PrismaClient,
        oldRuleId: string,
        newRuleId: string,
        amountMax: number = COUNT_EVENT_MAX
    ): Promise<void> => {
        // 1) Viejas ocurrencias futuras de la regla antigua (con IDs)
        const now = new Date();
        const oldEvents = await prisma.event.findMany({
            where: { idRecurrenceRuleFk: oldRuleId, startDate: { gt: now } },
            select: {
                id: true,
                startDate: true,
                endDate: true,
                idGroup: true,          // 🟢 booking code antiguo
                eventStatusType: true,  // por si lo necesitas para estado
            },
            orderBy: { startDate: "asc" }
        });
        const oldDates = oldEvents.map(e => e.startDate);

        // 2) Normaliza/topes
        const raw = Number(amountMax);
        const validated = Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_RECURRENCE_COUNT;
        const count = Math.min(MAX_RECURRENCE_COUNT, validated);

        // 3) Nuevas fechas según la nueva regla
        const newRule = await prisma.recurrenceRule.findUniqueOrThrow({ where: { id: newRuleId } });
        const opts = RRule.parseString(newRule.rrule!);
        opts.dtstart = newRule.dtstart;
        opts.tzid = newRule.tzid!;
        opts.count = count;

        const allRuleDates = new RRule(opts).all();
        const futureDates = allRuleDates.filter(d => d.getTime() > newRule.dtstart.getTime());

        // 4) Unificar sin duplicados y limitar (mantiene la intención original)
        const seen = new Set<number>();
        const uniqueDates: Date[] = [];
        for (const d of [...oldDates, ...futureDates]) {
            const t = d.getTime();
            if (!seen.has(t)) {
                seen.add(t);
                uniqueDates.push(d);
            }
        }
        // Orden garantizado ascendente por timestamp
        uniqueDates.sort((a, b) => a.getTime() - b.getTime());
        const datesToCreate = uniqueDates.slice(0, COUNT_EVENT_MAX);

        // 5) Borrar todas las futuras de la regla antigua
        if (oldEvents.length) {
            const ids = oldEvents.map(e => e.id);
            await prisma.eventParticipant.deleteMany({ where: { idEventFk: { in: ids } } });
            await prisma.event.deleteMany({ where: { id: { in: ids } } });

            try {
                publishDeleteRecordsMessage(
                    { table: "calendarEvents", ids },
                    deleteRecordsRoutingKeys.notification
                );
            } catch (err) {
                console.error("[AllStrategy.handleBackground] publishDeleteRecordsMessage error:", err);
            }
        }

        // 6) Recrear: primero emparejadas reutilizando IDs antiguos, luego extras con IDs nuevos
        const baseCreate = toPrismaEventCreate(payload.event);
        const defaultDurationMs =
            new Date(payload.event.endDate).getTime() -
            new Date(payload.event.startDate).getTime();

        // 6.a) Empareja por índice (orden estable por fecha)
        const pairCount = Math.min(oldEvents.length, datesToCreate.length);

        console.log("mira que es payload", JSON.stringify(payload));

        for (let i = 0; i < pairCount; i++) {
            const old = oldEvents[i];
            const start = datesToCreate[i];
            const durationMs =
                (old?.endDate?.getTime?.() ?? 0) -
                (old?.startDate?.getTime?.() ?? 0) || defaultDurationMs;
            const end = new Date(start.getTime() + durationMs);

            const ev = await prisma.event.create({
                data: {
                    id: old.id, // ← reutiliza el ID antiguo
                    ...baseCreate,
                    startDate: start,
                    endDate: end,
                    idWorkspaceFk: payload.event.idWorkspaceFk!,
                    idCompanyFk: payload.event.idCompanyFk!,
                    idServiceFk: payload.event.service?.id ?? null,
                    recurrenceRule: { connect: { id: newRuleId } },
                    // 🟢 Conservamos booking code de esa instancia; si no tiene, generamos uno
                    idGroup: old.idGroup ?? uuidv4(),
                    eventParticipant: {
                        create:
                            payload.eventParticipant?.map(ep => ({
                                idClientFk: ep.idClientFk!,
                                idClientWorkspaceFk: ep.idClientWorkspaceFk!
                            })) ?? []
                    }
                },
                include: { eventParticipant: true }
            });

            // 🔔 Notificar solo si la instancia ya existía y cambió algo relevante (hora/duración/estado)
            const durationOld =
                (old?.endDate?.getTime?.() ?? 0) -
                (old?.startDate?.getTime?.() ?? 0);
            const durationNew = end.getTime() - start.getTime();
            const statusOld = (old as any)?.status ?? null;
            const statusNew = (ev as any)?.status ?? null; // usa el valor real creado

            const stateChanged =
                old.startDate.getTime() !== start.getTime() || // cambió el inicio
                durationOld !== durationNew ||                 // cambió la duración
                statusOld !== statusNew;                       // cambió el estado

            console.log("[AllStrategy] stateChanged?", stateChanged, {
                startOld: old.startDate.toISOString(),
                startNew: start.toISOString(),
                durationOld,
                durationNew,
                statusOld,
                statusNew,
            });

            if (stateChanged) {
                const action: ActionKey = "addFromRecurrence";
                createNotification(ev, { actionSectionType: action });
            }

        }

        // 6.b) Fechas extra (sin ID antiguo disponible)
        for (let i = pairCount; i < datesToCreate.length; i++) {
            const start = datesToCreate[i];
            const end = new Date(start.getTime() + defaultDurationMs);

            const ev = await prisma.event.create({
                data: {
                    ...baseCreate,
                    startDate: start,
                    endDate: end,
                    idWorkspaceFk: payload.event.idWorkspaceFk!,
                    idCompanyFk: payload.event.idCompanyFk!,
                    idServiceFk: payload.event.service?.id ?? null,
                    recurrenceRule: { connect: { id: newRuleId } },
                    // 🟢 Nueva instancia de la serie ⇒ nuevo booking code
                    idGroup: uuidv4(),
                    eventParticipant: {
                        create:
                            payload.eventParticipant?.map(ep => ({
                                idClientFk: ep.idClientFk!,
                                idClientWorkspaceFk: ep.idClientWorkspaceFk!
                            })) ?? []
                    }
                },
                include: { eventParticipant: true }
            });

            const action: ActionKey = "addFromRecurrence";
            createNotification(ev, { actionSectionType: action });
        }
    };

    // =======================
    // AllStrategy.handleWindow (sin transacciones, reusa IDs antiguos)
    // =======================
    handleWindow = async (
        payload: EventForBackend,
        prisma: PrismaClient,
        oldRuleId?: string,
        newRuleId?: string,
        amountMax: number = DEFAULT_RECURRENCE_COUNT
    ): Promise<void> => {
        if (!oldRuleId || !newRuleId) {
            throw new Error("AllStrategy.handleWindow requiere oldRuleId y newRuleId");
        }

        const { event, eventParticipant } = payload;
        const windowStart = new Date(event.startDate);

        // 1) Viejas ocurrencias desde windowStart (IDs + fechas) ordenadas
        const futureOld = await prisma.event.findMany({
            where: { idRecurrenceRuleFk: oldRuleId, startDate: { gte: windowStart } },
            select: {
                id: true,
                startDate: true,
                endDate: true,
                idGroup: true,          // 🟢 booking code antiguo
                eventStatusType: true,  // por si se quiere comparar estado
            },
            orderBy: { startDate: "asc" }
        });

        // 2) Fechas nuevas (rdates/rrule) ≥ windowStart
        const candidateDates = getRecurrenceDates(payload, amountMax)
            .filter(d => d.getTime() >= windowStart.getTime())
            .sort((a, b) => a.getTime() - b.getTime());

        if (!candidateDates.length) {
            // No recreamos nada; nada que borrar/crear
            return;
        }

        // 3) Borrar futuros (antiguos) primero
        if (futureOld.length) {
            const idsToDelete = futureOld.map(e => e.id);
            await prisma.eventParticipant.deleteMany({ where: { idEventFk: { in: idsToDelete } } });
            await prisma.event.deleteMany({ where: { id: { in: idsToDelete } } });

            // 🔔 Notificar borrado masivo
            try {
                publishDeleteRecordsMessage(
                    { table: "calendarEvents", ids: idsToDelete },
                    deleteRecordsRoutingKeys.notification
                );
            } catch (err) {
                console.error("[AllStrategy.handleWindow] publishDeleteRecordsMessage error:", err);
            }
        }

        // 4) Hora + duración base
        const origStart = new Date(event.startDate);
        const origEnd = new Date(event.endDate);
        const durationMsBase = origEnd.getTime() - origStart.getTime();
        const [hour, minute, second, ms] = [
            origStart.getHours(),
            origStart.getMinutes(),
            origStart.getSeconds(),
            origStart.getMilliseconds(),
        ];

        const baseCreate = toPrismaEventCreate(event);

        // 5) Recrear: emparejadas reutilizando IDs antiguos, luego extras
        const pairCount = Math.min(futureOld.length, candidateDates.length);

        console.log("mira que es event", JSON.stringify(event));

        // 5.a) Emparejadas con el MISMO id
        for (let i = 0; i < pairCount; i++) {
            const old = futureOld[i];
            const dateOnly = candidateDates[i];

            const start = new Date(dateOnly);
            start.setHours(hour, minute, second, ms);

            const durationMs =
                (old?.endDate?.getTime?.() ?? 0) -
                (old?.startDate?.getTime?.() ?? 0) || durationMsBase;

            const end = new Date(start.getTime() + durationMs);

            const ev = await prisma.event.create({
                data: {
                    id: old.id, // ← reutiliza el ID antiguo
                    ...baseCreate,
                    startDate: start,
                    endDate: end,
                    idWorkspaceFk: event.idWorkspaceFk!,
                    idCompanyFk: event.idCompanyFk!,
                    idServiceFk: event.service?.id ?? null,
                    recurrenceRule: { connect: { id: newRuleId } },
                    // 🟢 Conserva booking code previo (o crea uno si no tenía)
                    idGroup: old.idGroup ?? uuidv4(),
                    eventParticipant: {
                        create:
                            eventParticipant?.map(ep => ({
                                idClientFk: ep.idClientFk!,
                                idClientWorkspaceFk: ep.idClientWorkspaceFk!,
                            })) ?? []
                    }
                },
                include: { eventParticipant: true }
            });

            // 🔔 Notificar solo si la instancia ya existía y cambió algo relevante (hora/duración/estado)
            const durationOld =
                (old?.endDate?.getTime?.() ?? 0) -
                (old?.startDate?.getTime?.() ?? 0);
            const durationNew = end.getTime() - start.getTime();
            const statusOld = (old as any)?.status ?? null;
            const statusNew = (ev as any)?.status ?? null; // usa el valor real creado

            const stateChanged =
                old.startDate.getTime() !== start.getTime() || // cambió el inicio
                durationOld !== durationNew ||                 // cambió la duración
                statusOld !== statusNew;                       // cambió el estado

            console.log("[AllStrategy] stateChanged?", stateChanged, {
                startOld: old.startDate.toISOString(),
                startNew: start.toISOString(),
                durationOld,
                durationNew,
                statusOld,
                statusNew,
            });

            if (stateChanged) {
                const action: ActionKey = "addFromRecurrence";
                createNotification(ev, { actionSectionType: action });
            }
        }

        // 5.b) Extras (candidatas sin ID antiguo)
        for (let i = pairCount; i < candidateDates.length; i++) {
            const dateOnly = candidateDates[i];

            const start = new Date(dateOnly);
            start.setHours(hour, minute, second, ms);

            const end = new Date(start.getTime() + durationMsBase);

            const ev = await prisma.event.create({
                data: {
                    ...baseCreate,
                    startDate: start,
                    endDate: end,
                    idWorkspaceFk: event.idWorkspaceFk!,
                    idCompanyFk: event.idCompanyFk!,
                    idServiceFk: event.service?.id ?? null,
                    recurrenceRule: { connect: { id: newRuleId } },
                    // 🟢 Nueva instancia de la serie ⇒ nuevo booking code
                    idGroup: uuidv4(),
                    eventParticipant: {
                        create:
                            eventParticipant?.map(ep => ({
                                idClientFk: ep.idClientFk!,
                                idClientWorkspaceFk: ep.idClientWorkspaceFk!,
                            })) ?? []
                    }
                },
                include: { eventParticipant: true }
            });

            const action: ActionKey = "addFromRecurrence";
            createNotification(ev, { actionSectionType: action });
        }

        console.log(`✅ [AllStrategy.handleWindow] Recreated ${candidateDates.length} instances (reused ${pairCount} IDs)`);
    }

}
