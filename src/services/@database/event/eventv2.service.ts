import { EventParticipant, EventStatusType, Prisma } from "@prisma/client";
import prisma from "../../../lib/prisma";
import CustomError from "../../../models/custom-error/CustomError";
import { Pagination } from "../../../models/pagination";
import { getGenericSpecialEvent2 } from "../../../utils/get-genetic/calendar-event/getGenericSpecialEvent2";
import { EventExtraData } from "./dto/EventExtraData";

import moment from "moment";
import { getServiceByIds } from "../../@service-token-client/api-ms/bookingPage.ms";
import { BusinessHourService } from "../all-business-services/business-hours/business-hours.service";
import { TemporaryBusinessHourService } from "../all-business-services/temporary-business-hour/temporary-business-hour.service";
import { WorkerBusinessHourService } from "../all-business-services/worker-business-hours/worker-business-hours.service";

import { DayAvailabilityStatus, DayFlag } from "./types";
import { enumerateDays } from "./util/event-availability";

import {
    getEventsOverlappingRange_SPECIAL,
    getUsersWhoCanPerformService_SPECIAL,
    Weekday,
    type AvailabilityDepsSpecial,
    type BusinessHoursType,
    type GetTimeSlotsInputSpecial,
    type TemporaryHoursMapType,
    type WorkerHoursMapType
} from "../event/availability-special.service"; // <-- ajusta la ruta

import { TIME_SECONDS } from "../../../constant/time";
import { OnlineBookingConfig } from "../../@redis/cache/interfaces/models/booking-config";
import { RedisStrategyFactory } from "../../@redis/cache/strategies/redisStrategyFactory";
import { IRedisRoundRobinStrategy } from "../../@redis/cache/strategies/roundRobin/interfaces";


// Tipos para cambio de estado de un evento

type EventWithRelations = Prisma.EventGetPayload<{
    include: {
        eventParticipant: true;
        recurrenceRule: true;
    };
}>;

type ChangeEventStatusResult = {
    /** Todos los eventos que han cambiado de estado (evento suelto o grupo) */
    events: EventWithRelations[];
    /**
     * Subconjunto de `events` que:
     *  - antes estaban en PENDING
     *  - ahora están en ACCEPTED / CONFIRMED / CANCEL*
     * Es decir, los que deben disparar una notificación.
     */
    notifyEvents: EventWithRelations[];
};



type ParticipantAction = "accept" | "cancel";



/**
 * Estados permitidos para un participante que actúa sobre su evento
 * Si un evento está pendiente, el participante puede:
 * - aceptar (pasar a ACCEPTED)
 * - cancelar (pasar a CANCELLED_BY_CLIENT)
 */
const PARTICIPANT_ALLOWED: Record<EventStatusType, EventStatusType[]> = {
    PENDING: [EventStatusType.ACCEPTED, EventStatusType.CANCELLED_BY_CLIENT],
    ACCEPTED: [],  // no permitimos volver a aceptar ni cancelar dos veces
    CONFIRMED: [],  // no usamos aquí
    COMPLETED: [],
    CANCELLED: [],
    CANCELLED_BY_CLIENT: [],
    CANCELLED_BY_CLIENT_REMOVED: [],
    PAID: [],
    NO_SHOW: [],
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
    NO_SHOW: [],

    // Cancelaciones no transitan a nada (salvo el “removed” si lo quieres)
    CANCELLED: [],
    CANCELLED_BY_CLIENT: [
        // Sólo si quieres un paso extra “removido”:
        EventStatusType.CANCELLED_BY_CLIENT_REMOVED,
    ],
    // Este estado es cuando es del cliente y el usuario lo elimina 
    CANCELLED_BY_CLIENT_REMOVED: [],
};


// Add





type AddFromWebInput = {
    idCompany: string;
    idWorkspace: string;
    timeZoneClient: string;          // p.ej. "Europe/Madrid"
    startLocalISO: string;           // "YYYY-MM-DDTHH:mm:ss" en TZ del cliente
    attendees: Array<{
        serviceId: string;
        durationMin: number;
        staffId?: string | null;
        categoryId?: string | null;
    }>;
    excludeEventId?: string;
    note?: string;
    customer: {
        id: string;                    // id del cliente (plataforma)
        idClient?: string;             // alias mismo id si lo usas así
        idClientWorkspace?: string;    // ⬅️ VIENE DEL CONTROLLER (RPC)
        name?: string;
        email?: string;
        phone?: string;
    };
};

interface WeightedResource {
    id: string;     // UUID del staff
    weight: number; // 0..100
}

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
    bookingConfig: OnlineBookingConfig;
    // Cache opcional (si ya la tienes, p.ej. Redis get/set)
    cache?: AvailabilityDepsSpecial["cache"];
};


export class EventV2Service {

    private businessHoursService = new BusinessHourService();
    private workerHoursService = new WorkerBusinessHourService();
    private temporaryHoursService = new TemporaryBusinessHourService();

    private _withGroupFields<T extends { groupEvents?: any }>(event: T | null) {
        if (!event || !event.groupEvents) return event;
        const group = event.groupEvents;
        return {
            ...event,
            idWorkspaceFk: group.idWorkspaceFk,
            idCompanyFk: group.idCompanyFk,
            commentClient: group.commentClient,
            isCommentRead: group.isCommentRead,
            eventSourceType: group.eventSourceType,
            eventStatusType: group.eventStatusType,
            timeZone: group.timeZone,
            eventParticipant: group.eventParticipant ?? (event as any).eventParticipant ?? [],
        };
    }

    /**
  * Crea un evento + regla de recurrencia + participantes iniciales,
  * y dispara en background la generación de las siguientes ocurrencias
  * mediante un job Rabbit (CREATE_SERIES).
  */


    markCommentAsRead = async (eventId: string, idWorkspace: string) => {
        try {
            if (!eventId) {
                throw new Error("El id del evento es requerido");
            }

            const event = await prisma.event.findUnique({
                where: { id: eventId },
                include: { groupEvents: true },
            });

            if (!event?.groupEvents || event.groupEvents.idWorkspaceFk !== idWorkspace) {
                throw new Error("Evento no encontrado en este workspace");
            }

            await prisma.groupEvents.update({
                where: { id: event.idGroup },
                data: { isCommentRead: true },
            });

            event.groupEvents.isCommentRead = true;
            return this._withGroupFields(event as any);
        } catch (err: any) {
            throw new CustomError('EventV2Service.markCommentAsRead', err);
        }
    };

    /**
     * Borra varios eventos y, si procede, también sus reglas de recurrencia huérfanas.
     */
    async deleteEventsV2(ids: string[]) {
        try {
            // 1) Obtener los ruleIds de los eventos a borrar
            const events = await prisma.event.findMany({
                where: { id: { in: ids } },
                select: { idRecurrenceRuleFk: true, idGroup: true },
            });

            const ruleIds = Array.from(
                new Set(
                    events
                        .map(e => e.idRecurrenceRuleFk)
                        .filter((r): r is string => !!r)
                )
            );
            const groupIds = Array.from(
                new Set(
                    events
                        .map(e => e.idGroup)
                        .filter((g): g is string => !!g)
                )
            );

            // 2) Ejecutar transacción
            return await prisma.$transaction(async (tx) => {
                // a) borrar los eventos
                await tx.event.deleteMany({
                    where: { id: { in: ids } },
                });

                // b) eliminar participantes y grupos huérfanos
                if (groupIds.length > 0) {
                    await tx.eventParticipant.deleteMany({
                        where: {
                            idGroup: { in: groupIds },
                            groupEvents: { events: { none: {} } },
                        },
                    });

                    await tx.groupEvents.deleteMany({
                        where: {
                            id: { in: groupIds },
                            events: { none: {} },
                        },
                    });
                }

                // c) eliminar sólo las reglas que ya no tengan ningún evento
                await tx.recurrenceRule.deleteMany({
                    where: {
                        id: { in: ruleIds },
                        events: {
                            none: { id: { notIn: ids } }
                        }
                    }
                });
            });
        } catch (err: any) {
            throw new CustomError("EventService.deleteEventsV2", err);
        }
    }



