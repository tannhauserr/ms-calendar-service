
// src/services/recurrence-rule/strategy/future.strategy.ts
import { ActionSectionType, Event, PrismaClient, RecurrenceStatusType } from "@prisma/client";
import { RRule } from "rrule";
import { EventForBackend } from "../../event/dto/EventForBackend";
import { DEFAULT_RECURRENCE_COUNT, getValidRDates, MAX_RECURRENCE_COUNT, RecurrenceStrategy } from "./type";
import { toPrismaEventScalars } from "../../event/util/toPrismaEventUpdate";
import { createNotification } from "../../../../models/notification/util/trigger/for-action";
import { deleteRecordsRoutingKeys, publishDeleteRecordsMessage } from "../../../@rabbitmq/pubsub/functions";

export class FutureStrategy implements RecurrenceStrategy {
    /**
     * Cierra la regla antigua justo antes de la instancia actual
     * y crea una nueva regla a partir de esta instancia.
     * Devuelve el ID de la regla recién creada.
     */
    async handleImmediate(
        payload: EventForBackend,
        tx: PrismaClient
    ): Promise<string> {
        const { event, recurrenceRuleUpdate } = payload;
        if (!recurrenceRuleUpdate?.id) throw new Error("No old rule ID");

        const instanceStartMs = new Date(event.startDate).getTime();
        const endOld = new Date(instanceStartMs - 1);
        console.log("⏱ [Immediate] oldRuleId:", recurrenceRuleUpdate.id);
        console.log("⏱ [Immediate] setting oldRule.until to:", endOld.toISOString());

        // 1) Cerrar la regla antigua
        await tx.recurrenceRule.update({
            where: { id: recurrenceRuleUpdate.id },
            data: {
                until: endOld,
            },
        });

        // 2) Crear la nueva regla
        const newRule = await tx.recurrenceRule.create({
            data: {
                dtstart: new Date(event.startDate),
                rrule: recurrenceRuleUpdate.rrule!,
                rdates: recurrenceRuleUpdate?.rdates ?? [],
                tzid: recurrenceRuleUpdate.tzid!,
                until: recurrenceRuleUpdate.until ?? null,
                recurrenceStatusType: recurrenceRuleUpdate.recurrenceStatusType!,
                // idCalendarFk: event.idCalendarFk!,
                idWorkspaceFk: event.idWorkspaceFk!,
            },
        });

        console.log("⏱ [Immediate] created newRuleId:", newRule.id);
        return newRule.id;
    }


