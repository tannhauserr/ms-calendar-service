import { Prisma, Event, EventStatusType, $Enums, EventParticipant, ServiceType, RecurrenceStatusType, PrismaClient, EventSourceType, EventPurposeType } from "@prisma/client";
import prisma from "../../../lib/prisma";
import CustomError from "../../../models/custom-error/CustomError";
import { Pagination } from "../../../models/pagination";
import { getGenericSpecialEvent2 } from "../../../utils/get-genetic/calendar-event/getGenericSpecialEvent2";
import { EventForBackend } from "./dto/EventForBackend";
import { EventExtraData } from "./dto/EventExtraData";
import { RecurrenceStrategyFactory } from "../recurrence-rule/strategy/factory";
import { buildNestedUpdates, toPrismaEventScalars, toPrismaEventUpdate } from "./util/toPrismaEventUpdate";
import { RRule, rrulestr } from "rrule";
import { NewStrategy } from "../recurrence-rule/strategy/new.strategy";

import * as RabbitPUBSUB from "../../../services/@rabbitmq/pubsub/functions";
import moment from "moment";
import { DEFAULT_RECURRENCE_COUNT, MAX_RECURRENCE_COUNT } from "../recurrence-rule/strategy/type";
import { RecurrenceRule } from "node-schedule";
import { skip } from "@prisma/client/runtime/library";
import { BusinessHourService } from "../all-business-services/business-hours/business-hours.service";
import { TemporaryBusinessHourService } from "../all-business-services/temporary-business-hour/temporary-business-hour.service";
import { WorkerBusinessHourService } from "../all-business-services/worker-business-hours/worker-business-hours.service";
import { GetAvailableDaysInput, DayFlag } from "./types";
import { getUsersWhoCanPerformService, enumerateDays, getEventsOverlappingRange, hasAnySlotForDayWithCapacity } from "./util/event-availability";




type ParticipantAction = "accept" | "cancel";

const PARTICIPANT_ALLOWED: Record<EventStatusType, EventStatusType[]> = {
    PENDING: [EventStatusType.ACCEPTED, EventStatusType.CANCELLED_BY_CLIENT],
    ACCEPTED: [],  // no permitimos volver a aceptar ni cancelar dos veces
    CONFIRMED: [],  // no usamos aquí
    COMPLETED: [],
    CANCELLED: [],
    CANCELLED_BY_CLIENT: [],
    CANCELLED_BY_CLIENT_REMOVED: [],
    PAID: [],
};

// 1) Define tus reglas de transición
const ALLOWED: Record<EventStatusType, EventStatusType[]> = {
    // De estado X puedes pasar a cualquiera de estos
    PENDING: [
        EventStatusType.ACCEPTED,
        EventStatusType.CANCELLED,
        EventStatusType.CANCELLED_BY_CLIENT,
    ],
    ACCEPTED: [
        EventStatusType.CONFIRMED,
        EventStatusType.CANCELLED,
        EventStatusType.CANCELLED_BY_CLIENT,
    ],
    CONFIRMED: [
        EventStatusType.COMPLETED,
        EventStatusType.CANCELLED,
        EventStatusType.CANCELLED_BY_CLIENT,
    ],
    COMPLETED: [
        EventStatusType.PAID,
        EventStatusType.CANCELLED,
    ],
    PAID: [],

    // Cancelaciones no transitan a nada (salvo el “removed” si lo quieres)
    CANCELLED: [],
    CANCELLED_BY_CLIENT: [
        // Sólo si quieres un paso extra “removido”:
        EventStatusType.CANCELLED_BY_CLIENT_REMOVED,
    ],
    CANCELLED_BY_CLIENT_REMOVED: [],
};


// Add


import {
    getUsersWhoCanPerformService_SPECIAL,
    getEventsOverlappingRange_SPECIAL,
    groupEventsByUser_SPECIAL,
    subtractBusyFromShift_SPECIAL,
    mergeTouchingWindows_SPECIAL,
    assignSequentially_SPECIAL,
    computeSlotConfig,
    type GetTimeSlotsInputSpecial,
    type ServiceAttendeeSpecial,
    type AvailabilityDepsSpecial,
    type BusinessHoursType,
    type WorkerHoursMapType,
    type TemporaryHoursMapType,
} from "../event/availability-special.service"; // <-- ajusta la ruta

import { z } from "zod";

const AddFromWebSchema = z.object({
    idCompany: z.string().min(8),
    idWorkspace: z.string().min(8),

    // Hora elegida por el cliente (en su TZ)
    timeZoneClient: z.string().min(3),
    startLocalISO: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/),

    // Servicios secuenciales que quiere reservar
    attendees: z.array(
        z.object({
            serviceId: z.string().min(6),
            durationMin: z.number().int().positive(),
            staffId: z.string().min(6).optional().nullable(),
            categoryId: z.string().min(6).optional().nullable(),
        })
    ).min(1),

    // Opcionales
    excludeEventId: z.string().optional(),
    note: z.string().max(2000).optional(),
    // Datos del cliente (si los adjuntas)
    customer: z.object({
        id: z.string().optional(),
        name: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email().optional(),
    }).optional(),
});

export type AddFromWebInput = z.infer<typeof AddFromWebSchema>;

type AddFromWebDeps = {
    timeZoneWorkspace: string; // resuelto por el controlador desde Redis/RPC
    businessHoursService: {
        getBusinessHoursFromRedis(idCompany: string, idWorkspace: string): Promise<BusinessHoursType>;
    };
    workerHoursService: {
        getWorkerHoursFromRedis(userIds: string[], idWorkspace: string): Promise<WorkerHoursMapType>;
    };
    temporaryHoursService: {
        getTemporaryHoursFromRedis(
            userIds: string[],
            idWorkspace: string,
            range?: { date: string } // HoursRangeInput minimal
        ): Promise<TemporaryHoursMapType>;
    };
    bookingConfig: {
        slot: { alignMode: "clock" | "service" }; // usa lo que tengas en workspace.bookingConfig
    };
    // Cache opcional (si ya la tienes, p.ej. Redis get/set)
    cache?: AvailabilityDepsSpecial["cache"];
};


export class EventV2Service {

    private businessHoursService = new BusinessHourService();
    private workerHoursService = new WorkerBusinessHourService();
    private temporaryHoursService = new TemporaryBusinessHourService();