    /**
 * Cambia el estado de un evento y sus participantes según las reglas definidas.
 * Devuelve:
 *  - events: todos los eventos que han cambiado de estado
 *  - notifyEvents: solo aquellos que pasaban de PENDING a ACCEPTED/CONFIRMED/CANCEL*
 */
    async changeEventStatus(
        id: string,
        newStatus: EventStatusType,
        updateGroup: boolean = false
    ): Promise<ChangeEventStatusResult | undefined> {
        try {
            // 1) Leer estado actual y grupo
            const evt = await prisma.event.findUnique({
                where: { id },
                select: {
                    idGroup: true,
                    groupEvents: {
                        select: {
                            eventStatusType: true,
                            idWorkspaceFk: true,
                        },
                    },
                },
            });
            if (!evt) throw new Error("Evento no encontrado");

            const current = evt.groupEvents?.eventStatusType;
            if (!current || !evt.idGroup) {
                throw new Error("Evento sin grupo o estado inválido");
            }

            // 2) Validar transición para el evento principal
            if (!ALLOWED[current].includes(newStatus)) {
                console.warn(
                    `[changeEventStatus] Transición no permitida: ${current} -> ${newStatus}`
                );
                return undefined;
            }

            // 3) Ejecutar actualización en transacción
            return await prisma.$transaction<ChangeEventStatusResult | undefined>(
                async (tx) => {
                    const eventIds: string[] = [];
                    const notifyIds: string[] = [];

                    // Obtener todos los eventos del grupo
                    const groupEvents = await tx.event.findMany({
                        where: {
                            idGroup: evt.idGroup,
                            deletedDate: null,
                        },
                        select: { id: true },
                    });

                    const groupEventIds = groupEvents.map((ge) => ge.id);
                    const targetIds = updateGroup ? groupEventIds : [id];
                    eventIds.push(...targetIds);

                    if (this._shouldNotifyOnTransition(current, newStatus)) {
                        notifyIds.push(...targetIds);
                    }

                    // Actualizar estado del grupo (único)
                    await tx.groupEvents.update({
                        where: { id: evt.idGroup },
                        data: { eventStatusType: newStatus },
                    });

                    // 4) Actualizar participantes según el nuevo estado
                    // 4a) Si cancelas → cancela participantes que no lo estén
                    if (
                        newStatus === EventStatusType.CANCELLED ||
                        newStatus === EventStatusType.CANCELLED_BY_CLIENT_REMOVED
                    ) {
                        await tx.eventParticipant.updateMany({
                            where: {
                                idGroup: evt.idGroup,
                                eventStatusType: {
                                    notIn: [
                                        EventStatusType.CANCELLED,
                                        EventStatusType.CANCELLED_BY_CLIENT,
                                        EventStatusType.CANCELLED_BY_CLIENT_REMOVED,
                                    ],
                                },
                            },
                            data: { eventStatusType: newStatus },
                        });
                    }

                    // 4b) Si confirmas → acepta los PENDING
                    if (
                        newStatus === EventStatusType.CONFIRMED ||
                        newStatus === EventStatusType.ACCEPTED
                    ) {
                        await tx.eventParticipant.updateMany({
                            where: {
                                idGroup: evt.idGroup,
                                eventStatusType: EventStatusType.PENDING,
                            },
                            data: { eventStatusType: EventStatusType.ACCEPTED },
                        });
                    }

                    // 5) Cargar los eventos actualizados con los datos mínimos para createNotification
                    const events = await tx.event.findMany({
                        where: { id: { in: eventIds } },
                        include: {
                            groupEvents: { include: { eventParticipant: true } },
                            recurrenceRule: true,
                        },
                    });

                    // Subconjunto que debe notificar (los que estaban en PENDING → final)
                    const notifyEvents = events.filter((e) =>
                        notifyIds.includes(e.id)
                    );

                    const flattenedEvents = events.map((ev) =>
                        this._withGroupFields(ev as any)
                    );

                    const flattenedNotify = flattenedEvents.filter((e) =>
                        notifyIds.includes((e as any).id)
                    );

                    console.log("dentro de servicio justo antes de return", flattenedEvents, flattenedNotify);

                    return { events: flattenedEvents as any, notifyEvents: flattenedNotify as any };
                }
            );
        } catch (err: any) {
            throw new CustomError("EventService.changeEventStatus", err);
        }
    }


