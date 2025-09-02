
// src/services/recurrence-rule/strategy/future.strategy.ts
import { PrismaClient, RecurrenceStatusType } from "@prisma/client";
import { RRule } from "rrule";
import { EventForBackend } from "../../event/dto/EventForBackend";
import { DEFAULT_RECURRENCE_COUNT, getValidRDates, MAX_RECURRENCE_COUNT, RecurrenceStrategy } from "./type";
import { toPrismaEventScalars } from "../../event/util/toPrismaEventUpdate";

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
                idCalendarFk: event.idCalendarFk!,
            },
        });

        console.log("⏱ [Immediate] created newRuleId:", newRule.id);
        return newRule.id;
    }

    /**
     * Borra todos los EventParticipant de los eventos futuros de la regla antigua
     * y luego elimina esos eventos. Después reconstruye todas las ocurrencias
     * (>= nueva dtstart) bajo la regla nueva, copiando scalars y participantes.
     */
    async handleBackground(
        payload: EventForBackend,
        prisma: PrismaClient,
        oldRuleId: string,
        newRuleId: string,
        amountMax = 15
    ) {
        try {
            const { event, recurrenceRuleUpdate, eventParticipant } = payload;


            console.log("-------")
            console.log("🔄 [Background] FutureStrategy.handleBackground")
            console.log("Event ", event);
            if (!recurrenceRuleUpdate?.dtstart) return;

            // 1) Validamos y normalizamos amountMax
            const raw = Number(amountMax);
            const validated = Number.isInteger(raw) && raw > 0
                ? raw
                : DEFAULT_RECURRENCE_COUNT;

            // 2) Nunca generamos más de MAX_RECURRENCE_COUNT
            const count = Math.min(MAX_RECURRENCE_COUNT, validated);

            const newDtstart = new Date(event.startDate);
            console.log("🔄 [Background] oldRuleId:", oldRuleId, "newRuleId:", newRuleId);
            console.log("🔄 [Background] new dtstart:", newDtstart.toISOString());

            // 1) Localiza IDs de eventos futuros a borrar
            const toDelete = await prisma.event.findMany({
                where: {
                    idRecurrenceRuleFk: oldRuleId,
                    startDate: { gte: newDtstart },
                },
                select: { id: true },
            });
            const idsToDelete = toDelete.map(e => e.id);
            console.log("🔄 [Background] events to delete:", idsToDelete);

            if (idsToDelete.length) {
                // 2) Borra primero los EventParticipant asociados
                const delParts = await prisma.eventParticipant.deleteMany({
                    where: { idEventFk: { in: idsToDelete } },
                });
                console.log("🔄 [Background] deletedParticipants count:", delParts.count);

                // 3) Ahora sí, borra los eventos
                const delEvents = await prisma.event.deleteMany({
                    where: { id: { in: idsToDelete } },
                });
                console.log("🔄 [Background] deletedEvents count:", delEvents.count);
            }

            // 4) Reconstruye las fechas según la RRule original
            const opts: any = RRule.parseString(recurrenceRuleUpdate.rrule!);
            opts.dtstart = new Date(recurrenceRuleUpdate.dtstart);
            opts.tzid = recurrenceRuleUpdate.tzid!;
            opts.count = count;
            const allDates = new RRule(opts).all();
            console.log("🔄 [Background] allDates:", allDates.map(d => d.toISOString()));

            // 5) Duración fija
            const durationMs =
                new Date(event.endDate).getTime() - new Date(event.startDate).getTime();

            // 6) Crea de nuevo todas las ocurrencias >= nueva dtstart
            const datesToCreate = allDates.filter(d =>
                d.getTime() > newDtstart.getTime());
            console.log("🔄 [Background] datesToCreate:", datesToCreate.map(d => d.toISOString()));

            await Promise.all(
                datesToCreate.map(start => {
                    const end = new Date(start.getTime() + durationMs);
                    const base = toPrismaEventScalars({
                        ...event,
                        startDate: start,
                        endDate: end,
                    });

                    return prisma.event.create({
                        data: {
                            ...base,
                            idRecurrenceRuleFk: newRuleId,
                            eventParticipant: {
                                create:
                                    eventParticipant?.map(ep => ({
                                        idClientFk: ep.idClientFk!,
                                        idClientWorkspaceFk: ep.idClientWorkspaceFk!,
                                    })) ?? [],
                            },
                        },
                    });
                })
            );
            console.log("✅ [Background] recreation of future instances done.");
        } catch (error) {
            console.error("❌ [Background] Error in FutureStrategy:", error);
            throw error; // Re-throw to handle it upstream
        }
    }



    /**
   * Actualiza eventos a partir de payload.event.startDate:
   * - Borra futuros de la regla antigua
   * - Reconstruye usando rdates de la regla nueva
   */
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

        const { skipMainEvent, event, recurrenceRuleUpdate, eventParticipant } = payload;
        const windowStart = new Date(event.startDate);

        // 1) Normalizar amountMax
        const raw = Number(amountMax);
        const validated = Number.isInteger(raw) && raw > 0
            ? raw
            : DEFAULT_RECURRENCE_COUNT;
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

        // 2) Borrar previos de la regla antigua desde windowStart
        const toDelete = await prisma.event.findMany({
            where: {
                idRecurrenceRuleFk: oldRuleId,
                startDate: { gte: windowStart },
            },
            select: { id: true },
        });
        const idsToDelete = toDelete.map(e => e.id);
        if (idsToDelete.length) {
            await prisma.eventParticipant.deleteMany({
                where: { idEventFk: { in: idsToDelete } }
            });
            await prisma.event.deleteMany({
                where: { id: { in: idsToDelete } }
            });
        }

        // 3) Parsear y filtrar los rdates (solo fechas)
        const candidateDates = getValidRDates(recurrenceRuleUpdate?.rdates)
            .filter(d => d.getTime() >= windowStart.getTime())
            .slice(0, count);

        console.log(
            `[Window] candidateDates (dates only): ${JSON.stringify(
                candidateDates.map(d => d.toISOString().slice(0, 10))
            )}`
        );

        if (candidateDates.length === 0) {
            console.warn("WindowStrategy: no valid rdates to create.");
            return;
        }

        // 4) Extraer hora y duración DEL EVENTO (no del primer creado)
        const origStart = new Date(event.startDate);
        const origEnd = new Date(event.endDate);
        const durationMs = origEnd.getTime() - origStart.getTime();
        const hour = origStart.getHours();
        const minute = origStart.getMinutes();
        const second = origStart.getSeconds();
        console.log(
            `[Window] using original time ${hour}:${minute}:${second}, durationMs=${durationMs}`
        );

        // 5) Crear las nuevas instancias combinando fecha + hora
        const baseScalars = toPrismaEventScalars(event);
        await Promise.all(
            candidateDates.map(dateOnly => {
                // combina year/month/day de dateOnly con hora de event.startDate
                const start = new Date(dateOnly);
                start.setHours(hour, minute, second, 0);
                const end = new Date(start.getTime() + durationMs);

                console.log(
                    `[Window] creating event start=${start.toISOString()}, end=${end.toISOString()}`
                );

                return prisma.event.create({
                    data: {
                        ...baseScalars,
                        startDate: start,
                        endDate: end,
                        idRecurrenceRuleFk: newRuleId,
                        eventParticipant: {
                            create: eventParticipant?.map(ep => ({
                                idClientFk: ep.idClientFk!,
                                idClientWorkspaceFk: ep.idClientWorkspaceFk!,
                            })) ?? []
                        }
                    }
                });
            })
        );

        console.log("✅ [Window] instances recreated with correct times.");
    }
}