    /**
  * Crea un evento + regla de recurrencia + participantes iniciales,
  * y dispara en background la generación de las siguientes ocurrencias
  * mediante un job Rabbit (CREATE_SERIES).
  */
    async addEventV2(payload: EventForBackend) {
        const { skipMainEvent, event, recurrenceRule, eventParticipant } = payload;

        // 0) Normaliza fechas a Date
        const startDate = typeof event.startDate === "string"
            ? new Date(event.startDate)
            : event.startDate;
        const endDate = typeof event.endDate === "string"
            ? new Date(event.endDate)
            : event.endDate;

        let createdEvent = { ...event };
        if (!skipMainEvent) {
            // 1) Crear el primer evento (+ regla inline + participantes) en una tx
            createdEvent = await prisma.$transaction((tx) =>
                tx.event.create({
                    data: {
                        title: event.title,
                        description: event.description,
                        startDate,
                        endDate,
                        idUserPlatformFk: event.idUserPlatformFk ?? undefined,
                        commentClient: event.commentClient,
                        eventSourceType: event.eventSourceType,
                        eventPurposeType: event.eventPurposeType,
                        isEditableByClient: event.isEditableByClient,
                        numberUpdates: event.numberUpdates,
                        eventStatusType: event.eventStatusType,
                        service: event.service?.id
                            ? { connect: { id: event.service.id } }
                            : undefined,

                        serviceNameSnapshot: event?.service?.name ?? null,
                        servicePriceSnapshot: event?.service?.price ?? null,
                        serviceDiscountSnapshot: event?.service?.discount ?? null,
                        serviceDurationSnapshot: event?.service?.duration ?? null,

                        calendar: { connect: { id: event.idCalendarFk } },

                        // Si hay regla, créala INLINE
                        // recurrenceRule: recurrenceRule
                        //     ? {
                        //         create: {
                        //             calendar: { connect: { id: event.idCalendarFk } },
                        //             dtstart:
                        //                 typeof recurrenceRule.dtstart === "string"
                        //                     ? new Date(recurrenceRule.dtstart)
                        //                     : recurrenceRule.dtstart,
                        //             until: recurrenceRule.until
                        //                 ? (typeof recurrenceRule.until === "string"
                        //                     ? new Date(recurrenceRule.until)
                        //                     : recurrenceRule.until)
                        //                 : null,
                        //             rrule: recurrenceRule.rrule!,
                        //             rdates: Array.isArray(recurrenceRule.rdates)
                        //                 ? recurrenceRule.rdates as string[]
                        //                 : typeof recurrenceRule.rdates === "string"
                        //                     ? [recurrenceRule.rdates]
                        //                     : [],
                        //             tzid: recurrenceRule.tzid!,
                        //             recurrenceStatusType: recurrenceRule.recurrenceStatusType!,
                        //         },
                        //     }
                        //     : undefined,

                        // Participantes iniciales
                        eventParticipant: eventParticipant?.length
                            ? {
                                create: eventParticipant.map((p) => ({
                                    idClientFk: p.idClientFk,
                                    idClientWorkspaceFk: p.idClientWorkspaceFk,
                                })),
                            }
                            : undefined,
                    },
                    include: {
                        service: true,
                        recurrenceRule: true,
                        eventParticipant: true,
                    },
                })
            );
        }


        let recurrenceCreated: any;
        if (recurrenceRule) {
            // Aquí se crea la recurrencia
            recurrenceCreated = await prisma.recurrenceRule.create({
                data: {
                    dtstart: recurrenceRule.dtstart,
                    until: recurrenceRule.until,
                    rrule: recurrenceRule.rrule,
                    rdates: Array.isArray(recurrenceRule.rdates)
                        ? recurrenceRule.rdates as string[]
                        : typeof recurrenceRule.rdates === "string"
                            ? [recurrenceRule.rdates]
                            : [],
                    tzid: recurrenceRule.tzid,
                    recurrenceStatusType: recurrenceRule.recurrenceStatusType,
                    calendar: { connect: { id: event.idCalendarFk } },
                },
            });
        }


        // Actualizamos el evento principal si no se salta
        if (!skipMainEvent && recurrenceCreated) {
            // 1) Conectar la regla de recurrencia al evento principal
            createdEvent = await prisma.event.update({
                where: { id: createdEvent.id },
                data: {
                    recurrenceRule: { connect: { id: recurrenceCreated.id } },
                },
                include: {
                    recurrenceRule: true,
                    eventParticipant: true,
                    service: true,
                },
            });
        }



        // 2) Si hemos creado una regla, enviamos un job CREATE_SERIES al worker
        if (recurrenceCreated?.id) {
            const ruleId = recurrenceCreated.id;

            // Construir el payload que espera el worker
            const jobPayload: EventForBackend = {
                event: {
                    ...createdEvent,
                    startDate,
                    endDate,
                },
                recurrenceRule: {
                    id: ruleId,
                    dtstart: recurrenceRule.dtstart,
                    until: recurrenceRule.until,
                    rrule: recurrenceRule.rrule!,
                    rdates: Array.isArray(recurrenceRule.rdates)
                        ? recurrenceRule.rdates as string[]
                        : typeof recurrenceRule.rdates === "string"
                            ? [recurrenceRule.rdates]
                            : [],
                    tzid: recurrenceRule.tzid!,
                    recurrenceStatusType: recurrenceRule.recurrenceStatusType!,
                },
                eventParticipant,
            };


            // 2) Nunca generamos más de MAX_RECURRENCE_COUNT
            const count = Math.min(MAX_RECURRENCE_COUNT, DEFAULT_RECURRENCE_COUNT);
            const countFixed = typeof count === "number" && !isNaN(count) ? count : 15;
            // Enviar el job
            await RabbitPUBSUB.sendRecurrenceWorkerJob(
                "CREATE_SERIES",                 // opType
                jobPayload,                      // payload
                countFixed,         // amount
                ruleId                           // idRecurrence
            );

            console.log(
                `[API] ▶ Sent CREATE_SERIES job for event ${createdEvent.id}, rule ${ruleId}`
            );
        }

        // 3) Devolver el primer evento con sus relaciones
        return skipMainEvent ? undefined : createdEvent;
    }

