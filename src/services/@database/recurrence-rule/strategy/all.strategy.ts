// src/services/recurrence-rule/strategy/all.strategy.ts
import { EventForBackend } from "../../event/dto/EventForBackend";
import { PrismaClient, Prisma, ActionSectionType, Event } from "@prisma/client";
import { RRule } from "rrule";
import { toPrismaEventCreate } from "../../event/util/toPrismaEventCreate";
import { toPrismaEventUpdate } from "../../event/util/toPrismaEventUpdate";
import { DEFAULT_RECURRENCE_COUNT, getRecurrenceDates, MAX_RECURRENCE_COUNT, RecurrenceStrategy } from "./type";
import { createNotification } from "../../../../models/notification/util/trigger/for-action";
import { deleteRecordsRoutingKeys, publishDeleteRecordsMessage } from "../../../@rabbitmq/pubsub/functions";

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

    // Dentro de AllStrategy


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
            select: { id: true, startDate: true, endDate: true },
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
            const durationMs = (old?.endDate?.getTime?.() ?? 0) - (old?.startDate?.getTime?.() ?? 0) || defaultDurationMs;
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
            const durationOld = (old?.endDate?.getTime?.() ?? 0) - (old?.startDate?.getTime?.() ?? 0);
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
                const action: ActionSectionType = "addFromRecurrence";
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

            const action: ActionSectionType = "addFromRecurrence";
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
            select: { id: true, startDate: true, endDate: true },
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
                (old?.endDate?.getTime?.() ?? 0) - (old?.startDate?.getTime?.() ?? 0) || durationMsBase;

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
            const durationOld = (old?.endDate?.getTime?.() ?? 0) - (old?.startDate?.getTime?.() ?? 0);
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
                const action: ActionSectionType = "addFromRecurrence";
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

            const action: ActionSectionType = "addFromRecurrence";
            createNotification(ev, { actionSectionType: action });
        }

        console.log(`✅ [AllStrategy.handleWindow] Recreated ${candidateDates.length} instances (reused ${pairCount} IDs)`);
    }


    // handleBackground = async (
    //     payload: EventForBackend,
    //     prisma: PrismaClient,
    //     oldRuleId: string,
    //     newRuleId: string,
    //     amountMax: number = COUNT_EVENT_MAX
    // ): Promise<void> => {
    //     // 1) Lectura de fechas pendientes antiguas
    //     const now = new Date();
    //     const oldEvents = await prisma.event.findMany({
    //         where: { idRecurrenceRuleFk: oldRuleId, startDate: { gt: now } },
    //         select: { startDate: true },
    //         orderBy: { startDate: 'asc' }
    //     });
    //     const oldDates = oldEvents.map(e => e.startDate);


    //     // 1) Validamos y normalizamos amountMax
    //     const raw = Number(amountMax);
    //     const validated = Number.isInteger(raw) && raw > 0
    //         ? raw
    //         : DEFAULT_RECURRENCE_COUNT;

    //     // 2) Nunca generamos más de MAX_RECURRENCE_COUNT
    //     const count = Math.min(MAX_RECURRENCE_COUNT, validated);

    //     // 2) Generación de fechas nuevas según la nueva regla
    //     const newRule = await prisma.recurrenceRule.findUniqueOrThrow({ where: { id: newRuleId } });
    //     const opts = RRule.parseString(newRule.rrule!);
    //     opts.dtstart = newRule.dtstart;
    //     opts.tzid = newRule.tzid!;
    //     opts.count = count; // Limita a las siguientes 'amount' ocurrencias
    //     const allRuleDates = new RRule(opts).all();
    //     const futureDates = allRuleDates.filter(d => d.getTime() > newRule.dtstart.getTime());

    //     const seen = new Set<number>();
    //     const uniqueDates: Date[] = [];
    //     for (const d of [...oldDates, ...futureDates]) {
    //         const t = d.getTime();
    //         if (!seen.has(t)) {
    //             seen.add(t);
    //             uniqueDates.push(d);
    //         }
    //     }
    //     // 3) Concatenar y limitar
    //     const datesToCreate = uniqueDates.slice(0, COUNT_EVENT_MAX);

    //     // 4) Eliminar eventos pendientes de la regla antigua
    //     const toDelete = await prisma.event.findMany({
    //         where: { idRecurrenceRuleFk: oldRuleId, startDate: { gt: now } },
    //         select: { id: true }
    //     });
    //     if (toDelete.length) {
    //         const ids = toDelete.map(e => e.id);
    //         await prisma.eventParticipant.deleteMany({ where: { idEventFk: { in: ids } } });
    //         await prisma.event.deleteMany({ where: { id: { in: ids } } });
    //     }

    //     // 5) Recrear eventos en la nueva regla
    //     const baseCreate = toPrismaEventCreate(payload.event);
    //     const durationMs =
    //         new Date(payload.event.endDate).getTime() -
    //         new Date(payload.event.startDate).getTime();

    //     for (const start of datesToCreate) {
    //         const end = new Date(start.getTime() + durationMs);
    //         await prisma.event.create({
    //             data: {
    //                 ...baseCreate,
    //                 startDate: start,
    //                 endDate: end,
    //                 // calendar: { connect: { id: payload.event.idCalendarFk! } },
    //                 idWorkspaceFk: payload.event.idWorkspaceFk!,
    //                 idCompanyFk: payload.event.idCompanyFk!,
    //                 // service: payload.event.service?.id
    //                 //     ? { connect: { id: payload.event.service.id } }
    //                 //     : undefined,
    //                 idServiceFk: payload.event.service?.id ?? null,
    //                 recurrenceRule: { connect: { id: newRuleId } },
    //                 eventParticipant: {
    //                     create:
    //                         payload.eventParticipant?.map(ep => ({
    //                             idClientFk: ep.idClientFk!,
    //                             idClientWorkspaceFk: ep.idClientWorkspaceFk!
    //                         })) ?? []
    //                 }
    //             }
    //         });
    //     }
    // };





    /**
     * Reemplaza completamente las instancias futuras de “ALL”:
     * - Borra todos los eventos futuros de la regla antigua (oldRuleId)
     * - Genera fechas con getRecurrenceDates (rdates o rrule)
     * - Conserva hora y duración originales de payload.event
     */
    // async handleWindow(
    //     payload: EventForBackend,
    //     prisma: PrismaClient,
    //     oldRuleId?: string,
    //     newRuleId?: string,
    //     amountMax: number = DEFAULT_RECURRENCE_COUNT
    // ): Promise<void> {
    //     if (!oldRuleId || !newRuleId) {
    //         throw new Error("AllStrategy.handleWindow requiere oldRuleId y newRuleId");
    //     }

    //     const { event, eventParticipant } = payload;
    //     const windowStart = new Date(event.startDate);

    //     console.log(
    //         `🔄 [AllStrategy.handleWindow] oldRuleId=${oldRuleId}, newRuleId=${newRuleId}, from=${windowStart.toISOString()}, amountMax=${amountMax}`
    //     );

    //     // 1) Borrar solo los eventos FUTUROS de la regla antigua
    //     const future = await prisma.event.findMany({
    //         where: {
    //             idRecurrenceRuleFk: oldRuleId,
    //             startDate: { gte: windowStart },
    //         },
    //         select: { id: true },
    //     });
    //     const idsToDelete = future.map(e => e.id);
    //     if (idsToDelete.length) {
    //         await prisma.eventParticipant.deleteMany({
    //             where: { idEventFk: { in: idsToDelete } }
    //         });
    //         await prisma.event.deleteMany({
    //             where: { id: { in: idsToDelete } }
    //         });
    //         console.log(`🗑  Deleted ${idsToDelete.length} future events`);
    //     }

    //     // 2) Obtener fechas nuevas según rdates o rrule
    //     const candidateDates = getRecurrenceDates(payload, amountMax)
    //         .filter(d => d.getTime() >= windowStart.getTime());
    //     console.log(
    //         `[AllStrategy.handleWindow] candidateDates=${JSON.stringify(
    //             candidateDates.map(d => d.toISOString())
    //         )}`
    //     );
    //     if (!candidateDates.length) {
    //         console.log("⚠️  No future dates to recreate");
    //         return;
    //     }

    //     // 3) Extraer hora + duración del evento original
    //     const origStart = new Date(event.startDate);
    //     const origEnd = new Date(event.endDate);
    //     const durationMs = origEnd.getTime() - origStart.getTime();
    //     const [hour, minute, second] = [
    //         origStart.getHours(),
    //         origStart.getMinutes(),
    //         origStart.getSeconds(),
    //     ];
    //     console.log(
    //         `[AllStrategy.handleWindow] using time ${hour}:${minute}:${second}, durationMs=${durationMs}`
    //     );

    //     // 4) Crear las nuevas instancias
    //     const baseCreate = toPrismaEventCreate(event);
    //     await Promise.all(
    //         candidateDates.map(dateOnly => {
    //             const start = new Date(dateOnly);
    //             start.setHours(hour, minute, second, 0);
    //             const end = new Date(start.getTime() + durationMs);

    //             console.log(
    //                 `[AllStrategy.handleWindow] creating start=${start.toISOString()}, end=${end.toISOString()}`
    //             );

    //             return prisma.event.create({
    //                 data: {
    //                     ...baseCreate,
    //                     startDate: start,
    //                     endDate: end,
    //                     // calendar: { connect: { id: event.idCalendarFk! } },
    //                     idWorkspaceFk: event.idWorkspaceFk!,
    //                     idCompanyFk: event.idCompanyFk!,
    //                     // service: event.service?.id
    //                     //     ? { connect: { id: event.service.id } }
    //                     //     : undefined,
    //                     idServiceFk: event.service?.id ?? null,
    //                     recurrenceRule: { connect: { id: newRuleId } },
    //                     eventParticipant: {
    //                         create: eventParticipant?.map(ep => ({
    //                             idClientFk: ep.idClientFk!,
    //                             idClientWorkspaceFk: ep.idClientWorkspaceFk!,
    //                         })) ?? []
    //                     }
    //                 }
    //             });
    //         })
    //     );

    //     console.log(
    //         `✅ [AllStrategy.handleWindow] Recreated ${candidateDates.length} instances`
    //     );
    // }

}
