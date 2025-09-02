// src/services/recurrence-rule/strategy/all.strategy.ts
import { EventForBackend } from "../../event/dto/EventForBackend";
import { PrismaClient, Prisma } from "@prisma/client";
import { RRule } from "rrule";
import { toPrismaEventCreate } from "../../event/util/toPrismaEventCreate";
import { toPrismaEventUpdate } from "../../event/util/toPrismaEventUpdate";
import { DEFAULT_RECURRENCE_COUNT, getRecurrenceDates, MAX_RECURRENCE_COUNT, RecurrenceStrategy } from "./type";

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
                idCalendarFk: originalRule.idCalendarFk
            }
        });

        // 3) Devolver nueva regla para que el servicio actualice solo la instancia actual
        return newRule.id;
    }



    handleBackground = async (
        payload: EventForBackend,
        prisma: PrismaClient,
        oldRuleId: string,
        newRuleId: string,
        amountMax: number = COUNT_EVENT_MAX
    ): Promise<void> => {
        // 1) Lectura de fechas pendientes antiguas
        const now = new Date();
        const oldEvents = await prisma.event.findMany({
            where: { idRecurrenceRuleFk: oldRuleId, startDate: { gt: now } },
            select: { startDate: true },
            orderBy: { startDate: 'asc' }
        });
        const oldDates = oldEvents.map(e => e.startDate);


        // 1) Validamos y normalizamos amountMax
        const raw = Number(amountMax);
        const validated = Number.isInteger(raw) && raw > 0
            ? raw
            : DEFAULT_RECURRENCE_COUNT;

        // 2) Nunca generamos más de MAX_RECURRENCE_COUNT
        const count = Math.min(MAX_RECURRENCE_COUNT, validated);

        // 2) Generación de fechas nuevas según la nueva regla
        const newRule = await prisma.recurrenceRule.findUniqueOrThrow({ where: { id: newRuleId } });
        const opts = RRule.parseString(newRule.rrule!);
        opts.dtstart = newRule.dtstart;
        opts.tzid = newRule.tzid!;
        opts.count = count; // Limita a las siguientes 'amount' ocurrencias
        const allRuleDates = new RRule(opts).all();
        const futureDates = allRuleDates.filter(d => d.getTime() > newRule.dtstart.getTime());

        const seen = new Set<number>();
        const uniqueDates: Date[] = [];
        for (const d of [...oldDates, ...futureDates]) {
            const t = d.getTime();
            if (!seen.has(t)) {
                seen.add(t);
                uniqueDates.push(d);
            }
        }
        // 3) Concatenar y limitar
        const datesToCreate = uniqueDates.slice(0, COUNT_EVENT_MAX);

        // 4) Eliminar eventos pendientes de la regla antigua
        const toDelete = await prisma.event.findMany({
            where: { idRecurrenceRuleFk: oldRuleId, startDate: { gt: now } },
            select: { id: true }
        });
        if (toDelete.length) {
            const ids = toDelete.map(e => e.id);
            await prisma.eventParticipant.deleteMany({ where: { idEventFk: { in: ids } } });
            await prisma.event.deleteMany({ where: { id: { in: ids } } });
        }

        // 5) Recrear eventos en la nueva regla
        const baseCreate = toPrismaEventCreate(payload.event);
        const durationMs =
            new Date(payload.event.endDate).getTime() -
            new Date(payload.event.startDate).getTime();

        for (const start of datesToCreate) {
            const end = new Date(start.getTime() + durationMs);
            await prisma.event.create({
                data: {
                    ...baseCreate,
                    startDate: start,
                    endDate: end,
                    calendar: { connect: { id: payload.event.idCalendarFk! } },
                    service: payload.event.service?.id
                        ? { connect: { id: payload.event.service.id } }
                        : undefined,
                    recurrenceRule: { connect: { id: newRuleId } },
                    eventParticipant: {
                        create:
                            payload.eventParticipant?.map(ep => ({
                                idClientFk: ep.idClientFk!,
                                idClientWorkspaceFk: ep.idClientWorkspaceFk!
                            })) ?? []
                    }
                }
            });
        }
    };

 



    /**
     * Reemplaza completamente las instancias futuras de “ALL”:
     * - Borra todos los eventos futuros de la regla antigua (oldRuleId)
     * - Genera fechas con getRecurrenceDates (rdates o rrule)
     * - Conserva hora y duración originales de payload.event
     */
    async handleWindow(
        payload: EventForBackend,
        prisma: PrismaClient,
        oldRuleId?: string,
        newRuleId?: string,
        amountMax: number = DEFAULT_RECURRENCE_COUNT
    ): Promise<void> {
        if (!oldRuleId || !newRuleId) {
            throw new Error("AllStrategy.handleWindow requiere oldRuleId y newRuleId");
        }

        const { event, eventParticipant } = payload;
        const windowStart = new Date(event.startDate);

        console.log(
            `🔄 [AllStrategy.handleWindow] oldRuleId=${oldRuleId}, newRuleId=${newRuleId}, from=${windowStart.toISOString()}, amountMax=${amountMax}`
        );

        // 1) Borrar solo los eventos FUTUROS de la regla antigua
        const future = await prisma.event.findMany({
            where: {
                idRecurrenceRuleFk: oldRuleId,
                startDate: { gte: windowStart },
            },
            select: { id: true },
        });
        const idsToDelete = future.map(e => e.id);
        if (idsToDelete.length) {
            await prisma.eventParticipant.deleteMany({
                where: { idEventFk: { in: idsToDelete } }
            });
            await prisma.event.deleteMany({
                where: { id: { in: idsToDelete } }
            });
            console.log(`🗑  Deleted ${idsToDelete.length} future events`);
        }

        // 2) Obtener fechas nuevas según rdates o rrule
        const candidateDates = getRecurrenceDates(payload, amountMax)
            .filter(d => d.getTime() >= windowStart.getTime());
        console.log(
            `[AllStrategy.handleWindow] candidateDates=${JSON.stringify(
                candidateDates.map(d => d.toISOString())
            )}`
        );
        if (!candidateDates.length) {
            console.log("⚠️  No future dates to recreate");
            return;
        }

        // 3) Extraer hora + duración del evento original
        const origStart = new Date(event.startDate);
        const origEnd = new Date(event.endDate);
        const durationMs = origEnd.getTime() - origStart.getTime();
        const [hour, minute, second] = [
            origStart.getHours(),
            origStart.getMinutes(),
            origStart.getSeconds(),
        ];
        console.log(
            `[AllStrategy.handleWindow] using time ${hour}:${minute}:${second}, durationMs=${durationMs}`
        );

        // 4) Crear las nuevas instancias
        const baseCreate = toPrismaEventCreate(event);
        await Promise.all(
            candidateDates.map(dateOnly => {
                const start = new Date(dateOnly);
                start.setHours(hour, minute, second, 0);
                const end = new Date(start.getTime() + durationMs);

                console.log(
                    `[AllStrategy.handleWindow] creating start=${start.toISOString()}, end=${end.toISOString()}`
                );

                return prisma.event.create({
                    data: {
                        ...baseCreate,
                        startDate: start,
                        endDate: end,
                        calendar: { connect: { id: event.idCalendarFk! } },
                        service: event.service?.id
                            ? { connect: { id: event.service.id } }
                            : undefined,
                        recurrenceRule: { connect: { id: newRuleId } },
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

        console.log(
            `✅ [AllStrategy.handleWindow] Recreated ${candidateDates.length} instances`
        );
    }

}