    async updateEventV2(payload: EventForBackend) {
        try {
            const {
                skipMainEvent,
                event,
                recurrenceRule,
                recurrenceRuleUpdate,
                eventParticipant,
                eventParticipantDelete,
            } = payload;

            if (!event.id) {
                throw new Error("Para actualizar necesitas el id del evento");
            }

            // Determino el alcance de la actualización de la regla
            const scope = recurrenceRuleUpdate
                ? recurrenceRuleUpdate.scope
                : (recurrenceRule && !recurrenceRule.id ? 'NEW' : null);

            // 1) Ejecutar toda la lógica en una transacción
            const updated = await prisma.$transaction(async tx => {
                // 1.a) Si hay una actualización de regla existente
                if (recurrenceRuleUpdate) {
                    const strat = RecurrenceStrategyFactory.get(scope ?? 'NEW');

                    // THIS => modifico solo la instancia puntual
                    if (scope === 'THIS') {
                        await strat.handleImmediate(payload, tx as PrismaClient);
                        return tx.event.findUnique({
                            where: { id: event.id },
                            include: { recurrenceRule: true, eventParticipant: true, service: true },
                        });
                    }
                    // FUTURE / ALL => genero una regla nueva
                    const newRuleId = await strat.handleImmediate(payload, tx as PrismaClient);

                    if (skipMainEvent) {
                        // elimino el evento principal
                        await tx.event.delete({ where: { id: event.id } });
                        // devuelvo un objeto mínimo (no se usará porque skipMainEvent => retornamos undefined al final)
                        return {
                            id: event.id,
                            recurrenceRule: { id: newRuleId }
                        } as any;
                    } else {

                        // actualizo el evento principal enlazando la nueva regla
                        return tx.event.update({
                            where: { id: event.id },
                            data: {
                                ...toPrismaEventUpdate(event),
                                recurrenceRule: { connect: { id: newRuleId } },
                                ...buildNestedUpdates(event, eventParticipant, eventParticipantDelete),
                            },
                            include: { recurrenceRule: true, eventParticipant: true, service: true },
                        });
                    }
                }

                // 1.b) Primera vez que añado recurrencia (NEW)
                if (recurrenceRule && !recurrenceRule.id) {
                    const newStrat = RecurrenceStrategyFactory.get('NEW') as NewStrategy;
                    const newRuleId = await newStrat.handleImmediate(payload, tx as PrismaClient);

                    await tx.event.update({
                        where: { id: event.id },
                        data: {
                            ...toPrismaEventUpdate(event),
                            recurrenceRule: { connect: { id: newRuleId } },
                            ...buildNestedUpdates(event, eventParticipant, eventParticipantDelete),
                        },
                    });

                    return tx.event.findUnique({
                        where: { id: event.id },
                        include: { recurrenceRule: true, eventParticipant: true, service: true },
                    });
                }

                // 1.c) Sin recurrencia: solo actualizo el evento
                return tx.event.update({
                    where: { id: event.id },
                    data: {
                        ...toPrismaEventUpdate(event),
                        ...buildNestedUpdates(event, eventParticipant, eventParticipantDelete),
                    },
                    include: { recurrenceRule: true, eventParticipant: true, service: true },
                });
            });

            // 2) Disparo el job de Rabbit solo si no salté el main y hay regla nueva/actualizada
            if (
                scope &&
                scope !== 'THIS'
            ) {
                let opType: 'CREATE_SERIES' | 'SPLIT_THIS' | 'SPLIT_FUTURE' | 'SPLIT_ALL';
                if (scope === 'NEW') opType = 'CREATE_SERIES';
                else if (scope === 'FUTURE') opType = 'SPLIT_FUTURE';
                else if (scope === 'ALL') opType = 'SPLIT_ALL';
                else opType = 'SPLIT_THIS';

                const count = Math.min(MAX_RECURRENCE_COUNT, DEFAULT_RECURRENCE_COUNT);
                const countFixed = Number.isFinite(count) ? count : 15;

                console.log(
                    `${moment().format('HH:mm:ss')} [API] ▶ Enviando job ${scope} para event ${event.id}`
                );
                await RabbitPUBSUB.sendRecurrenceWorkerJob(
                    opType,
                    payload,
                    countFixed,
                    updated.recurrenceRule.id
                );
            }

            // 3) Si skipMainEvent => devuelvo undefined, si no => devolución normal
            return skipMainEvent ? { id: event.id } : updated!;
        } catch (err: any) {
            throw new CustomError('EventV2Service.updateEventV2', err);
        }
    }



    /**
     * Borra varios eventos y, si procede, también sus reglas de recurrencia huérfanas.
     */
    async deleteEventsV2(ids: string[]) {
        try {
            // 1) Obtener los ruleIds de los eventos a borrar
            const events = await prisma.event.findMany({
                where: { id: { in: ids } },
                select: { idRecurrenceRuleFk: true },
            });

            const ruleIds = Array.from(
                new Set(
                    events
                        .map(e => e.idRecurrenceRuleFk)
                        .filter((r): r is string => !!r)
                )
            );

            // 2) Ejecutar transacción
            return await prisma.$transaction([
                // a) eliminar todos los participantes de esos eventos
                prisma.eventParticipant.deleteMany({
                    where: { idEventFk: { in: ids } },
                }),

                // b) eliminar sólo las reglas que ya no tengan ningún evento más allá de los que vamos a borrar
                prisma.recurrenceRule.deleteMany({
                    where: {
                        id: { in: ruleIds },
                        events: {
                            none: { id: { notIn: ids } }
                        }
                    }
                }),

                // c) borrar los eventos
                prisma.event.deleteMany({
                    where: { id: { in: ids } },
                }),
            ]);
        } catch (err: any) {
            throw new CustomError("EventService.deleteEventsV2", err);
        }
    }


    // …




    /**
     * Cambia el estado de un evento y sus participantes según las reglas definidas.
     * @param id 
     * @param newStatus 
     * @returns 
     */
    async changeEventStatus(
        id: string,
        newStatus: EventStatusType
    ): Promise<Event | undefined> {
        try {
            // 2) Leer estado actual
            const evt = await prisma.event.findUnique({
                where: { id },
                select: { eventStatusType: true },
            });
            if (!evt) throw new Error("Evento no encontrado");

            const current = evt.eventStatusType;

            // 3) Validar transición
            if (!ALLOWED[current].includes(newStatus)) {
                // Aquí puedes loggear el intento
                return undefined;
            }

            // 4) Preparar operaciones
            const ops: Prisma.PrismaPromise<any>[] = [];

            // 4a) Actualizar estado global
            ops.push(
                prisma.event.update({
                    where: { id },
                    data: { eventStatusType: newStatus },
                })
            );

            // 4b) Si cancelas globalmente → cancela participantes que no lo estén
            if (
                newStatus === EventStatusType.CANCELLED ||
                newStatus === EventStatusType.CANCELLED_BY_CLIENT_REMOVED
            ) {
                ops.push(
                    prisma.eventParticipant.updateMany({
                        where: {
                            idEventFk: id,
                            eventStatusType: {
                                notIn: [
                                    EventStatusType.CANCELLED,
                                    EventStatusType.CANCELLED_BY_CLIENT,
                                    EventStatusType.CANCELLED_BY_CLIENT_REMOVED,
                                ],
                            },
                        },
                        data: { eventStatusType: newStatus },
                    })
                );
            }

            // 4c) Si confirmas globalmente → optional: acepta los PENDING
            if (newStatus === EventStatusType.CONFIRMED) {
                ops.push(
                    prisma.eventParticipant.updateMany({
                        where: {
                            idEventFk: id,
                            eventStatusType: EventStatusType.PENDING,
                        },
                        data: { eventStatusType: EventStatusType.ACCEPTED },
                    })
                );
            }

            // 5) Ejecutar en transacción
            const [eventUpdated] = await prisma.$transaction(ops);
            return eventUpdated;
        } catch (err: any) {
            throw new CustomError("EventService.changeEventStatus", err);
        }
    }