    // FutureStrategy.handleBackground
    // ✅ FutureStrategy.handleBackground (sin transacciones)
    // ✅ FutureStrategy.handleBackground (sin transacciones, reusa IDs antiguos)
    async handleBackground(
        payload: EventForBackend,
        prisma: PrismaClient,
        oldRuleId: string,
        newRuleId: string,
        amountMax = 15
    ) {
        try {
            const { event, recurrenceRuleUpdate, eventParticipant } = payload;

            console.log("-------");
            console.log("🔄 [Background] FutureStrategy.handleBackground");
            if (!recurrenceRuleUpdate?.dtstart) return;

            // 1) Validar y normalizar amountMax
            const raw = Number(amountMax);
            const validated = Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_RECURRENCE_COUNT;
            const count = Math.min(MAX_RECURRENCE_COUNT, validated);

            const newDtstart = new Date(event.startDate);
            console.log("🔄 [Background] oldRuleId:", oldRuleId, "newRuleId:", newRuleId);
            console.log("🔄 [Background] new dtstart:", newDtstart.toISOString());

            // 2) Localizar FUTUROS de la regla antigua (con IDs y fechas) desde newDtstart (ordenados)
            const oldFuture = await prisma.event.findMany({
                where: { idRecurrenceRuleFk: oldRuleId, startDate: { gte: newDtstart } },
                select: { id: true, startDate: true, endDate: true },
                orderBy: { startDate: "asc" },
            });
            const oldIds = oldFuture.map(e => e.id);
            console.log("🔄 [Background] old future IDs:", oldIds);

            // 3) Borrar participantes y eventos antiguos (desde newDtstart)
            if (oldIds.length) {
                const delParts = await prisma.eventParticipant.deleteMany({
                    where: { idEventFk: { in: oldIds } },
                });
                console.log("🔄 [Background] deletedParticipants count:", delParts.count);

                const delEvents = await prisma.event.deleteMany({
                    where: { id: { in: oldIds } },
                });
                console.log("🔄 [Background] deletedEvents count:", delEvents.count);

                // ⬇️ PUBLICAR borrado de notificaciones relacionadas
                try {
                    publishDeleteRecordsMessage(
                        { table: "calendarEvents", ids: oldIds },
                        deleteRecordsRoutingKeys.notification
                    );
                } catch (err) {
                    console.error("[FutureStrategy.handleWindow] publishDeleteRecordsMessage error:", err);
                }
            }

            // 4) Fechas nuevas según la RRule (>= dtstart definida en recurrenceRuleUpdate)
            const opts: any = RRule.parseString(recurrenceRuleUpdate.rrule!);
            opts.dtstart = new Date(recurrenceRuleUpdate.dtstart);
            opts.tzid = recurrenceRuleUpdate.tzid!;
            opts.count = count;

            const allDates = new RRule(opts).all();
            const datesToCreate = allDates
                .filter(d => d.getTime() > newDtstart.getTime())
                .sort((a, b) => a.getTime() - b.getTime());

            console.log("🔄 [Background] datesToCreate:", datesToCreate.map(d => d.toISOString()));

            // 5) Duración base (del evento original)
            const durationMs =
                new Date(event.endDate).getTime() - new Date(event.startDate).getTime();

            // 6) Recrear: emparejar por índice y reutilizar IDs antiguos; luego crear extras con IDs nuevos
            const baseScalars = toPrismaEventScalars(event);
            const pairCount = Math.min(oldFuture.length, datesToCreate.length);


            console.log("mira que es event", event);

            // 6.a) Emparejadas (reutiliza el MISMO id)
            for (let i = 0; i < pairCount; i++) {
                const old = oldFuture[i];
                const start = datesToCreate[i];
                const end = new Date(start.getTime() + (old?.endDate?.getTime?.() ?? 0) - (old?.startDate?.getTime?.() ?? 0) || durationMs);

                const ev = await prisma.event.create({
                    data: {
                        id: old.id, // ← reutiliza el ID antiguo
                        ...baseScalars,
                        startDate: start,
                        endDate: end,
                        idRecurrenceRuleFk: newRuleId,
                        eventParticipant: {
                            create:
                                eventParticipant?.map(ep => ({
                                    idClientFk: ep.idClientFk!,
                                    idClientWorkspaceFk: ep.idClientWorkspaceFk!,
                                })) ?? [],
                        },
                    },
                    include: { eventParticipant: true },
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

            // 6.b) Extras (sin ID antiguo disponible)
            for (let i = pairCount; i < datesToCreate.length; i++) {
                const start = datesToCreate[i];
                const end = new Date(start.getTime() + durationMs);

                const ev = await prisma.event.create({
                    data: {
                        ...baseScalars,
                        startDate: start,
                        endDate: end,
                        idRecurrenceRuleFk: newRuleId,
                        eventParticipant: {
                            create:
                                eventParticipant?.map(ep => ({
                                    idClientFk: ep.idClientFk!,
                                    idClientWorkspaceFk: ep.idClientWorkspaceFk!,
                                })) ?? [],
                        },
                    },
                    include: { eventParticipant: true },
                });

                const action: ActionSectionType = "addFromRecurrence";
                createNotification(ev as any, { actionSectionType: action });
            }

            console.log(
                `✅ [Background] recreation done. reused=${pairCount}, createdNew=${Math.max(0, datesToCreate.length - pairCount)}`
            );
        } catch (error) {
            console.error("❌ [Background] Error in FutureStrategy:", error);
            throw error;
        }
    }


    // FutureStrategy.handleWindow
    // ✅ FutureStrategy.handleWindow (sin transacciones, reusa IDs antiguos)
    async handleWindow(
        payload: EventForBackend,
        prisma: PrismaClient,
        oldRuleId?: string,
        newRuleId?: string,
        amountMax?: number
    ): Promise<void> {
        if (!oldRuleId || !newRuleId) {
            throw new Error("handleWindow requiere oldRuleId y newRuleId");
        }

        const { event, recurrenceRuleUpdate, eventParticipant } = payload;
        const windowStart = new Date(event.startDate);

        // 1) Normalizar amountMax
        const raw = Number(amountMax);
        const validated = Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_RECURRENCE_COUNT;
        const count = Math.min(MAX_RECURRENCE_COUNT, validated);

        console.log(
            "🔄 [Window] oldRuleId:",
            oldRuleId,
            "newRuleId:",
            newRuleId,
            "from:",
            windowStart.toISOString(),
            "count:",
            count
        );

        // 2) Viejos desde windowStart (con IDs y fechas), ordenados
        const oldFuture = await prisma.event.findMany({
            where: { idRecurrenceRuleFk: oldRuleId, startDate: { gte: windowStart } },
            select: { id: true, startDate: true, endDate: true },
            orderBy: { startDate: "asc" },
        });
        const oldIds = oldFuture.map(e => e.id);

        // 3) Borrar previos (participantes + eventos)
        if (oldIds.length) {
            await prisma.eventParticipant.deleteMany({ where: { idEventFk: { in: oldIds } } });
            await prisma.event.deleteMany({ where: { id: { in: oldIds } } });


            // ⬇️ PUBLICAR borrado de notificaciones relacionadas
            try {
                publishDeleteRecordsMessage(
                    { table: "calendarEvents", ids: oldIds },
                    deleteRecordsRoutingKeys.notification
                );
            } catch (err) {
                console.error("[FutureStrategy.handleBackground] publishDeleteRecordsMessage error:", err);
            }
        }

        // 4) Parsear y filtrar rdates (solo fechas) ≥ windowStart y limitar
        const candidateDates = getValidRDates(recurrenceRuleUpdate?.rdates)
            .filter(d => d.getTime() >= windowStart.getTime())
            .slice(0, count)
            .sort((a, b) => a.getTime() - b.getTime());

        console.log(
            `[Window] candidateDates (dates only): ${JSON.stringify(
                candidateDates.map(d => d.toISOString().slice(0, 10))
            )}`
        );

        if (candidateDates.length === 0) {
            console.warn("WindowStrategy: no valid rdates to create.");
            return;
        }

        // 5) Extraer hora y duración del EVENTO
        const origStart = new Date(event.startDate);
        const origEnd = new Date(event.endDate);
        const durationMs = origEnd.getTime() - origStart.getTime();
        const hour = origStart.getHours();
        const minute = origStart.getMinutes();
        const second = origStart.getSeconds();
        const ms = origStart.getMilliseconds();

        console.log(`[Window] using original time ${hour}:${minute}:${second}.${ms}, durationMs=${durationMs}`);

        // 6) Recrear: emparejadas reutilizando IDs antiguos; luego extras
        const baseScalars = toPrismaEventScalars(event);
        const pairCount = Math.min(oldFuture.length, candidateDates.length);

        // 6.a) Emparejadas (mismo id)
        for (let i = 0; i < pairCount; i++) {
            const old = oldFuture[i];
            const dateOnly = candidateDates[i];

            const start = new Date(dateOnly);
            start.setHours(hour, minute, second, ms);
            const end = new Date(start.getTime() + ((old?.endDate?.getTime?.() ?? 0) - (old?.startDate?.getTime?.() ?? 0) || durationMs));

            const ev = await prisma.event.create({
                data: {
                    id: old.id, // ← reutiliza el ID antiguo
                    ...baseScalars,
                    startDate: start,
                    endDate: end,
                    idRecurrenceRuleFk: newRuleId,
                    eventParticipant: {
                        create:
                            eventParticipant?.map(ep => ({
                                idClientFk: ep.idClientFk!,
                                idClientWorkspaceFk: ep.idClientWorkspaceFk!,
                            })) ?? [],
                    },
                },
                include: { eventParticipant: true },
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

        // 6.b) Extras (sin id antiguo)
        for (let i = pairCount; i < candidateDates.length; i++) {
            const dateOnly = candidateDates[i];

            const start = new Date(dateOnly);
            start.setHours(hour, minute, second, ms);
            const end = new Date(start.getTime() + durationMs);

            const ev = await prisma.event.create({
                data: {
                    ...baseScalars,
                    startDate: start,
                    endDate: end,
                    idRecurrenceRuleFk: newRuleId,
                    eventParticipant: {
                        create:
                            eventParticipant?.map(ep => ({
                                idClientFk: ep.idClientFk!,
                                idClientWorkspaceFk: ep.idClientWorkspaceFk!,
                            })) ?? [],
                    },
                },
                include: { eventParticipant: true },
            });

            const action: ActionSectionType = "addFromRecurrence";
            createNotification(ev, { actionSectionType: action });
        }

        console.log(`✅ [Window] instances recreated (reused ${pairCount} IDs, created ${Math.max(0, candidateDates.length - pairCount)} new).`);
    }





    /**
     * Borra todos los EventParticipant de los eventos futuros de la regla antigua
     * y luego elimina esos eventos. Después reconstruye todas las ocurrencias
     * (>= nueva dtstart) bajo la regla nueva, copiando scalars y participantes.
     */
    // async handleBackground(
    //     payload: EventForBackend,
    //     prisma: PrismaClient,
    //     oldRuleId: string,
    //     newRuleId: string,
    //     amountMax = 15
    // ) {
    //     try {
    //         const { event, recurrenceRuleUpdate, eventParticipant } = payload;


    //         console.log("-------")
    //         console.log("🔄 [Background] FutureStrategy.handleBackground")
    //         console.log("Event ", event);
    //         if (!recurrenceRuleUpdate?.dtstart) return;

    //         // 1) Validamos y normalizamos amountMax
    //         const raw = Number(amountMax);
    //         const validated = Number.isInteger(raw) && raw > 0
    //             ? raw
    //             : DEFAULT_RECURRENCE_COUNT;

    //         // 2) Nunca generamos más de MAX_RECURRENCE_COUNT
    //         const count = Math.min(MAX_RECURRENCE_COUNT, validated);

    //         const newDtstart = new Date(event.startDate);
    //         console.log("🔄 [Background] oldRuleId:", oldRuleId, "newRuleId:", newRuleId);
    //         console.log("🔄 [Background] new dtstart:", newDtstart.toISOString());

    //         // 1) Localiza IDs de eventos futuros a borrar
    //         const toDelete = await prisma.event.findMany({
    //             where: {
    //                 idRecurrenceRuleFk: oldRuleId,
    //                 startDate: { gte: newDtstart },
    //             },
    //             select: { id: true },
    //         });
    //         const idsToDelete = toDelete.map(e => e.id);
    //         console.log("🔄 [Background] events to delete:", idsToDelete);

    //         if (idsToDelete.length) {
    //             // 2) Borra primero los EventParticipant asociados
    //             const delParts = await prisma.eventParticipant.deleteMany({
    //                 where: { idEventFk: { in: idsToDelete } },
    //             });
    //             console.log("🔄 [Background] deletedParticipants count:", delParts.count);

    //             // 3) Ahora sí, borra los eventos
    //             const delEvents = await prisma.event.deleteMany({
    //                 where: { id: { in: idsToDelete } },
    //             });
    //             console.log("🔄 [Background] deletedEvents count:", delEvents.count);
    //         }

    //         // 4) Reconstruye las fechas según la RRule original
    //         const opts: any = RRule.parseString(recurrenceRuleUpdate.rrule!);
    //         opts.dtstart = new Date(recurrenceRuleUpdate.dtstart);
    //         opts.tzid = recurrenceRuleUpdate.tzid!;
    //         opts.count = count;
    //         const allDates = new RRule(opts).all();
    //         console.log("🔄 [Background] allDates:", allDates.map(d => d.toISOString()));

    //         // 5) Duración fija
    //         const durationMs =
    //             new Date(event.endDate).getTime() - new Date(event.startDate).getTime();

    //         // 6) Crea de nuevo todas las ocurrencias >= nueva dtstart
    //         const datesToCreate = allDates.filter(d =>
    //             d.getTime() > newDtstart.getTime());
    //         console.log("🔄 [Background] datesToCreate:", datesToCreate.map(d => d.toISOString()));

    //         await Promise.all(
    //             datesToCreate.map(start => {
    //                 const end = new Date(start.getTime() + durationMs);
    //                 const base = toPrismaEventScalars({
    //                     ...event,
    //                     startDate: start,
    //                     endDate: end,
    //                 });

    //                 return prisma.event.create({
    //                     data: {
    //                         ...base,
    //                         idRecurrenceRuleFk: newRuleId,
    //                         eventParticipant: {
    //                             create:
    //                                 eventParticipant?.map(ep => ({
    //                                     idClientFk: ep.idClientFk!,
    //                                     idClientWorkspaceFk: ep.idClientWorkspaceFk!,
    //                                 })) ?? [],
    //                         },
    //                     },
    //                 });
    //             })
    //         );
    //         console.log("✅ [Background] recreation of future instances done.");
    //     } catch (error) {
    //         console.error("❌ [Background] Error in FutureStrategy:", error);
    //         throw error; // Re-throw to handle it upstream
    //     }
    // }



    /**
   * Actualiza eventos a partir de payload.event.startDate:
   * - Borra futuros de la regla antigua
   * - Reconstruye usando rdates de la regla nueva
   */
    // async handleWindow(
    //     payload: EventForBackend,
    //     prisma: PrismaClient,
    //     oldRuleId?: string,
    //     newRuleId?: string,
    //     amountMax?: number
    // ): Promise<void> {
    //     if (!oldRuleId || !newRuleId) {
    //         throw new Error("handleWindow requiere oldRuleId y newRuleId");
    //     }

    //     const { skipMainEvent, event, recurrenceRuleUpdate, eventParticipant } = payload;
    //     const windowStart = new Date(event.startDate);

    //     // 1) Normalizar amountMax
    //     const raw = Number(amountMax);
    //     const validated = Number.isInteger(raw) && raw > 0
    //         ? raw
    //         : DEFAULT_RECURRENCE_COUNT;
    //     const count = Math.min(MAX_RECURRENCE_COUNT, validated);

    //     console.log(
    //         "🔄 [Window] oldRuleId:",
    //         oldRuleId,
    //         "newRuleId:",
    //         newRuleId,
    //         "from:",
    //         windowStart.toISOString(),
    //         "count:",
    //         count
    //     );

    //     // 2) Borrar previos de la regla antigua desde windowStart
    //     const toDelete = await prisma.event.findMany({
    //         where: {
    //             idRecurrenceRuleFk: oldRuleId,
    //             startDate: { gte: windowStart },
    //         },
    //         select: { id: true },
    //     });
    //     const idsToDelete = toDelete.map(e => e.id);
    //     if (idsToDelete.length) {
    //         await prisma.eventParticipant.deleteMany({
    //             where: { idEventFk: { in: idsToDelete } }
    //         });
    //         await prisma.event.deleteMany({
    //             where: { id: { in: idsToDelete } }
    //         });
    //     }

    //     // 3) Parsear y filtrar los rdates (solo fechas)
    //     const candidateDates = getValidRDates(recurrenceRuleUpdate?.rdates)
    //         .filter(d => d.getTime() >= windowStart.getTime())
    //         .slice(0, count);

    //     console.log(
    //         `[Window] candidateDates (dates only): ${JSON.stringify(
    //             candidateDates.map(d => d.toISOString().slice(0, 10))
    //         )}`
    //     );

    //     if (candidateDates.length === 0) {
    //         console.warn("WindowStrategy: no valid rdates to create.");
    //         return;
    //     }

    //     // 4) Extraer hora y duración DEL EVENTO (no del primer creado)
    //     const origStart = new Date(event.startDate);
    //     const origEnd = new Date(event.endDate);
    //     const durationMs = origEnd.getTime() - origStart.getTime();
    //     const hour = origStart.getHours();
    //     const minute = origStart.getMinutes();
    //     const second = origStart.getSeconds();
    //     console.log(
    //         `[Window] using original time ${hour}:${minute}:${second}, durationMs=${durationMs}`
    //     );

    //     // 5) Crear las nuevas instancias combinando fecha + hora
    //     const baseScalars = toPrismaEventScalars(event);
    //     await Promise.all(
    //         candidateDates.map(dateOnly => {
    //             // combina year/month/day de dateOnly con hora de event.startDate
    //             const start = new Date(dateOnly);
    //             start.setHours(hour, minute, second, 0);
    //             const end = new Date(start.getTime() + durationMs);

    //             console.log(
    //                 `[Window] creating event start=${start.toISOString()}, end=${end.toISOString()}`
    //             );

    //             return prisma.event.create({
    //                 data: {
    //                     ...baseScalars,
    //                     startDate: start,
    //                     endDate: end,
    //                     idRecurrenceRuleFk: newRuleId,
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

    //     console.log("✅ [Window] instances recreated with correct times.");
    // }
}