    /**
     * Decide si se debe notificar un cambio de estado según las reglas definidas.
     * @param oldStatus 
     * @param newStatus 
     * @returns 
     */
    _shouldNotifyOnTransition(
        oldStatus: EventStatusType,
        newStatus: EventStatusType
    ): boolean {
        if (oldStatus !== EventStatusType.PENDING) return false;

        // Cualquier "aceptado/confirmado" o "cancelado"
        if (
            newStatus === EventStatusType.ACCEPTED ||
            newStatus === EventStatusType.CONFIRMED ||
            newStatus === EventStatusType.CANCELLED ||
            newStatus === EventStatusType.CANCELLED_BY_CLIENT ||
            newStatus === EventStatusType.CANCELLED_BY_CLIENT_REMOVED
        ) {
            return true;
        }

        return false;
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
            const event = await prisma.event.findUnique({
                where: { id: idEvent },
                select: { idGroup: true },
            });
            if (!event?.idGroup) {
                throw new Error("Evento sin grupo para actualizar participante");
            }

            // 1) Mapea la acción a estado Prisma
            const targetStatus =
                action === "accept"
                    ? EventStatusType.ACCEPTED
                    : EventStatusType.CANCELLED_BY_CLIENT;

            // 2) Busca al participante
            const participant = await prisma.eventParticipant.findFirst({
                where: {
                    idGroup: event.idGroup,
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

    async getEvents(pagination: Pagination, isValidCancelledStatus: boolean = true): Promise<any> {
        try {

            // #################################################################################
            // # isValidCancelledStatus = false -> Es el get usado para calendarios            #
            // # isValidCancelledStatus = true -> Es el get usado para el listado de eventos   #
            // #################################################################################

            if (isValidCancelledStatus === false) {

                let select: Prisma.EventSelect = {
                    id: true,
                    title: true,

                    startDate: true,
                    endDate: true,
                    idGroup: true,

                    idUserPlatformFk: true,
                    // eventStatusType: true,
                    eventPurposeType: true,

                    idServiceFk: true,
                    allDay: true,
                    // commentClient: true,
                    // isCommentRead: true,
                    // idCompanyFk: true,
                    // idWorkspaceFk: true,

                    groupEvents: {
                        select: {
                            id: true,
                            commentClient: true,
                            isCommentRead: true,
                            idCompanyFk: true,
                            idWorkspaceFk: true,
                            eventSourceType: true,
                            eventStatusType: true,
                            timeZone: true,
                        }
                    }

                };

                const maxItemsPerPage = 1000;
                const itemsPerPage = maxItemsPerPage;

                const paginationAux = {
                    ...pagination,
                    page: 1,
                    itemsPerPage,
                }

                pagination = paginationAux;

                // const result = await getGenericSpecial(pagination, "event", select, notCancelled);
                // const result = await getGeneric(pagination, "event", select);
                const result = await getGenericSpecialEvent2(
                    pagination,
                    "event",
                    select,
                    isValidCancelledStatus,
                    { maxItemsPerPage }
                );
                result.rows = result.rows.map((row: any) => this._withGroupFields(row as any));

                return result;
            } else {


                let select: Prisma.EventSelect = {
                    id: true,
                    title: true,
                    description: true,
                    startDate: true,
                    endDate: true,
                    idGroup: true,

                    idUserPlatformFk: true,
                    // eventStatusType: true,
                    eventPurposeType: true,
                    // eventSourceType: true,
                    allDay: true,
                    // commentClient: true,
                    // isCommentRead: true,




                    groupEvents: {
                        select: {
                            id: true,
                            idCompanyFk: true,
                            idWorkspaceFk: true,
                            commentClient: true,
                            isCommentRead: true,
                            eventParticipant: {
                                select: {
                                    id: true,
                                    idClientFk: true,
                                    idClientWorkspaceFk: true,
                                    eventStatusType: true,

                                }
                            },
                            eventSourceType: true,
                            eventStatusType: true,
                            timeZone: true,
                        }
                    }


                };

                const maxItemsPerPage = 100;
                const itemsPerPage = Math.min(maxItemsPerPage, pagination?.itemsPerPage ?? 25);

                const paginationAux = {
                    ...pagination,
                    itemsPerPage,
                }

                pagination = paginationAux;

                if (!pagination?.orderBy) {
                    pagination.orderBy = {
                        field: 'startDate',
                        order: 'desc' as 'asc' | 'desc',
                    }
                }
                const result = await getGenericSpecialEvent2(
                    pagination,
                    "event",
                    select,
                    undefined,
                    { maxItemsPerPage }
                );
                result.rows = result.rows.map((row: any) => this._withGroupFields(row as any));

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
                    idServiceFk: true,
                    description: true,

                    serviceNameSnapshot: true,
                    servicePriceSnapshot: true,
                    serviceDiscountSnapshot: true,
                    serviceDurationSnapshot: true,
                    serviceMaxParticipantsSnapshot: true,

                    // serviceDurationSnapshot: true,


                    // PARTICIPANTES
                    groupEvents: {
                        select: {
                            commentClient: true,
                            isCommentRead: true,
                            eventParticipant: {
                                where: { deletedDate: null },          // ignora soft-deleted
                                select: {
                                    id: true,
                                    idClientWorkspaceFk: true,
                                    idClientFk: true,
                                    eventStatusType: true,
                                },
                            },
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
                    // service: {
                    //     select: {
                    //         id: true,
                    //         name: true,
                    //         duration: true,
                    //         price: true,
                    //         discount: true,
                    //         serviceType: true,
                    //         color: true,
                    //         image: true, // si quieres incluir la imagen
                    //     },
                    // },
                },
            });

            // (opcional) mapeamos a DTO, por si en el futuro necesitas transformar campos
            return events.map(
                ({
                    id,
                    idServiceFk,
                    description,
                    serviceNameSnapshot,
                    servicePriceSnapshot,
                    serviceDiscountSnapshot,
                    serviceDurationSnapshot,
                    serviceMaxParticipantsSnapshot,
                    groupEvents,
                    recurrenceRule,
                    // service,
                }): EventExtraData => ({
                    id,
                    idServiceFk: idServiceFk ?? undefined,
                    description: description ?? undefined,
                    serviceNameSnapshot: serviceNameSnapshot ?? undefined,
                    servicePriceSnapshot: servicePriceSnapshot ?? undefined,
                    serviceDiscountSnapshot: serviceDiscountSnapshot ?? undefined,
                    serviceDurationSnapshot: serviceDurationSnapshot ?? undefined,
                    serviceMaxParticipantsSnapshot: serviceMaxParticipantsSnapshot ?? undefined,
                    eventParticipant: groupEvents?.eventParticipant ?? [],
                    recurrenceRule: recurrenceRule as any ?? undefined,
                    commentClient: groupEvents?.commentClient ?? undefined,
                    isCommentRead: groupEvents?.isCommentRead ?? undefined,
                    // service: service ?? undefined,
                }),
            );
        } catch (error: any) {
            throw new CustomError('EventService.getEventExtraData', error);
        }
    }


    async getEventWithoutWorkerById_Counter(idWorkspace: string): Promise<any> {


    }

    async getEventWithoutWorkerById_List(idWorkspace: string, pagination: Pagination): Promise<any> {


    }

    async getEventById(id: string): Promise<any> {
        try {
            const event = await prisma.event.findUnique({
                where: {
                    id: id,
                    groupEvents: {
                        eventStatusType: {
                            notIn: [EventStatusType.CANCELLED, EventStatusType.CANCELLED_BY_CLIENT_REMOVED]
                        },
                    },
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
                    allDay: true,


                    // service: {
                    //     select: {
                    //         id: true,
                    //         name: true,
                    //         description: true,
                    //     }
                    // },

                    groupEvents: {
                        select: {
                            idCompanyFk: true,
                            idWorkspaceFk: true,
                            eventSourceType: true,
                            eventStatusType: true,
                            commentClient: true,
                            isCommentRead: true,
                            eventParticipant: {
                                select: {
                                    id: true,
                                    idClientFk: true,
                                    idClientWorkspaceFk: true,
                                    eventStatusType: true,
                                }
                            }
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
            return this._withGroupFields(event as any);
        } catch (error: any) {
            throw new CustomError('EventService.getEventById', error);
        }
    }


    async getEventByIdGroup(idGroup: string): Promise<any> {
        try {
            const events = await prisma.event.findMany({
                where: {
                    idGroup: idGroup,
                    groupEvents: {
                        eventStatusType: {
                            notIn: [EventStatusType.CANCELLED, EventStatusType.CANCELLED_BY_CLIENT_REMOVED, EventStatusType.CANCELLED_BY_CLIENT]
                        },
                    },
                },
                select: {
                    id: true,
                    title: true,
                    description: true,
                    startDate: true,
                    endDate: true,
                    idUserPlatformFk: true,
                    idServiceFk: true,
                    idGroup: true,
                    eventPurposeType: true,
                    allDay: true,

                    groupEvents: {
                        select: {
                            idCompanyFk: true,
                            idWorkspaceFk: true,
                            eventSourceType: true,
                            eventStatusType: true,
                            commentClient: true,
                            isCommentRead: true,
                            eventParticipant: {
                                select: {
                                    id: true,
                                    idClientFk: true,
                                    idClientWorkspaceFk: true,
                                    eventStatusType: true,
                                }
                            }
                        }
                    }
                },
                orderBy: {
                    startDate: 'asc'
                }
            });
            return events.map((event) => this._withGroupFields(event as any));
        } catch (error: any) {
            throw new CustomError('EventService.getEventByIdGroup', error);
        }
    }


    // ────────────────────────────────────────────────────────────
    // publicGetAvailableDays (MISMA lógica + logs exhaustivos tipo trace)
    // ────────────────────────────────────────────────────────────
    public async publicGetAvailableDays(
        input: GetTimeSlotsInputSpecial,
        deps: AvailabilityDepsSpecial
    ): Promise<{ days: DayFlag[] }> {
        // Toggle logs
        const DEBUG = true;

        // Deep logs dentro del loop de días (puede ser MUY verboso)
        const DEEP = true;

        const traceId = `AVAILD:${Date.now().toString(36)}:${Math.random()
            .toString(36)
            .slice(2, 7)}`;

        const nowIso = () => new Date().toISOString();

        const dbg = (...args: any[]) => {
            if (!DEBUG) return;
            // eslint-disable-next-line no-console
            console.log(`[${traceId}]`, ...args);
        };

        const group = (title: string, fn: () => void) => {
            if (!DEBUG) return fn();
            // eslint-disable-next-line no-console
            console.groupCollapsed(`[${traceId}] ${title}`);
            try {
                fn();
            } finally {
                // eslint-disable-next-line no-console
                console.groupEnd();
            }
        };

        const table = (label: string, rows: any[]) => {
            if (!DEBUG) return;
            // eslint-disable-next-line no-console
            console.log(`[${traceId}] ${label}`);
            // eslint-disable-next-line no-console
            console.table(rows);
        };

        const safeJson = (v: any) => {
            try {
                return JSON.stringify(v);
            } catch {
                return "[unstringifiable]";
            }
        };

        const fmt = (m: moment.Moment | null | undefined, tz?: string) => {
            if (!m) return null;
            const mm = tz ? m.clone().tz(tz) : m;
            return mm.format("YYYY-MM-DDTHH:mm:ss");
        };

        try {
            const tAll = Date.now();

            const {
                idCompany,
                idWorkspace,
                timeZoneWorkspace,
                range,
                attendees,
                excludeEventId,
                idClient,
            } = input;

            group("publicGetAvailableDays: INPUT", () => {
                dbg("ts:", nowIso());
                dbg("idCompany:", idCompany);
                dbg("idWorkspace:", idWorkspace);
                dbg("timeZoneWorkspace:", timeZoneWorkspace);
                dbg("excludeEventId:", excludeEventId ?? null);
                dbg("idClient:", idClient ?? null);
                dbg("range:", range ?? null);
                dbg(
                    "attendees:",
                    (attendees ?? []).map((a) => ({
                        serviceId: a.serviceId,
                        durationMin: a.durationMin,
                        staffId: a.staffId ?? null,
                        categoryId: (a as any).categoryId ?? null,
                    }))
                );
            });

            if (!range) throw new Error("Faltan fechas de rango (start/end)");
            const { start, end } = range;

            const {
                bookingConfig,
                businessHoursService,
                workerHoursService,
                temporaryHoursService,
                cache,
            } = deps;

            const BOOKING_PAGE_CONFIG: OnlineBookingConfig = bookingConfig;

            group("BOOKING_PAGE_CONFIG (resumen)", () => {
                dbg("bookingWindow:", BOOKING_PAGE_CONFIG?.bookingWindow ?? null);
                dbg("slot:", BOOKING_PAGE_CONFIG?.slot ?? null);
                dbg("resources:", BOOKING_PAGE_CONFIG?.resources ?? null);
                dbg("resources.ids raw:", safeJson((BOOKING_PAGE_CONFIG as any)?.resources?.ids ?? null));
            });

            // bookingWindow
            const { maxAdvanceDays = 60, minLeadTimeMin = 60 } =
                BOOKING_PAGE_CONFIG.bookingWindow ?? {};

            const alignMode: "clock" | "service" =
                BOOKING_PAGE_CONFIG.slot?.alignMode === "service" ? "service" : "clock";

            const intervalMinutes =
                alignMode === "service"
                    ? attendees?.reduce((acc, a) => acc + (a.durationMin ?? 0), 0)
                    : BOOKING_PAGE_CONFIG?.slot?.stepMinutes;

            const professionalAllowed =
                BOOKING_PAGE_CONFIG?.resources?.ids?.map((r) =>
                    Array.isArray(r) ? r?.[0] : r
                ) ?? [];

            group("CONFIG DERIVADA", () => {
                dbg("maxAdvanceDays:", maxAdvanceDays);
                dbg("minLeadTimeMin:", minLeadTimeMin);
                dbg("alignMode:", alignMode);
                dbg("intervalMinutes:", intervalMinutes);
                dbg("professionalAllowed len:", professionalAllowed.length);
                dbg("professionalAllowed:", professionalAllowed);
            });

            // Validaciones rápidas
            if (!idCompany || !idWorkspace) throw new Error("Faltan idCompany / idWorkspace");
            if (!timeZoneWorkspace) throw new Error("Falta timeZoneWorkspace");
            if (!start || !end) throw new Error("Faltan fechas de rango (start/end)");

            const dayList = enumerateDays(start, end);

            group("RANGO / dayList", () => {
                dbg("start:", start, "end:", end);
                dbg("dayList len:", dayList.length);
                dbg("dayList sample:", dayList.slice(0, 10));
            });

            if (!Array.isArray(attendees) || attendees.length === 0) {
                dbg("CORTE: no attendees → todos dayoff");
                return {
                    days: dayList.map((d) => ({
                        date: d,
                        hasSlots: false,
                        capacity: 0,
                        status: "dayoff",
                    })),
                };
            }

            if (professionalAllowed.length === 0) {
                dbg("CORTE: no professionalAllowed → todos dayoff");
                return {
                    days: dayList.map((d) => ({
                        date: d,
                        hasSlots: false,
                        capacity: 0,
                        status: "dayoff",
                    })),
                };
            }

            if (
                typeof intervalMinutes !== "number" ||
                !Number.isFinite(intervalMinutes) ||
                intervalMinutes <= 0
            ) {
                throw new Error("El intervalo de minutos debe ser un número positivo");
            }

            const STEP_MINUTES = intervalMinutes; // OJO: aquí estás usando alignMode=service => step = durTotal
            const TZ_WS = timeZoneWorkspace;

            group("STEP / TZ", () => {
                dbg("STEP_MINUTES:", STEP_MINUTES);
                dbg("TZ_WS:", TZ_WS);
                dbg("slot.stepMinutes (config):", BOOKING_PAGE_CONFIG?.slot?.stepMinutes ?? null);
            });

            // Helpers comunes ------------------------------------
            type Range = { start: moment.Moment; end: moment.Moment };

            const mergeRanges = (rs: Range[]): Range[] => {
                if (!rs.length) return [];
                const arr = rs
                    .map((r) => ({
                        start: r.start.clone().seconds(0).milliseconds(0),
                        end: r.end.clone().seconds(0).milliseconds(0),
                    }))
                    .filter((r) => r.start.isBefore(r.end))
                    .sort((a, b) => a.start.valueOf() - b.start.valueOf());
                const out: Range[] = [];
                let cur = arr[0];
                for (let i = 1; i < arr.length; i++) {
                    const r = arr[i];
                    if (!r.start.isAfter(cur.end)) {
                        if (r.end.isAfter(cur.end)) cur.end = r.end;
                    } else {
                        out.push(cur);
                        cur = r;
                    }
                }
                out.push(cur);
                return out;
            };

            const subtractBusy = (shift: Range, busy: Range[]): Range[] => {
                if (!busy.length) return [shift];
                const mergedBusy = mergeRanges(busy);
                const free: Range[] = [];
                let cursor = shift.start.clone();

                for (const b of mergedBusy) {
                    if (b.end.isSameOrBefore(cursor) || b.start.isSameOrAfter(shift.end)) continue;
                    if (b.start.isAfter(cursor)) {
                        free.push({ start: cursor.clone(), end: moment.min(b.start, shift.end) });
                    }
                    cursor = moment.max(cursor, b.end);
                    if (!cursor.isBefore(shift.end)) break;
                }
                if (cursor.isBefore(shift.end)) free.push({ start: cursor, end: shift.end.clone() });
                return free;
            };

            const countStartsInWindows = (
                wins: Range[],
                durMin: number,
                stepMin: number,
                clampFrom?: moment.Moment
            ): number => {
                if (!wins.length) return 0;
                let total = 0;

                for (const w of wins) {
                    const start = clampFrom ? moment.max(w.start, clampFrom) : w.start;
                    const latestStart = w.end.clone().subtract(durMin, "minutes");
                    if (start.isAfter(latestStart)) continue;

                    // Alineación a la “rejilla” dentro de la ventana
                    const origin = w.start;
                    const diffMin = Math.max(0, Math.floor((start.valueOf() - origin.valueOf()) / 60000));
                    const rem = diffMin % stepMin;
                    const first = start
                        .clone()
                        .add(rem === 0 ? 0 : stepMin - rem, "minutes")
                        .seconds(0)
                        .milliseconds(0);

                    if (first.isAfter(latestStart)) continue;

                    const spanMin = Math.floor((latestStart.valueOf() - first.valueOf()) / 60000);
                    const cnt = 1 + Math.floor(spanMin / stepMin);
                    if (cnt > 0) total += cnt;
                }

                return total;
            };

            // 1) Snapshot de servicios (1 llamada)
            const wantedServiceIds = Array.from(
                new Set(attendees.map((a) => a.serviceId).filter(Boolean))
            ) as string[];

            group("SERVICES: wantedServiceIds", () => {
                dbg("wantedServiceIds:", wantedServiceIds);
                dbg("idWorkspace:", idWorkspace);
            });

            const tSvc = Date.now();
            const services =
                wantedServiceIds.length > 0 ? await getServiceByIds(wantedServiceIds, idWorkspace) : [];

            group(`SERVICES: getServiceByIds (${Date.now() - tSvc}ms)`, () => {
                dbg("services len:", services.length);
                table(
                    "services (snapshot)",
                    services.map((s: any) => ({
                        id: s.id,
                        duration: s.duration,
                        maxParticipants: s.maxParticipants,
                    }))
                );
            });

            const svcById: Record<string, { durationMin: number; maxParticipants: number }> = {};
            for (const s of services as any[]) {
                const duration = typeof s.duration === "number" ? s.duration : 60;
                const maxP = Math.max(1, typeof s.maxParticipants === "number" ? s.maxParticipants : 1);
                svcById[s.id] = { durationMin: duration, maxParticipants: maxP };
            }

            const getSvcDur = (svcId: string, fallback: number) =>
                svcById[svcId]?.durationMin ?? fallback;

            const getSvcCap = (svcId: string) => Math.max(1, svcById[svcId]?.maxParticipants ?? 1);

            // 2) Usuarios elegibles por servicio (paralelo)
            const tElig = Date.now();
            const userIdsByServiceEntries = await Promise.all(
                attendees.map(async (a) => {
                    const svcId = a.serviceId;
                    if (!svcId) return [null, []] as const;

                    if (a.staffId) {
                        const elig = professionalAllowed.includes(a.staffId) ? [a.staffId] : [];
                        return [svcId, elig] as const;
                    }

                    const users = await getUsersWhoCanPerformService_SPECIAL(
                        idWorkspace,
                        svcId,
                        (a as any).categoryId ?? null,
                        cache
                    );

                    const elig = users.filter((id) => professionalAllowed.includes(id));
                    return [svcId, elig] as const;
                })
            );

            const userIdsByService = new Map<string, string[]>();
            for (const [svcId, ids] of userIdsByServiceEntries) {
                if (svcId) userIdsByService.set(svcId, ids as any);
            }

            const allUserIds = Array.from(new Set(Array.from(userIdsByService.values()).flat()));

            group(`ELIGIBILIDAD (${Date.now() - tElig}ms)`, () => {
                table(
                    "eligible users por servicio",
                    Array.from(userIdsByService.entries()).map(([svcId, ids]) => ({
                        serviceId: svcId,
                        eligibleCount: ids.length,
                        eligibleUserIds: ids.join(", "),
                    }))
                );
                dbg("allUserIds len:", allUserIds.length);
                dbg("allUserIds:", allUserIds);
            });

            if (!allUserIds.length) {
                dbg("CORTE: allUserIds vacío → todos dayoff");
                return {
                    days: dayList.map((d) => ({
                        date: d,
                        hasSlots: false,
                        capacity: 0,
                        status: "dayoff",
                    })),
                };
            }

            // 3) Datos comunes del rango
            const tFetch = Date.now();
            const [businessHours, workerHoursMap, temporaryHoursMap, events] = await Promise.all([
                businessHoursService.getBusinessHoursFromRedis(idCompany, idWorkspace),
                workerHoursService.getWorkerHoursFromRedis(allUserIds, idWorkspace),
                temporaryHoursService.getTemporaryHoursFromRedis(allUserIds, idWorkspace, { start, end }),
                getEventsOverlappingRange_SPECIAL(idWorkspace, allUserIds, start, end, excludeEventId),
            ]);

            group(`FETCH RANGE DATA (${Date.now() - tFetch}ms)`, () => {
                dbg("businessHours keys:", businessHours ? Object.keys(businessHours as any) : null);
                dbg("businessHours sample:", businessHours ?? null);

                table(
                    "workerHoursMap (resumen)",
                    allUserIds.map((uid) => {
                        const wh = (workerHoursMap as any)?.[uid];
                        return {
                            userId: uid,
                            hasWorkerHours: !!wh,
                            workerHoursKeys: wh ? Object.keys(wh).join(", ") : "",
                        };
                    })
                );

                // Nota: en tu otro log, temporaryHoursMap “exists” pero no tenía entradas. Aquí lo dejamos visible.
                table(
                    "temporaryHoursMap (resumen)",
                    allUserIds.map((uid) => {
                        const th = (temporaryHoursMap as any)?.[uid];
                        return {
                            userId: uid,
                            hasTemporaryHoursObj: !!th,
                            keysCount: th ? Object.keys(th).length : 0,
                        };
                    })
                );

                dbg("events len:", Array.isArray(events) ? events.length : null);
                dbg(
                    "events sample (first 10):",
                    (events ?? []).slice(0, 10).map((e: any) => ({
                        uid: e?.idUserPlatformFk,
                        start: e?.startDate,
                        end: e?.endDate,
                        id: e?.id,
                    }))
                );
            });

            // Eventos por usuario
            const eventsByUser = new Map<string, Array<{ startDate: Date; endDate: Date }>>();
            for (const ev of events as any[]) {
                const uid = ev.idUserPlatformFk;
                if (!uid) continue;
                let arr = eventsByUser.get(uid);
                if (!arr) {
                    arr = [];
                    eventsByUser.set(uid, arr);
                }
                arr.push({ startDate: ev.startDate, endDate: ev.endDate });
            }

            group("eventsByUser (counts)", () => {
                table(
                    "busyEventsCount por user",
                    allUserIds.map((uid) => ({
                        userId: uid,
                        busyEventsCount: (eventsByUser.get(uid) ?? []).length,
                    }))
                );
            });

            // 4) bookingWindow absoluto (TZ negocio)
            const nowWS = moment.tz(TZ_WS);
            const earliestAllowed = nowWS.clone().add(minLeadTimeMin, "minutes").seconds(0).milliseconds(0);
            const latestAllowedEnd = nowWS.clone().add(maxAdvanceDays, "days").endOf("day");

            group("BOOKING WINDOW ABSOLUTO", () => {
                dbg("nowWS:", fmt(nowWS, TZ_WS));
                dbg("earliestAllowed:", fmt(earliestAllowed, TZ_WS));
                dbg("latestAllowedEnd:", fmt(latestAllowedEnd, TZ_WS));
            });

            const withinBookingWindowDay = (dayStart: moment.Moment, dayEnd: moment.Moment) => {
                if (dayEnd.isBefore(earliestAllowed)) return false;
                if (dayStart.isAfter(latestAllowedEnd)) return false;
                return true;
            };

            // 5) Info single-service / group
            const isSingleService = attendees.length === 1;
            const singleAttendee = isSingleService ? attendees[0] : null;
            const singleSvcId = singleAttendee?.serviceId || null;
            const singleSvcCap = singleSvcId ? getSvcCap(singleSvcId) : 1;
            const singleIsGroup = isSingleService && singleSvcCap > 1;
            const singleElig =
                singleSvcId && userIdsByService.has(singleSvcId) ? userIdsByService.get(singleSvcId) || [] : [];

            group("SINGLE SERVICE INFO", () => {
                dbg("isSingleService:", isSingleService);
                dbg("singleSvcId:", singleSvcId);
                dbg("singleSvcCap:", singleSvcCap);
                dbg("singleIsGroup:", singleIsGroup);
                dbg("singleElig len:", singleElig.length);
                dbg("singleElig:", singleElig);
            });

            // 6) Eventos grupales (solo si 1 servicio grupal) para TODO el rango
            let groupEvents: Array<{
                idUserPlatformFk: string | null;
                startDate: Date;
                endDate: Date;
                participantsCount: number;
                participantClientIds: string[];
                participantClientWorkspaceIds: string[];
            }> = [];

            if (singleIsGroup && singleSvcId && singleElig.length) {
                const startRange = moment.tz(`${start}T00:00:00`, "YYYY-MM-DDTHH:mm:ss", TZ_WS).toDate();
                const endRange = moment.tz(`${end}T23:59:59`, "YYYY-MM-DDTHH:mm:ss", TZ_WS).toDate();

                group("GROUP EVENTS QUERY (range)", () => {
                    dbg("startRange:", startRange);
                    dbg("endRange:", endRange);
                    dbg("singleSvcId:", singleSvcId);
                    dbg("singleElig:", singleElig);
                });

                const tGE = Date.now();
                const rows = await prisma.event.findMany({
                    where: {
                        idServiceFk: singleSvcId,
                        idUserPlatformFk: { in: singleElig },
                        deletedDate: null,
                        startDate: { lt: endRange },
                        endDate: { gt: startRange },
                        groupEvents: { idWorkspaceFk: idWorkspace },
                        ...(excludeEventId ? { id: { not: excludeEventId } } : {}),
                    },
                    select: {
                        idUserPlatformFk: true,
                        startDate: true,
                        endDate: true,
                        groupEvents: {
                            select: {
                                eventParticipant: {
                                    where: { deletedDate: null },
                                    select: {
                                        idClientFk: true,
                                        idClientWorkspaceFk: true,
                                    },
                                },
                            },
                        },
                    },
                });

                // group(`GROUP EVENTS QUERY RESULT (${Date.now() - tGE}ms)`, () => {
                //     dbg("rows len:", rows.length);
                //     dbg(
                //         "rows sample (first 10):",
                //         rows.slice(0, 10).map((r) => ({
                //             uid: r.idUserPlatformFk,
                //             start: r.startDate,
                //             end: r.endDate,
                //             participants: r.eventParticipant.length,
                //         }))
                //     );
                // });

                groupEvents = rows.map((r) => {
                    const participants = r.groupEvents?.eventParticipant ?? [];
                    return {
                        idUserPlatformFk: r.idUserPlatformFk,
                        startDate: r.startDate,
                        endDate: r.endDate,
                        participantsCount: participants.length,
                        participantClientIds: participants.map((p) => p.idClientFk).filter(Boolean) as string[],
                        participantClientWorkspaceIds: participants
                            .map((p) => p.idClientWorkspaceFk)
                            .filter(Boolean) as string[],
                    };
                });
            }

            const groupEventsByDay = new Map<string, typeof groupEvents>();
            if (groupEvents.length) {
                for (const ev of groupEvents) {
                    const dayISO = moment(ev.startDate).tz(TZ_WS).format("YYYY-MM-DD");
                    const arr = groupEventsByDay.get(dayISO) || [];
                    arr.push(ev);
                    groupEventsByDay.set(dayISO, arr);
                }
            }

            group("groupEventsByDay (counts)", () => {
                if (!groupEvents.length) {
                    dbg("groupEvents: 0");
                    return;
                }
                table(
                    "groupEventsByDay",
                    Array.from(groupEventsByDay.entries()).map(([day, arr]) => ({
                        day,
                        events: arr.length,
                    }))
                );
            });

            // Helper: turnos por user/día (business/worker/tmp)
            const getShiftsFor = (uid: string, dateISO: string): Range[] => {
                const dayStart = moment.tz(`${dateISO}T00:00:00`, "YYYY-MM-DDTHH:mm:ss", TZ_WS);
                const weekDay = dayStart.format("dddd").toUpperCase() as Weekday;

                const workerDay = (workerHoursMap as any)?.[uid]?.[weekDay];
                const tempDay = (temporaryHoursMap as any)?.[uid]?.[dateISO];

                let slots: string[][] = [];
                let source: "temp(null)" | "temp(array)" | "worker(null)" | "worker(array)" | "biz" = "biz";

                if (tempDay === null) {
                    slots = [];
                    source = "temp(null)";
                } else if (Array.isArray(tempDay) && tempDay.length) {
                    slots = tempDay;
                    source = "temp(array)";
                } else if (workerDay === null) {
                    slots = [];
                    source = "worker(null)";
                } else if (Array.isArray(workerDay) && workerDay.length) {
                    slots = workerDay;
                    source = "worker(array)";
                } else {
                    const biz = (businessHours as any)?.[weekDay];
                    slots = biz === null ? [] : Array.isArray(biz) ? biz : [];
                    source = "biz";
                }

                if (DEEP) {
                    dbg(`getShiftsFor uid=${uid} date=${dateISO} weekDay=${weekDay} source=${source}`, {
                        tempDayType: tempDay === null ? "null" : Array.isArray(tempDay) ? `array(len=${tempDay.length})` : typeof tempDay,
                        workerDayType: workerDay === null ? "null" : Array.isArray(workerDay) ? `array(len=${workerDay.length})` : typeof workerDay,
                        slots,
                    });
                }

                return (slots || []).map(([s, e]) => ({
                    start: moment.tz(`${dateISO}T${s}`, "YYYY-MM-DDTHH:mm:ss", TZ_WS),
                    end: moment.tz(`${dateISO}T${e}`, "YYYY-MM-DDTHH:mm:ss", TZ_WS),
                }));
            };

            // LOOP DÍAS ------------------------------------------
            const days: DayFlag[] = [];

            for (const dateISO of dayList) {
                const dayStart = moment.tz(`${dateISO}T00:00:00`, "YYYY-MM-DDTHH:mm:ss", TZ_WS);
                const dayEnd = dayStart.clone().endOf("day");

                const inWindow = withinBookingWindowDay(dayStart, dayEnd);

                const isLeadDay = dayStart.isSame(earliestAllowed, "day");
                const clampFrom = isLeadDay ? earliestAllowed : undefined;

                const dayStartUTC = dayStart.clone().utc().toDate();
                const dayEndUTC = dayEnd.clone().utc().toDate();

                if (DEEP) {
                    group(`DAY ${dateISO}`, () => {
                        dbg("dayStart:", fmt(dayStart, TZ_WS));
                        dbg("dayEnd:", fmt(dayEnd, TZ_WS));
                        dbg("inWindow:", inWindow);
                        dbg("isLeadDay:", isLeadDay);
                        dbg("clampFrom:", clampFrom ? fmt(clampFrom, TZ_WS) : null);
                        dbg("dayStartUTC:", dayStartUTC);
                        dbg("dayEndUTC:", dayEndUTC);
                    });
                }

                // Fuera de ventana → dayoff
                if (!inWindow) {
                    days.push({ date: dateISO, hasSlots: false, capacity: 0, status: "dayoff" });
                    continue;
                }

                // ---- SINGLE SERVICE
                if (isSingleService && singleSvcId && singleAttendee) {
                    const a = singleAttendee;
                    const elig = singleElig;
                    const durMin = getSvcDur(singleSvcId, a.durationMin);
                    const svcCap = singleSvcCap;
                    const isGroup = singleIsGroup;

                    if (!elig.length || durMin <= 0) {
                        if (DEBUG) dbg(`DAY ${dateISO} SINGLE: sin elig o durMin<=0`, { eligLen: elig.length, durMin });
                        days.push({ date: dateISO, hasSlots: false, capacity: 0, status: "dayoff" });
                        continue;
                    }

                    // Numerador:
                    // (A) plazas libres en clases existentes (solo grupal)
                    let seatsFromExisting = 0;
                    if (isGroup && groupEventsByDay.has(dateISO)) {
                        for (const ev of groupEventsByDay.get(dateISO)!) {
                            const startLocal = moment(ev.startDate).tz(TZ_WS).seconds(0).milliseconds(0);
                            if (clampFrom && startLocal.isBefore(clampFrom)) continue;

                            const booked = ev.participantsCount;
                            const left = Math.max(0, svcCap - booked);
                            if (left <= 0) continue;

                            const alreadyIn =
                                !!idClient &&
                                (ev.participantClientIds.includes(idClient) ||
                                    ev.participantClientWorkspaceIds.includes(idClient));

                            if (!alreadyIn) seatsFromExisting += left;
                        }
                    }

                    // (B) plazas potenciales en slots nuevos + potencial teórico (sin busy)
                    let potentialStarts = 0;
                    let startsCreatable = 0;
                    const numerDetail: any[] = [];

                    for (const uid of elig) {
                        const shifts = getShiftsFor(uid, dateISO);
                        if (!shifts.length) {
                            if (DEEP) {
                                numerDetail.push({
                                    userId: uid,
                                    shiftsCount: 0,
                                    potentialStarts: 0,
                                    busyCount: 0,
                                    freeWindows: "",
                                    startsCreatable: 0,
                                });
                            }
                            continue;
                        }

                        const shiftsMerged = mergeRanges(shifts);
                        const potentialCnt = countStartsInWindows(shiftsMerged, durMin, STEP_MINUTES, clampFrom);
                        potentialStarts += potentialCnt;

                        const busy: Range[] = (eventsByUser.get(uid) || [])
                            .filter((ev) => ev.startDate < dayEndUTC && ev.endDate > dayStartUTC)
                            .map((ev) => ({
                                start: moment(ev.startDate).tz(TZ_WS),
                                end: moment(ev.endDate).tz(TZ_WS),
                            }));

                        const freeWins: Range[] = [];
                        for (const sh of shifts) {
                            const shStart = clampFrom ? moment.max(sh.start, clampFrom) : sh.start;
                            if (!shStart.isBefore(sh.end)) continue;
                            freeWins.push(...subtractBusy({ start: shStart, end: sh.end }, busy));
                        }

                        const mergedFree = mergeRanges(freeWins);
                        const freeCnt = countStartsInWindows(mergedFree, durMin, STEP_MINUTES, clampFrom);
                        startsCreatable += freeCnt;

                        if (DEEP) {
                            numerDetail.push({
                                userId: uid,
                                shiftsCount: shiftsMerged.length,
                                shifts: shiftsMerged.map((s) => `${fmt(s.start, TZ_WS)}-${fmt(s.end, TZ_WS)}`).join(" | "),
                                potentialStarts: potentialCnt,
                                busyCount: busy.length,
                                freeWindows: mergedFree.map((w) => `${fmt(w.start, TZ_WS)}-${fmt(w.end, TZ_WS)}`).join(" | "),
                                startsCreatable: freeCnt,
                            });
                        }
                    }

                    const seatsFromNew = startsCreatable * (isGroup ? svcCap : 1);
                    const capacity = seatsFromExisting + seatsFromNew;
                    const hasSlots = capacity > 0;
                    const status: DayAvailabilityStatus = hasSlots
                        ? "available"
                        : potentialStarts > 0
                            ? "completed"
                            : "dayoff";

                    if (DEEP || (DEBUG && !hasSlots)) {
                        group(`DAY ${dateISO} SINGLE: RESULT`, () => {
                            dbg("seatsFromExisting:", seatsFromExisting);
                            dbg("potentialStarts:", potentialStarts);
                            dbg("startsCreatable:", startsCreatable);
                            dbg("seatsFromNew:", seatsFromNew);
                            dbg("capacity:", capacity);
                            dbg("status:", status);
                            if (DEEP) table("numerador por user", numerDetail);
                        });
                    }

                    days.push({ date: dateISO, hasSlots, capacity, status });
                    continue;
                }

                // ---- MULTI-SERVICIO (sin grupales)
                let anyGroup = false;
                for (const a of attendees) {
                    if (getSvcCap(a.serviceId) > 1) {
                        anyGroup = true;
                        break;
                    }
                }
                if (anyGroup) {
                    if (DEBUG) dbg(`DAY ${dateISO} MULTI: contiene grupal → dayoff`);
                    days.push({ date: dateISO, hasSlots: false, capacity: 0, status: "dayoff" });
                    continue;
                }

                const freeStartsByService: number[] = [];
                const potentialStartsByService: number[] = [];

                const multiDetail: any[] = [];

                for (const a of attendees) {
                    const svcId = a.serviceId;
                    const elig = userIdsByService.get(svcId) ?? [];
                    const durMin = getSvcDur(svcId, a.durationMin);

                    if (!elig.length || durMin <= 0) {
                        freeStartsByService.push(0);
                        potentialStartsByService.push(0);
                        if (DEEP) multiDetail.push({ serviceId: svcId, eligLen: elig.length, durMin, potentialStarts: 0, freeStarts: 0 });
                        continue;
                    }

                    // Potencial (sin busy) + Numerador (libre tras busy)
                    let potentialStarts = 0;
                    let freeStarts = 0;
                    for (const uid of elig) {
                        const shifts = getShiftsFor(uid, dateISO);
                        if (!shifts.length) continue;

                        const shiftsMerged = mergeRanges(shifts);
                        potentialStarts += countStartsInWindows(shiftsMerged, durMin, STEP_MINUTES, clampFrom);

                        const busy: Range[] = (eventsByUser.get(uid) || [])
                            .filter((ev) => ev.startDate < dayEndUTC && ev.endDate > dayStartUTC)
                            .map((ev) => ({
                                start: moment(ev.startDate).tz(TZ_WS),
                                end: moment(ev.endDate).tz(TZ_WS),
                            }));

                        const freeWins: Range[] = [];
                        for (const sh of shifts) {
                            const shStart = clampFrom ? moment.max(sh.start, clampFrom) : sh.start;
                            if (!shStart.isBefore(sh.end)) continue;
                            freeWins.push(...subtractBusy({ start: shStart, end: sh.end }, busy));
                        }

                        const mergedFree = mergeRanges(freeWins);
                        freeStarts += countStartsInWindows(mergedFree, durMin, STEP_MINUTES, clampFrom);
                    }

                    freeStartsByService.push(freeStarts);
                    potentialStartsByService.push(potentialStarts);

                    if (DEEP) multiDetail.push({ serviceId: svcId, eligLen: elig.length, durMin, potentialStarts, freeStarts });
                }

                const allPotentialZero = potentialStartsByService.every((d) => d <= 0);
                if (allPotentialZero) {
                    if (DEBUG) dbg(`DAY ${dateISO} MULTI: allPotentialZero → dayoff`);
                    days.push({ date: dateISO, hasSlots: false, capacity: 0, status: "dayoff" });
                    continue;
                }

                const capacity = freeStartsByService.length > 0 ? Math.min(...freeStartsByService) : 0;
                const hasSlots = capacity > 0;
                const status: DayAvailabilityStatus = !hasSlots ? "completed" : "available";

                if (DEEP || (DEBUG && !hasSlots)) {
                    group(`DAY ${dateISO} MULTI: RESULT`, () => {
                        dbg("potentialStarts:", potentialStartsByService);
                        dbg("freeStarts:", freeStartsByService);
                        dbg("capacity:", capacity);
                        dbg("status:", status);
                        if (DEEP) table("multi detail", multiDetail);
                    });
                }

                days.push({ date: dateISO, hasSlots, capacity, status });
            }

            group("Available days (summary)", () => {
                dbg(`TOTAL ${Date.now() - tAll}ms`);
                table(
                    "days",
                    days.map((d) => ({
                        date: d.date,
                        status: d.status,
                        hasSlots: d.hasSlots,
                        capacity: d.capacity,
                    }))
                );
            });

            return { days };
        } catch (error: any) {
            try {
                // eslint-disable-next-line no-console
                console.error(`[${traceId}] ERROR publicGetAvailableDays`, {
                    message: error?.message,
                    stack: error?.stack,
                    input: {
                        idCompany: input?.idCompany,
                        idWorkspace: input?.idWorkspace,
                        timeZoneWorkspace: input?.timeZoneWorkspace,
                        range: input?.range,
                        attendees: (input?.attendees ?? []).map((a: any) => ({
                            serviceId: a?.serviceId,
                            durationMin: a?.durationMin,
                            staffId: a?.staffId ?? null,
                            categoryId: a?.categoryId ?? null,
                        })),
                    },
                });
            } catch {
                // noop
            }
            throw new CustomError("EventService.publicGetAvailableDays", error);
        }
    }

    /**
    * Elige un staff aplicando Weighted Smooth Round Robin,
    * con lock/hold temporal en Redis para evitar colisiones.
    *
    * Ahora está “scoped” por booking page.
    *
    * @param idWorkspace   - workspace actual
    * @param idBookingPage - booking page dentro del workspace
    * @param idService     - servicio a reservar
    * @param start         - inicio del slot (Date)
    * @param end           - fin del slot (Date)
    * @param eligibles     - userIds elegibles (ya filtrados por disponibilidad)
    * @param weightsMap    - mapa userId -> peso (0–100), default 100
    */
    chooseStaffWithRR = async (
        idWorkspace: string,
        idBookingPage: string,
        idService: string,
        start: Date,
        end: Date,
        eligibles: string[],
        weightsMap: Record<string, number>
    ): Promise<string | null> => {
        if (!eligibles.length) return null;

        const rr = RedisStrategyFactory.getStrategy("roundRobin") as IRedisRoundRobinStrategy;

        // 1) Hold del slot (scoped por workspace + bookingPage + service)
        const acquired = await rr.acquireHold({
            idWorkspace,
            idService,
            startISO: start.toISOString(),
            endISO: end.toISOString(),
            ttlSec: TIME_SECONDS.MINUTE,
        });
        if (!acquired) return null; // otro proceso está reservando este mismo slot

        // 2) Weighted Smooth RR (usa pesos 0–100; default 100)
        const chosen = await rr.pickWeightedSmoothRR({
            idWorkspace,
            idService,
            eligibles,
            weights: weightsMap,
            stateTTLSec: TIME_SECONDS.WEEK * 2
        });

        if (!chosen) {
            // si no pudimos elegir, liberamos el hold
            await rr.releaseHold({
                idWorkspace,
                idService,
                startISO: start.toISOString(),
                endISO: end.toISOString(),
            });
            return null;
        }

        // Nota: deja el hold vivo hasta confirmar creación; si abortas luego, libera el hold.
        return chosen;
    };



    // internal
    getEventDataById = async (idEvent: string, idWorkspace: string) => {
        try {
            const event = await prisma.event.findFirst({
                where: { id: idEvent, /* idWorkspaceFk: idWorkspace, */ deletedDate: null },
                select: {
                    // Campos específicos del evento que quieres devolver
                    id: true,
                    title: true,
                    description: true,
                    startDate: true,
                    endDate: true,
                    idUserPlatformFk: true,
                    idServiceFk: true,
                    eventPurposeType: true,
                    // eventSourceType: true,
                    // eventStatusType: true,
                    allDay: true,
                    // timeZone: true,
                    serviceNameSnapshot: true,
                    servicePriceSnapshot: true,
                    serviceDiscountSnapshot: true,
                    serviceDurationSnapshot: true,
                    serviceMaxParticipantsSnapshot: true,

                    // Relaciones con select específico
                    // eventParticipant: {
                    //     where: { deletedDate: null },
                    //     select: {
                    //         id: true,
                    //         idClientFk: true,
                    //         idClientWorkspaceFk: true,
                    //         eventStatusType: true,
                    //     },
                    // },
                    groupEvents: {
                        select: {
                            eventSourceType: true,
                            eventStatusType: true,
                            eventParticipant: {
                                where: { deletedDate: null },
                                select: {
                                    id: true,
                                    idClientFk: true,
                                    idClientWorkspaceFk: true,
                                    eventStatusType: true,
                                },
                            },

                        }
                    }


                },
            });

            console.log("Fetched event:", event);

            return {
                item: event,
                count: event ? 1 : 0
            };
        } catch (error: any) {
            throw new CustomError("EventService.getEventDataById", error);
        }
    }

    getGroupDataById = async (idGroup: string, idWorkspace: string) => {
        try {
            const events = await prisma.event.findMany({
                where: {
                    // idWorkspaceFk: idWorkspace,
                    idGroup: idGroup,
                    deletedDate: null
                },
                select: {
                    // Campos específicos del evento que quieres devolver
                    id: true,
                    title: true,
                    description: true,
                    startDate: true,
                    endDate: true,
                    idUserPlatformFk: true,
                    idServiceFk: true,
                    eventPurposeType: true,

                    allDay: true,
                    idGroup: true,

                    // timeZone: true,
                    serviceNameSnapshot: true,
                    servicePriceSnapshot: true,
                    serviceDiscountSnapshot: true,
                    serviceDurationSnapshot: true,
                    serviceMaxParticipantsSnapshot: true,

                    // Relaciones con select específico
                    groupEvents: {
                        select: {
                            eventSourceType: true,
                            eventStatusType: true,
                            eventParticipant: {
                                where: { deletedDate: null },
                                select: {
                                    id: true,
                                    idClientFk: true,
                                    idClientWorkspaceFk: true,
                                    eventStatusType: true,
                                },
                            },

                        }
                    }
                },
            });

            console.log("Fetched group events:", events);

            return {
                item: events,
                count: events.length
            };
        } catch (error: any) {
            throw new CustomError("EventService.getGroupDataById", error);
        }
    }
}