    /**
     * Cambia el estado de un participante en un evento.
     * @param idEvent 
     * @param idClient 
     * @param idClientWorkspace 
     * @param action 
     * @returns 
     */
    async changeParticipantStatus(
        idEvent: string,
        idClient: string | null,
        idClientWorkspace: string | null,
        action: ParticipantAction
    ): Promise<EventParticipant | undefined> {
        try {
            // 1) Mapea la acción a estado Prisma
            const targetStatus =
                action === "accept"
                    ? EventStatusType.ACCEPTED
                    : EventStatusType.CANCELLED_BY_CLIENT;

            // 2) Busca al participante
            const participant = await prisma.eventParticipant.findFirst({
                where: {
                    idEventFk: idEvent,
                    idClientFk: idClient ?? undefined,
                    idClientWorkspaceFk: idClientWorkspace ?? undefined,
                },
            });
            if (!participant) {
                throw new Error("No se encontró ese participante para este evento");
            }

            // 3) Valida la transición
            const current = participant.eventStatusType;
            if (!PARTICIPANT_ALLOWED[current].includes(targetStatus)) {
                // podrías loggear el intento aquí
                return undefined;
            }

            // 4) Actualiza y devuelve
            const updated = await prisma.eventParticipant.update({
                where: { id: participant.id },
                data: { eventStatusType: targetStatus },
            });

            return updated;
        } catch (error: any) {
            throw new CustomError(
                "EventService.changeParticipantStatus",
                error
            );
        }
    }


    // gets

    async getEvents(pagination: Pagination, notCancelled: boolean = true): Promise<any> {
        try {


            if (notCancelled) {

                let select: Prisma.EventSelect = {
                    id: true,
                    title: true,
                    // description: true,
                    startDate: true,
                    endDate: true,
                    // idClientFk: true,
                    // idClientWorkspaceFk: true,
                    idUserPlatformFk: true,
                    eventStatusType: true,
                    eventPurposeType: true,
                    // eventSourceType: true,
                    idServiceFk: true,
                    allDay: true,
                    // service: {
                    //     select: {
                    //         id: true,
                    //         name: true,
                    //         description: true,
                    //     }
                    // },

                    // eventParticipant: {
                    //     select: {
                    //         id: true,
                    //         idClientFk: true,
                    //         idClientWorkspaceFk: true,
                    //         eventStatusType: true,

                    //     }
                    // }

                    // Calendar: {
                    //     select: {
                    //         id: true,
                    //     }
                    // }
                };

                pagination = pagination || {
                    page: 1,
                    itemsPerPage: 10000,
                };

                // const result = await getGenericSpecial(pagination, "event", select, notCancelled);
                // const result = await getGeneric(pagination, "event", select);
                const result = await getGenericSpecialEvent2(pagination, "event", select, notCancelled);

                return result;
            } else {


                let select: Prisma.EventSelect = {
                    id: true,
                    title: true,
                    description: true,
                    startDate: true,
                    endDate: true,
                    // idClientFk: true,
                    // idClientWorkspaceFk: true,
                    idUserPlatformFk: true,
                    eventStatusType: true,
                    eventPurposeType: true,
                    eventSourceType: true,
                    allDay: true,

                    service: {
                        select: {
                            id: true,
                            name: true,
                            description: true,
                        }
                    },

                    eventParticipant: {
                        select: {
                            id: true,
                            idClientFk: true,
                            idClientWorkspaceFk: true,
                            eventStatusType: true,

                        }
                    }

                    // Calendar: {
                    //     select: {
                    //         id: true,
                    //     }
                    // }
                };

                pagination = pagination || {
                    page: 1,
                    itemsPerPage: 10,
                };

                if (!pagination?.orderBy) {
                    pagination.orderBy = {
                        field: 'startDate',
                        order: 'desc' as 'asc' | 'desc',
                    }
                }
                const result = await getGenericSpecialEvent2(pagination, "event", select);

                console.log("mira que es result", result)
                return result;
            }


        } catch (error: any) {
            throw new CustomError('EventService.getEvents', error);
        }
    }

    /**
      * Devuelve, para cada id de evento, los datos “extra” que necesita el front:
      *   • Participantes  (solo ids; los datos de cliente llegarán vía RabbitMQ/Redis)
      *   • Regla de recurrencia (si existe)
      *   • Servicio asociado (si existe)
      *
      * @param idEventList lista de UUIDs de eventos
      */
    async getEventExtraData(idEventList: string[]): Promise<EventExtraData[]> {
        try {
            const events = await prisma.event.findMany({
                where: { id: { in: idEventList } },
                select: {
                    id: true,
                    title: true,

                    serviceNameSnapshot: true,
                    servicePriceSnapshot: true,
                    serviceDiscountSnapshot: true,
                    serviceDurationSnapshot: true,

                    // serviceDurationSnapshot: true,


                    // PARTICIPANTES
                    eventParticipant: {
                        where: { deletedDate: null },          // ignora soft-deleted
                        select: {
                            id: true,
                            idClientWorkspaceFk: true,
                            idClientFk: true,
                            eventStatusType: true,
                        },
                    },

                    // REGLA DE RECURRENCIA
                    recurrenceRule: {
                        select: {
                            id: true,
                            dtstart: true,
                            until: true,
                            rrule: true,
                            rdates: true,
                            tzid: true,
                            recurrenceStatusType: true,
                        },
                    },

                    // SERVICIO
                    service: {
                        select: {
                            id: true,
                            name: true,
                            duration: true,
                            price: true,
                            discount: true,
                            serviceType: true,
                            color: true,
                            image: true, // si quieres incluir la imagen
                        },
                    },
                },
            });

            // (opcional) mapeamos a DTO, por si en el futuro necesitas transformar campos
            return events.map(
                ({
                    id,
                    serviceNameSnapshot,
                    servicePriceSnapshot,
                    serviceDiscountSnapshot,
                    serviceDurationSnapshot,
                    eventParticipant,
                    recurrenceRule,
                    service,
                }): EventExtraData => ({
                    id,
                    serviceNameSnapshot: serviceNameSnapshot ?? undefined,
                    servicePriceSnapshot: servicePriceSnapshot ?? undefined,
                    serviceDiscountSnapshot: serviceDiscountSnapshot ?? undefined,
                    serviceDurationSnapshot: serviceDurationSnapshot ?? undefined,
                    eventParticipant: eventParticipant ?? [],
                    recurrenceRule: recurrenceRule as any ?? undefined,
                    service: service ?? undefined,
                }),
            );
        } catch (error: any) {
            throw new CustomError('EventService.getEventExtraData', error);
        }
    }

