// src/services/recurrence-rule/strategy/new.strategy.ts
import { EventForBackend } from "../../event/dto/EventForBackend";
import { PrismaClient } from "@prisma/client";
import { RRule } from "rrule";
import { toPrismaEventCreate } from "../../event/util/toPrismaEventCreate";
import { DEFAULT_RECURRENCE_COUNT, MAX_RECURRENCE_COUNT, parseDateString, RecurrenceStrategy } from "./type";
import moment from "moment";



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
                idCalendarFk: event.idCalendarFk!,
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
            await prisma.event.create({
                data: {
                    ...baseCreate,
                    startDate: start,
                    endDate: end,
                    calendar: { connect: { id: event.idCalendarFk! } },
                    service: event.service?.id ? { connect: { id: event.service.id } } : undefined,
                    recurrenceRule: { connect: { id: newRuleId } },
                    eventParticipant: {
                        create: eventParticipant?.map(ep => ({
                            idClientFk: ep.idClientFk!,
                            idClientWorkspaceFk: ep.idClientWorkspaceFk!,
                        })) ?? [],
                    },
                
                },
            });
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

        // 1) Prepara los límites en formato "YYYYMMDD"
        const dtstartDay = moment(recurrenceRule.dtstart).format("YYYYMMDD");
        const origDay = moment(event.startDate).format("YYYYMMDD");

        // 2) Normaliza count
        const raw = Number(amountMax);
        const validated = Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_RECURRENCE_COUNT;
        const count = Math.min(MAX_RECURRENCE_COUNT, validated);

        // 3) Filtra y ordena los rdates como strings
        const kept = (recurrenceRule.rdates ?? [])
            .filter(r => {
                // descartamos sólo los anteriores al dtstart, no el mismo día
                if (r < dtstartDay) return false;

                // si skipMainEvent === true, descartamos sólo el día del evento principal
                if (!skipMainEvent && r === origDay) return false;

                return true;
            })

            .sort()        // en YYYYMMDD, sort lexicográfico = cronológico
            .slice(0, count);

        if (!kept.length) {
            console.log("No hay fechas válidas tras filtrar.");
            return;
        }

        // 4) Extrae hora + duración del evento original
        const startOrig = moment(event.startDate);
        const durationMs = moment(event.endDate).diff(startOrig);
        const H = startOrig.hour(), M = startOrig.minute(), S = startOrig.second();

        const baseCreate = toPrismaEventCreate(event);
        await Promise.all(
            kept.map(r => {
                // convierte "20250718" → momento justo en la hora original
                const m = moment(r, "YYYYMMDD")
                    .hour(H).minute(M).second(S).millisecond(0);
                const start = m.toDate();
                const end = moment(m).add(durationMs, "milliseconds").toDate();

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
                        },
                  
                    }
                });
            })
        );
    }
}