    async getEventById(id: string): Promise<any> {
        try {
            return await prisma.event.findUnique({
                where: {
                    id: id,
                    eventStatusType: {
                        // not: EventStatusType.CANCELLED
                        notIn: [EventStatusType.CANCELLED, EventStatusType.CANCELLED_BY_CLIENT_REMOVED]
                    }
                },
                select: {
                    id: true,
                    title: true,
                    description: true,
                    startDate: true,
                    endDate: true,
                    // idClientFk: true,
                    // idClientWorkspaceFk: true,
                    idUserPlatformFk: true,
                    idServiceFk: true,
                    eventPurposeType: true,
                    eventSourceType: true,
                    eventStatusType: true,
                    allDay: true,

                    service: {
                        select: {
                            id: true,
                            name: true,
                            description: true,
                        }
                    },

                    eventParticipant: {
                        select: {
                            id: true,
                            idClientFk: true,
                            idClientWorkspaceFk: true,
                            eventStatusType: true,
                        }
                    }

                    // calendar: {
                    //     select: {
                    //         id: true,
                    //         idGoogleCalendar: true,
                    //     }
                    // }


                },
            });
        } catch (error: any) {
            throw new CustomError('EventService.getEventById', error);
        }
    }



    // public

    /**
     * Devuelve días con disponibilidad (true/false) en el rango dado,
     * para la selección actual (servicios + staff opcional).
     *
     * Nota: Para marcar el día como disponible se comprueba que **cada**
     * servicio de la selección tenga al menos un slot posible ese día.
     * (Aproximación conservadora; la orquestación real por horas se hace
     * en el endpoint de horas.)
     */
    // public async publicGetAvailableDays(input: GetAvailableDaysInput): Promise<{ days: DayFlag[] }> {
    //     try {
    //         const {
    //             idCompany,
    //             idWorkspace,
    //             timezone,
    //             range: { start, end },
    //             attendees,
    //             excludeEventId,
    //         } = input;

    //         console.log("input", input)
    //         // Validación básica
    //         if (!idCompany || !idWorkspace) throw new Error("Faltan idCompany o idWorkspace");
    //         if (!start || !end) throw new Error("Faltan fechas de rango (start/end)");
    //         if (!Array.isArray(attendees) || attendees.length === 0) {
    //             // si no hay servicios seleccionados, no hay nada que calcular
    //             return { days: [] };
    //         }

    //         console.log("input2")
    //         // 1) Resolver los candidatos (users) por servicio
    //         //    - Si staffId viene → se usa ese.
    //         //    - Si staffId es null → buscamos “quién puede realizar el servicio”.
    //         const userIdsByService = new Map<string, string[]>();

    //         for (const a of attendees) {
    //             if (a.staffId) {
    //                 userIdsByService.set(a.serviceId, [a.staffId]);
    //             } else {
    //                 const users = await getUsersWhoCanPerformService(idWorkspace, a.serviceId, a.categoryId);
    //                 userIdsByService.set(a.serviceId, users);
    //             }
    //         }

    //         console.log("input3")
    //         console.log("input3", userIdsByService)

    //         // Unión de todos los usuarios para cargar horas y eventos de una vez
    //         const allUserIds = Array.from(
    //             new Set(Array.from(userIdsByService.values()).flat())
    //         );

    //         console.log("input4", allUserIds)


    //         if (allUserIds.length === 0) {
    //             // Nadie puede hacer alguno de los servicios → todo false
    //             const days = enumerateDays(start, end).map(d => ({ date: d, hasSlots: false }));
    //             return { days };
    //         }

    //         console.log("input5", allUserIds)

    //         // 2) Cargar reglas/horarios desde cache/DB
    //         const businessHours = await this.businessHoursService.getBusinessHoursFromRedis(idCompany, idWorkspace);
    //         const workerHoursMap = await this.workerHoursService.getWorkerHoursFromRedis(allUserIds, idCompany);
    //         const temporaryHoursMap = await this.temporaryHoursService.getTemporaryHoursFromRedis(allUserIds, idCompany);


    //         console.log("input6", businessHours, workerHoursMap, temporaryHoursMap)
    //         // 3) Cargar eventos que solapen el rango (para TODOS los users candidatos)
    //         const events = await getEventsOverlappingRange(allUserIds, start, end, excludeEventId);

    //         // 4) Para cada día del rango, comprobar si TODOS los servicios disponen de al menos 1 slot
    //         const INTERVAL_MINUTES = 30; // tu granularidad actual

    //         const days: DayFlag[] = [];
    //         for (const dateISO of enumerateDays(start, end)) {
    //             // Para cada servicio de la selección, ¿existe al menos 1 slot?
    //             let allServicesFit = true;

    //             for (const a of attendees) {
    //                 const usersForService = userIdsByService.get(a.serviceId) ?? [];
    //                 if (usersForService.length === 0) {
    //                     allServicesFit = false;
    //                     break;
    //                 }

    //                 const ok = hasAnySlotForDay({
    //                     dateISO,
    //                     serviceDuration: a.durationMin,
    //                     usersToConsider: usersForService,
    //                     intervalMinutes: INTERVAL_MINUTES,
    //                     businessHours,
    //                     workerHoursMap,
    //                     temporaryHoursMap,
    //                     events,
    //                     workspaceTimeZone: timezone,
    //                 });

    //                 if (!ok) {
    //                     allServicesFit = false;
    //                     break;
    //                 }
    //             }

    //             days.push({ date: dateISO, hasSlots: allServicesFit });
    //         }

    //         return { days };
    //     } catch (error: any) {
    //         throw new CustomError("EventService.getAvailableDays", error);
    //     }
    // }


    public async publicGetAvailableDays(input: GetAvailableDaysInput): Promise<{ days: DayFlag[] }> {
        try {
            const {
                idCompany,
                idWorkspace,
                timezone,
                range: { start, end },
                attendees,
                excludeEventId,
            } = input;

            if (!idCompany || !idWorkspace) throw new Error("Faltan idCompany o idWorkspace");
            if (!start || !end) throw new Error("Faltan fechas de rango (start/end)");
            if (!Array.isArray(attendees) || attendees.length === 0) {
                return { days: [] };
            }

            // resolver candidatos
            const userIdsByService = new Map<string, string[]>();
            for (const a of attendees) {
                if (a.staffId) {
                    userIdsByService.set(a.serviceId, [a.staffId]);
                } else {
                    const users = await getUsersWhoCanPerformService(idWorkspace, a.serviceId, a.categoryId);
                    userIdsByService.set(a.serviceId, users);
                }
            }
            const allUserIds = Array.from(new Set(Array.from(userIdsByService.values()).flat()));
            if (allUserIds.length === 0) {
                const days = enumerateDays(start, end).map(d => ({ date: d, hasSlots: false, capacity: 0 }));
                return { days };
            }

            const businessHours = await this.businessHoursService.getBusinessHoursFromRedis(idCompany, idWorkspace);
            const workerHoursMap = await this.workerHoursService.getWorkerHoursFromRedis(
                allUserIds,
                idWorkspace,
            );
            const temporaryHoursMap = await this.temporaryHoursService.getTemporaryHoursFromRedis(
                allUserIds,
                idWorkspace,
                {
                    start,
                    end
                });

            console.log("temporary hours", temporaryHoursMap)

            const events = await getEventsOverlappingRange(allUserIds, start, end, excludeEventId);

            const INTERVAL_MINUTES = 30;

            const days: DayFlag[] = [];
            for (const dateISO of enumerateDays(start, end)) {
                let allServicesFit = true;
                let minCapacity = 1;

                for (const a of attendees) {
                    const usersForService = userIdsByService.get(a.serviceId) ?? [];
                    if (usersForService.length === 0) {
                        allServicesFit = false;
                        minCapacity = 0;
                        break;
                    }

                    const { ok, capacity } = hasAnySlotForDayWithCapacity({
                        dateISO,
                        serviceDuration: a.durationMin,
                        usersToConsider: usersForService,
                        intervalMinutes: INTERVAL_MINUTES,
                        businessHours,
                        workerHoursMap,
                        temporaryHoursMap,
                        events,
                        workspaceTimeZone: timezone,
                    });

                    if (!ok) {
                        allServicesFit = false;
                        minCapacity = 0;
                        break;
                    }
                    minCapacity = Math.min(minCapacity, capacity);
                }

                days.push({ date: dateISO, hasSlots: allServicesFit, capacity: minCapacity });
            }

            return { days };
        } catch (error: any) {
            throw new CustomError("EventService.getAvailableDays", error);
        }
    }




    // public async publicGetAvailableTimeSlots(input: GetTimeSlotsInput): Promise<{ timeSlots: TimeSlot[] }> {
    //     const {
    //         idCompany,
    //         idWorkspace,
    //         timeZoneWorkspace,
    //         timeZoneClient,
    //         date,
    //         attendees,
    //         intervalMinutes = 30,
    //         excludeEventId,
    //     } = input;

    //     if (!idCompany || !idWorkspace) throw new Error("Faltan idCompany / idWorkspace");
    //     if (!timeZoneWorkspace) throw new Error("Falta timezone");
    //     if (!timeZoneWorkspace) throw new Error("Falta timezone");
    //     if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("date inválido");
    //     if (!Array.isArray(attendees) || attendees.length === 0) return { timeSlots: [] };

    //     console.log("input de time slots", input)
    //     // 1) Resolver candidatos por servicio
    //     const userIdsByService = new Map<string, string[]>();
    //     for (const a of attendees) {
    //         if (a.staffId) {
    //             userIdsByService.set(a.serviceId, [a.staffId]);
    //         } else {
    //             const users = await getUsersWhoCanPerformService(idWorkspace, a.serviceId, a.categoryId);
    //             userIdsByService.set(a.serviceId, users);
    //         }
    //     }

    //     const allUserIds = Array.from(new Set(Array.from(userIdsByService.values()).flat()));
    //     if (allUserIds.length === 0) return { timeSlots: [] };

    //     // 2) Cargar reglas/horarios
    //     const businessHours = await this.businessHoursService.getBusinessHoursFromRedis(idCompany, idWorkspace);
    //     const workerHoursMap = await this.workerHoursService.getWorkerHoursFromRedis(allUserIds, idCompany);
    //     const temporaryHoursMap = await this.temporaryHoursService.getTemporaryHoursFromRedis(allUserIds, idCompany);

    //     // 3) Eventos del día (todos los usuarios candidatos)
    //     const dayStartLocal = moment.tz(`${date}T00:00:00`, "YYYY-MM-DDTHH:mm:ss", timeZoneWorkspace);
    //     const dayEndLocal = dayStartLocal.clone().endOf("day");
    //     const dayStartUTC = dayStartLocal.clone().utc();
    //     const dayEndUTC = dayEndLocal.clone().utc();

    //     const events = await getEventsOverlappingRange(
    //         allUserIds,
    //         // dayStartUTC.toISOString(),
    //         // dayEndUTC.toISOString(),
    //         date,
    //         date,
    //         excludeEventId
    //     );

    //     console.log("events", events?.map(e => {
    //         console.log("event", e?.id, e?.startDate);
    //     }))

    //     // 4) Construye “turnos de trabajo” por usuario para ese día (en TZ local)
    //     const weekDay = dayStartLocal.format("dddd").toUpperCase(); // MONDAY...
    //     const bizShifts: string[][] = (() => {
    //         const biz = (businessHours as any)?.[weekDay];
    //         return biz === null ? [] : Array.isArray(biz) ? biz : [];
    //     })();

    //     // Por usuario, resolvemos shifts aplicando temporary > worker > business
    //     const shiftsByUserLocal: Record<
    //         string,
    //         Array<{ start: moment.Moment; end: moment.Moment }>
    //     > = {};

    //     for (const uid of allUserIds) {
    //         let workShifts: string[][] = [];
    //         const tmp = (temporaryHoursMap as any)?.[uid]?.[date];

    //         if (tmp === null) {
    //             workShifts = []; // cerrado por temporal
    //         } else if (Array.isArray(tmp) && tmp.length > 0) {
    //             workShifts = tmp;
    //         } else {
    //             const workerDay = (workerHoursMap as any)?.[uid]?.[weekDay];
    //             if (workerDay === null) workShifts = []; // cerrado explícito
    //             else if (Array.isArray(workerDay) && workerDay.length > 0) workShifts = workerDay;
    //             else workShifts = bizShifts; // fallback negocio
    //         }

    //         shiftsByUserLocal[uid] = (workShifts || []).map(([s, e]) => ({
    //             start: moment.tz(`${date}T${s}`, "YYYY-MM-DDTHH:mm:ss", timeZoneWorkspace),
    //             end: moment.tz(`${date}T${e}`, "YYYY-MM-DDTHH:mm:ss", timeZoneWorkspace),
    //         }));
    //     }

    //     // 5) Construye “bloques libres” por usuario restando eventos
    //     const eventsByUser = groupEventsByUser(events);
    //     const freeWindowsByUser: Record<string, Array<{ start: moment.Moment; end: moment.Moment }>> = {};

    //     const nowLocal = moment.tz(timeZoneWorkspace);
    //     const isToday = dayStartLocal.isSame(nowLocal, "day");

    //     for (const uid of allUserIds) {
    //         const busy = (eventsByUser[uid] || []).map(ev => ({
    //             // start: moment.utc(ev.startDate).tz(timezone),
    //             // end: moment.utc(ev.endDate).tz(timezone),
    //             start: moment(ev.startDate).tz(timeZoneWorkspace),
    //             end: moment(ev.endDate).tz(timeZoneWorkspace),
    //         }));

    //         // console.log("mira que es busy", busy)

    //         const rawShifts = shiftsByUserLocal[uid] || [];
    //         let free: Array<{ start: moment.Moment; end: moment.Moment }> = [];

    //         // para cada shift, recorta por eventos
    //         for (const sh of rawShifts) {
    //             // si es hoy, no ofrecer horas pasadas
    //             const shiftStart = sh.start.clone();
    //             if (isToday && shiftStart.isBefore(nowLocal)) {
    //                 shiftStart.minute(Math.ceil(nowLocal.minute() / intervalMinutes) * intervalMinutes).second(0);
    //                 if (shiftStart.isAfter(sh.end)) continue;
    //             }
    //             const pieces = subtractBusyFromShift(shiftStart, sh.end, busy);
    //             free.push(...pieces);
    //         }
    //         // normaliza por si hay solapes contiguos
    //         free = mergeTouchingWindows(free);
    //         freeWindowsByUser[uid] = free;
    //     }

    //     // console.log("mira que es freeWindowsByUser", freeWindowsByUser)

    //     // 6) Genera candidatos de inicio (toda la jornada, saltando intervalMinutes)
    //     const totalDuration = attendees.reduce((acc, a) => acc + a.durationMin, 0);
    //     const candidates: moment.Moment[] = [];
    //     {
    //         let cursor = dayStartLocal.clone();
    //         if (isToday && cursor.isBefore(nowLocal)) {
    //             cursor = nowLocal.clone().minute(Math.ceil(nowLocal.minute() / intervalMinutes) * intervalMinutes).second(0);
    //         }
    //         // límite de inicio: que quepa el bloque completo dentro del día (y, en la práctica, dentro de algún turno)
    //         const latest = dayEndLocal.clone().subtract(totalDuration, "minutes");
    //         while (!cursor.isAfter(latest)) {
    //             candidates.push(cursor.clone());
    //             cursor.add(intervalMinutes, "minutes");
    //         }
    //     }

    //     // 7) Para cada candidato, intenta asignar todos los servicios en secuencia
    //     const timeSlots: TimeSlot[] = [];

    //     // Prepara “quién puede hacer qué”
    //     const eligibleUsersByService: Record<string, string[]> = {};
    //     for (const a of attendees) {
    //         eligibleUsersByService[a.serviceId] = userIdsByService.get(a.serviceId) ?? [];
    //     }

    //     for (const start of candidates) {
    //         const assignment: Array<{
    //             serviceId: string;
    //             userId: string;
    //             start: moment.Moment;
    //             end: moment.Moment;
    //         }> = [];

    //         // backtracking/DFS rápido
    //         const ok = assignSequentially({
    //             idx: 0,
    //             start,
    //             attendees,
    //             eligibleUsersByService,
    //             freeWindowsByUser,
    //             usedByUserAt: [], // reservas que vamos haciendo en este candidato
    //             assignment,
    //         });

    //         if (ok) {
    //             // const end = start.clone().add(totalDuration, "minutes");
    //             // timeSlots.push({
    //             //     startLocalISO: start.format("YYYY-MM-DDTHH:mm:ss"),
    //             //     endLocalISO: end.format("YYYY-MM-DDTHH:mm:ss"),
    //             //     label: start.format("HH:mm"),
    //             //     // meta: { assignment: assignment.map(x => ({
    //             //     //   serviceId: x.serviceId,
    //             //     //   userId: x.userId,
    //             //     //   startLocalISO: x.start.format("YYYY-MM-DDTHH:mm:ss"),
    //             //     //   endLocalISO: x.end.format("YYYY-MM-DDTHH:mm:ss"),
    //             //     // })) }
    //             // });


    //             const end = start.clone().add(totalDuration, "minutes");
    //             timeSlots.push({
    //                 startLocalISO: start.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
    //                 endLocalISO: end.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
    //                 label: start.clone().tz(timeZoneClient).format("HH:mm"),
    //             });
    //         }
    //     }

    //     return { timeSlots };
    // }


    /**
  * Crea una cita *si y solo si* el inicio elegido es todavía válido.
  * - Recalcula ventanas libres en el día y asigna profesionales (backtracking).
  * - Revalida dentro de una transacción para evitar condiciones de carrera.
  * - Guarda 1 evento por profesional/servicio (ajusta TODOs a tu schema).
  */
    public async addEventFromWeb(input: AddFromWebInput, deps: AddFromWebDeps) {
        const payload = AddFromWebSchema.parse(input);

        const {
            idCompany,
            idWorkspace,
            timeZoneClient,
            startLocalISO,
            attendees,
            excludeEventId,
            customer,
            note,
        } = payload;

        const { timeZoneWorkspace, businessHoursService, workerHoursService, temporaryHoursService, bookingConfig, cache } = deps;

        // 1) Normalizaciones base
        const startClient = moment.tz(startLocalISO, "YYYY-MM-DDTHH:mm:ss", timeZoneClient);
        if (!startClient.isValid()) throw new Error("startLocalISO inválido");

        const startWS = startClient.clone().tz(timeZoneWorkspace);
        const dateWS = startWS.format("YYYY-MM-DD");

        // No permitir días pasados (en TZ del workspace)
        const todayWS = moment().tz(timeZoneWorkspace).startOf("day");
        if (startWS.clone().startOf("day").isBefore(todayWS, "day")) {
            throw new Error("El día seleccionado ya ha pasado en el huso horario del negocio.");
        }

        // 2) Configurar step/now según bookingConfig
        const { stepMinutes, roundedNow, isToday } = computeSlotConfig({
            alignMode: bookingConfig?.slot?.alignMode ?? "service",
            attendees,
            // TODO preparar el config de booking para dar el tiempo
            intervalMinutes: 5,               // si tu UI usa otro, pásalo aquí
            timeZoneWorkspace,
            dayStartLocal: startWS.clone().startOf("day"),
        });

        // Si es hoy, forzar que el inicio sea ≥ "ahora redondeado"
        if (isToday && startWS.isBefore(roundedNow)) {
            throw new Error("La hora seleccionada ya no está disponible.");
        }

        // 3) Elegibles por servicio
        const userIdsByService = new Map<string, string[]>();
        for (const a of attendees) {
            if (a.staffId) {
                userIdsByService.set(a.serviceId, [a.staffId]);
            } else {
                const users = await getUsersWhoCanPerformService_SPECIAL(
                    idWorkspace,
                    a.serviceId,
                    a.categoryId,
                    cache
                );
                userIdsByService.set(a.serviceId, users);
            }
        }
        const allUserIds = Array.from(new Set(Array.from(userIdsByService.values()).flat()));
        if (allUserIds.length === 0) throw new Error("No hay profesionales elegibles para los servicios seleccionados.");

        // 4) Reglas/horarios del día (en TZ workspace)
        const businessHours = await businessHoursService.getBusinessHoursFromRedis(idCompany, idWorkspace);
        const workerHoursMap = await workerHoursService.getWorkerHoursFromRedis(allUserIds, idWorkspace);
        const temporaryHoursMap = await temporaryHoursService.getTemporaryHoursFromRedis(allUserIds, idWorkspace, { date: dateWS });

        // 5) Eventos del día (para calcular ventanas libres)
        const events = await getEventsOverlappingRange_SPECIAL(allUserIds, dateWS, dateWS, excludeEventId);
        const eventsByUser = groupEventsByUser_SPECIAL(events);

        // 6) Construir ventanas libres por usuario (aplicando clamp si es hoy)
        type MM = { start: moment.Moment; end: moment.Moment };
        const weekDay = startWS.format("dddd").toUpperCase() as any; // Weekday
        const bizShifts: string[][] = (() => {
            const biz = (businessHours as any)?.[weekDay];
            return biz === null ? [] : Array.isArray(biz) ? biz : [];
        })();

        const shiftsByUserLocal: Record<string, MM[]> = {};
        for (const uid of allUserIds) {
            let workShifts: string[][] = [];
            const tmp = (temporaryHoursMap as any)?.[uid]?.[dateWS];

            if (tmp === null) {
                workShifts = [];
            } else if (Array.isArray(tmp) && tmp.length > 0) {
                workShifts = tmp;
            } else {
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

        // 7) Verificación de hueco para cada servicio + backtracking de asignación
        //    (Comprobamos que TODOS los servicios tengan ventana suficiente)
        for (const svc of attendees) {
            const elig = userIdsByService.get(svc.serviceId) ?? [];
            const algunoTieneHueco = elig.some((uid) =>
                (freeWindowsByUser[uid] ?? []).some((w) => w.end.diff(w.start, "minutes") >= svc.durationMin)
            );
            if (!algunoTieneHueco) throw new Error("No hay hueco suficiente para al menos uno de los servicios.");
        }

        // Correr backtracking arrancando en el *inicio elegido*
        const eligibleUsersByService: Record<string, string[]> = {};
        for (const a of attendees) {
            eligibleUsersByService[a.serviceId] = userIdsByService.get(a.serviceId) ?? [];
        }

        const assignment: Array<{ serviceId: string; userId: string; start: moment.Moment; end: moment.Moment }> = [];
        const ok = assignSequentially_SPECIAL({
            idx: 0,
            start: startWS.clone().seconds(0).milliseconds(0), // inicio exacto elegido, pisado a segundos=0
            attendees,
            eligibleUsersByService,
            freeWindowsByUser,
            usedByUserAt: [],
            assignment,
        });

        if (!ok) {
            throw new Error("El inicio elegido ya no está disponible (cambió la disponibilidad). Elige otro horario.");
        }

        // Rango total de la cita (secuencial)
        const totalDuration = attendees.reduce((acc, a) => acc + a.durationMin, 0);
        const endWS = startWS.clone().add(totalDuration, "minutes");

        // 8) Guardado con verificación anti-carrera dentro de transacción
        const created = await prisma.$transaction(async (tx) => {
            // Re-check solapamientos *justo antes de crear*, por si entre la consulta y aquí se creó algo nuevo.
            const overlapping = await tx.event.findMany({
                where: {
                    idUserPlatformFk: { in: assignment.map(a => a.userId) },
                    startDate: { lt: endWS.toDate() },
                    endDate: { gt: startWS.toDate() },
                    ...(excludeEventId ? { id: { not: excludeEventId } } : {}),
                },
                select: { id: true, idUserPlatformFk: true, startDate: true, endDate: true },
            });

            if (overlapping.length) {
                throw new Error("Se creó otra reserva en paralelo y ya no queda hueco. Prueba con otro horario.");
            }

            // 💾 Inserciones
            // ➜ Si en tu modelo existe un "parent appointment" + "segments", crea primero el padre y luego los hijos.
            // ➜ Aquí creamos 1 evento por servicio/profesional.
            const events = [];
            for (const seg of assignment) {
                const data: any = {
                    idCompanyFk: idCompany,        // TODO: confirma nombres de columnas
                    idWorkspaceFk: idWorkspace,    // TODO: confirma nombres de columnas
                    idUserPlatformFk: seg.userId,  // profesional asignado
                    startDate: seg.start.toDate(), // en UTC real
                    endDate: seg.end.toDate(),     // en UTC real
                    // Opcional/si existe:
                    // serviceId: seg.serviceId,
                    // note,
                    // customerId: customer?.id,
                    // source: "public", status: "CONFIRMED" | ...
                };

                const ev = await tx.event.create({ data });
                events.push(ev);
            }

            return events;
        });

        // 9) Respuesta: útil para el front y para otros servicios
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
            created, // registros de prisma.event
        };
    }

}
