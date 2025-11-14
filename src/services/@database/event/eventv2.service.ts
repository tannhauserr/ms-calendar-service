import { Event, EventParticipant, EventStatusType, Prisma, PrismaClient, ActionSectionType } from "@prisma/client";
import prisma from "../../../lib/prisma";
import CustomError from "../../../models/custom-error/CustomError";
import { Pagination } from "../../../models/pagination";
import { getGenericSpecialEvent2 } from "../../../utils/get-genetic/calendar-event/getGenericSpecialEvent2";
import { RecurrenceStrategyFactory } from "../recurrence-rule/strategy/factory";
import { NewStrategy } from "../recurrence-rule/strategy/new.strategy";
import { EventExtraData } from "./dto/EventExtraData";
import { EventForBackend } from "./dto/EventForBackend";
import { buildNestedUpdates, toPrismaEventUpdate } from "./util/toPrismaEventUpdate";

import moment from "moment";
import { CONSOLE_COLOR } from "../../../constant/console-color";
import * as RabbitPUBSUB from "../../../services/@rabbitmq/pubsub/functions";
import { getServiceByIds } from "../../@service-token-client/api-ms/bookingPage.ms";
import { BusinessHourService } from "../all-business-services/business-hours/business-hours.service";
import { TemporaryBusinessHourService } from "../all-business-services/temporary-business-hour/temporary-business-hour.service";
import { WorkerBusinessHourService } from "../all-business-services/worker-business-hours/worker-business-hours.service";
import { DEFAULT_RECURRENCE_COUNT, MAX_RECURRENCE_COUNT } from "../recurrence-rule/strategy/type";
import { DayAvailabilityStatus, DayFlag } from "./types";
import { enumerateDays, getEventsOverlappingRange, getUsersWhoCanPerformService } from "./util/event-availability";

import {
    assignSequentially_SPECIAL,
    computeSlotConfig,
    getEventsOverlappingRange_SPECIAL,
    getUsersWhoCanPerformService_SPECIAL,
    groupEventsByUser_SPECIAL,
    mergeTouchingWindows_SPECIAL,
    subtractBusyFromShift_SPECIAL,
    Weekday,
    type AvailabilityDepsSpecial,
    type BusinessHoursType,
    type GetTimeSlotsInputSpecial,
    type TemporaryHoursMapType,
    type WorkerHoursMapType
} from "../event/availability-special.service"; // <-- ajusta la ruta

import { TIME_SECONDS } from "../../../constant/time";
import { IRedisRoundRobinStrategy } from "../../@redis/cache/interfaces/interfaces";
import { OnlineBookingConfig } from "../../@redis/cache/interfaces/models/booking-config";
import { ServiceBrief } from "../../@redis/cache/interfaces/models/service-brief";
import { RedisStrategyFactory } from "../../@redis/cache/strategies/redisStrategyFactory";
import { getServiceByUserIds } from "../../@service-token-client/api-ms/bookingPage.ms";
import { _getServicesSnapshotById } from "./util/getInfoServices";
import { createNotification } from "../../../models/notification/util/trigger/for-action";


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

        let service: ServiceBrief | ServiceBrief[] = await getServiceByUserIds(
            [event.idServiceFk],
            event.idWorkspaceFk
        );
        service = service.length > 0 ? service[0] : null;

        console.log("mira que es esto en addEventV2", service);

        // event.service = service;
        // payload.event.service = service;

        if (!event.idServiceFk) event.idServiceFk = event?.service?.id ?? null;


        // console.log("mirta que es service en addEventV2", event?.service);

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
                        idServiceFk: event.service?.id ?? undefined,

                        serviceNameSnapshot: event.service?.name ?? null,
                        servicePriceSnapshot: event.service?.price ?? null,
                        serviceDiscountSnapshot: event.service?.discount ?? null,
                        serviceDurationSnapshot: event.service?.duration ?? null,

                        // calendar: { connect: { id: event.idCalendarFk } },
                        idWorkspaceFk: event.idWorkspaceFk,
                        idCompanyFk: event.idCompanyFk,

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
                        recurrenceRule: true,
                        eventParticipant: true,
                    },
                })
            );
        }

        if (createdEvent?.id) {
            // Crear el plan de notificación para el evento
            createNotification(createdEvent as any,
                {
                    actionSectionType: "add",
                });
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
                    // calendar: { connect: { id: event.idCalendarFk } },
                    idWorkspaceFk: event.idWorkspaceFk,
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

        // 3) Enriquecer con datos del servicio si existe idServiceFk
        let enrichedEvent = createdEvent;
        if (!skipMainEvent && (createdEvent as any)?.idServiceFk && event.idWorkspaceFk) {
            try {
                const services = await getServiceByIds([(createdEvent as any).idServiceFk], event.idWorkspaceFk);
                const service = services.length > 0 ? services[0] : null;
                enrichedEvent = {
                    ...createdEvent,
                    service
                } as any;
            } catch (serviceError) {
                console.warn(`[addEventV2] No se pudo obtener el servicio ${(createdEvent as any).idServiceFk}:`, serviceError);
                // Continuamos sin el servicio, no es un error crítico
            }
        }

        // 4) Devolver el primer evento con sus relaciones enriquecidas
        return skipMainEvent ? undefined : enrichedEvent;
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

            // Obtener el evento actual antes de la actualización para comparar cambios
            const currentEvent = await prisma.event.findUnique({
                where: { id: event.id },
                select: {
                    eventStatusType: true,
                    startDate: true,
                    endDate: true
                }
            });

            if (!currentEvent) {
                throw new Error("Evento no encontrado");
            }

            let service: ServiceBrief | ServiceBrief[] = await getServiceByUserIds
                ([event.idServiceFk], event.idWorkspaceFk);
            service = service.length > 0 ? service[0] : null;

            event.service = service as any;

            if (!event.idServiceFk) event.idServiceFk = event?.service?.id ?? null;


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
                            include: { recurrenceRule: true, eventParticipant: true },
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
                            include: { recurrenceRule: true, eventParticipant: true },
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
                        include: { recurrenceRule: true, eventParticipant: true },
                    });
                }

                // 1.c) Sin recurrencia: solo actualizo el evento
                return tx.event.update({
                    where: { id: event.id },
                    data: {
                        ...toPrismaEventUpdate(event),
                        ...buildNestedUpdates(event, eventParticipant, eventParticipantDelete),
                    },
                    include: { recurrenceRule: true, eventParticipant: true },
                });
            });


            console.log(CONSOLE_COLOR.FgCyan, `[EventV2Service][updateEventV2] ${JSON.stringify(updated)}`, CONSOLE_COLOR.Reset);

            /**
             * NOTIFICACIONES\
             * 1) Decidir si se notifica o no según cambios relevantes
             * 2) Si se notifica, decidir acción (aceptación, cancelación, no-show, actualización)
             * 3) Disparar la notificación
             */
            if (updated?.id) {
                const prev = currentEvent;
                // 1) Resolver acción según transición de estado
                const resolveAction = (
                    oldS: EventStatusType,
                    newS: EventStatusType): ActionSectionType => {
                    // cancelaciones siempre => "cancel"
                    if (newS === "CANCELLED" || newS === "CANCELLED_BY_CLIENT" || newS === "CANCELLED_BY_CLIENT_REMOVED") {
                        return "cancel";
                    }
                    // no-show explícito
                    if (newS === "NO_SHOW") return "markNoShow";

                    // transición típica de solicitud → aceptada
                    if (oldS === "PENDING" && newS === "ACCEPTED") return "acceptRequest";

                    // por defecto, actualización normal
                    return "update";
                };

                // 2) Detectar cambios relevantes
                const startOldMs = prev?.startDate ? new Date(prev.startDate).getTime() : null;
                const endOldMs = prev?.endDate ? new Date(prev.endDate).getTime() : null;
                const startNewMs = new Date(updated.startDate).getTime();
                const endNewMs = new Date(updated.endDate).getTime();

                const durationOld = (endOldMs !== null && startOldMs !== null) ? (endOldMs - startOldMs) : null;
                const durationNew = endNewMs - startNewMs;

                const timeChanged =
                    (startOldMs !== null && startOldMs !== startNewMs) ||
                    (durationOld !== null && durationOld !== durationNew);

                const statusChanged = prev?.eventStatusType !== updated.eventStatusType;

                const stateChanged = timeChanged || statusChanged;

                // 3) Notificar solo si cambió algo relevante
                if (stateChanged) {
                    const action = resolveAction(prev?.eventStatusType as EventStatusType | undefined, updated.eventStatusType as EventStatusType);
                    createNotification(updated, { actionSectionType: action });
                }
            }

            // 2) Enriquecer con datos del servicio si existe idServiceFk
            let enrichedEvent = updated;
            if (updated && !skipMainEvent && (updated as any).idServiceFk && event.idWorkspaceFk) {
                try {
                    const services = await getServiceByIds([(updated as any).idServiceFk], event.idWorkspaceFk);
                    const service = services.length > 0 ? services[0] : null;
                    enrichedEvent = {
                        ...updated,
                        service
                    } as any;
                } catch (serviceError) {
                    console.warn(`[updateEventV2] No se pudo obtener el servicio ${(updated as any).idServiceFk}:`, serviceError);
                    // Continuamos sin el servicio, no es un error crítico
                }
            }

            // 3) Disparo el job de Rabbit solo si no salté el main y hay regla nueva/actualizada
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

                payload.event.service = enrichedEvent?.service;

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

            // 4) Si skipMainEvent => devuelvo undefined, si no => devolución normal enriquecida
            return skipMainEvent ? { id: event.id } : enrichedEvent!;
        } catch (err: any) {
            throw new CustomError('EventV2Service.updateEventV2', err);
        }
    }


    // async updateEventV2(payload: EventForBackend) {
    //     try {
    //         const {
    //             skipMainEvent,
    //             event,
    //             recurrenceRule,
    //             recurrenceRuleUpdate,
    //             eventParticipant,
    //             eventParticipantDelete,
    //         } = payload;

    //         if (!event.id) {
    //             throw new Error("Para actualizar necesitas el id del evento");
    //         }

    //         // Determino el alcance de la actualización de la regla
    //         const scope = recurrenceRuleUpdate
    //             ? recurrenceRuleUpdate.scope
    //             : (recurrenceRule && !recurrenceRule.id ? 'NEW' : null);

    //         // 1) Ejecutar toda la lógica en una transacción
    //         const updated = await prisma.$transaction(async tx => {
    //             // 1.a) Si hay una actualización de regla existente
    //             if (recurrenceRuleUpdate) {
    //                 const strat = RecurrenceStrategyFactory.get(scope ?? 'NEW');

    //                 // THIS => modifico solo la instancia puntual
    //                 if (scope === 'THIS') {
    //                     await strat.handleImmediate(payload, tx as PrismaClient);
    //                     return tx.event.findUnique({
    //                         where: { id: event.id },
    //                         include: { recurrenceRule: true, eventParticipant: true, service: true },
    //                     });
    //                 }
    //                 // FUTURE / ALL => genero una regla nueva
    //                 const newRuleId = await strat.handleImmediate(payload, tx as PrismaClient);

    //                 if (skipMainEvent) {
    //                     // elimino el evento principal
    //                     await tx.event.delete({ where: { id: event.id } });
    //                     // devuelvo un objeto mínimo (no se usará porque skipMainEvent => retornamos undefined al final)
    //                     return {
    //                         id: event.id,
    //                         recurrenceRule: { id: newRuleId }
    //                     } as any;
    //                 } else {

    //                     // actualizo el evento principal enlazando la nueva regla
    //                     return tx.event.update({
    //                         where: { id: event.id },
    //                         data: {
    //                             ...toPrismaEventUpdate(event),
    //                             recurrenceRule: { connect: { id: newRuleId } },
    //                             ...buildNestedUpdates(event, eventParticipant, eventParticipantDelete),
    //                         },
    //                         include: { recurrenceRule: true, eventParticipant: true, service: true },
    //                     });
    //                 }
    //             }

    //             // 1.b) Primera vez que añado recurrencia (NEW)
    //             if (recurrenceRule && !recurrenceRule.id) {
    //                 const newStrat = RecurrenceStrategyFactory.get('NEW') as NewStrategy;
    //                 const newRuleId = await newStrat.handleImmediate(payload, tx as PrismaClient);

    //                 await tx.event.update({
    //                     where: { id: event.id },
    //                     data: {
    //                         ...toPrismaEventUpdate(event),
    //                         recurrenceRule: { connect: { id: newRuleId } },
    //                         ...buildNestedUpdates(event, eventParticipant, eventParticipantDelete),
    //                     },
    //                 });

    //                 return tx.event.findUnique({
    //                     where: { id: event.id },
    //                     include: { recurrenceRule: true, eventParticipant: true, service: true },
    //                 });
    //             }

    //             // 1.c) Sin recurrencia: solo actualizo el evento
    //             return tx.event.update({
    //                 where: { id: event.id },
    //                 data: {
    //                     ...toPrismaEventUpdate(event),
    //                     ...buildNestedUpdates(event, eventParticipant, eventParticipantDelete),
    //                 },
    //                 include: { recurrenceRule: true, eventParticipant: true, service: true },
    //             });
    //         });

    //         // 2) Disparo el job de Rabbit solo si no salté el main y hay regla nueva/actualizada
    //         if (
    //             scope &&
    //             scope !== 'THIS'
    //         ) {
    //             let opType: 'CREATE_SERIES' | 'SPLIT_THIS' | 'SPLIT_FUTURE' | 'SPLIT_ALL';
    //             if (scope === 'NEW') opType = 'CREATE_SERIES';
    //             else if (scope === 'FUTURE') opType = 'SPLIT_FUTURE';
    //             else if (scope === 'ALL') opType = 'SPLIT_ALL';
    //             else opType = 'SPLIT_THIS';

    //             const count = Math.min(MAX_RECURRENCE_COUNT, DEFAULT_RECURRENCE_COUNT);
    //             const countFixed = Number.isFinite(count) ? count : 15;

    //             console.log(
    //                 `${moment().format('HH:mm:ss')} [API] ▶ Enviando job ${scope} para event ${event.id}`
    //             );
    //             await RabbitPUBSUB.sendRecurrenceWorkerJob(
    //                 opType,
    //                 payload,
    //                 countFixed,
    //                 updated.recurrenceRule.id
    //             );
    //         }

    //         // 3) Si skipMainEvent => devuelvo undefined, si no => devolución normal
    //         return skipMainEvent ? { id: event.id } : updated!;
    //     } catch (err: any) {
    //         throw new CustomError('EventV2Service.updateEventV2', err);
    //     }
    // }

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


                    // TODO: El servicio debe de venir del ms de booking page
                    // service: {
                    //     select: {
                    //         id: true,
                    //         name: true,
                    //         description: true,
                    //     }
                    // },

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
                    idServiceFk: true,
                    description: true,

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
                    eventParticipant,
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
                    eventParticipant: eventParticipant ?? [],
                    recurrenceRule: recurrenceRule as any ?? undefined,
                    // service: service ?? undefined,
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
                    idCompanyFk: true,
                    idWorkspaceFk: true,
                    // idClientFk: true,
                    // idClientWorkspaceFk: true,
                    idUserPlatformFk: true,
                    idServiceFk: true,
                    eventPurposeType: true,
                    eventSourceType: true,
                    eventStatusType: true,
                    allDay: true,


                    // service: {
                    //     select: {
                    //         id: true,
                    //         name: true,
                    //         description: true,
                    //     }
                    // },

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



    // public async publicGetAvailableDays_OLD(
    //     input: GetTimeSlotsInputSpecial,
    //     deps: AvailabilityDepsSpecial
    // ): Promise<{ days: DayFlag[] }> {
    //     try {
    //         const {
    //             idCompany,
    //             idWorkspace,
    //             timeZoneClient,
    //             range: { start, end },
    //             attendees,
    //             excludeEventId,
    //             idClient, // opcional
    //         } = input;

    //         const {
    //             bookingConfig,
    //             businessHoursService,
    //             workerHoursService,
    //             temporaryHoursService,
    //         } = deps;

    //         const date = new Date();
    //         console.log("[publicGetAvailableDays_SPECIAL] called", {
    //             date,
    //             attendees: attendees.map(a => a.serviceId),
    //         });

    //         const BOOKING_PAGE_CONFIG: OnlineBookingConfig = bookingConfig;

    //         // 🆕 bookingWindow
    //         const { maxAdvanceDays = 60, minLeadTimeMin = 60 } =
    //             BOOKING_PAGE_CONFIG.bookingWindow ?? {};

    //         const alignMode: "clock" | "service" =
    //             BOOKING_PAGE_CONFIG.slot?.alignMode === "service" ? "service" : "clock";
    //         const intervalMinutes =
    //             alignMode === "service"
    //                 ? attendees?.reduce((acc, a) => acc + (a.durationMin ?? 0), 0)
    //                 : BOOKING_PAGE_CONFIG?.slot?.stepMinutes;

    //         const professionalAllowed =
    //             BOOKING_PAGE_CONFIG?.resources?.ids?.map((r) =>
    //                 Array.isArray(r) ? r?.[0] : r
    //             ) ?? [];

    //         if (!idCompany || !idWorkspace) throw new Error("Faltan idCompany o idWorkspace");
    //         if (!start || !end) throw new Error("Faltan fechas de rango (start/end)");
    //         if (
    //             typeof intervalMinutes !== "number" ||
    //             isNaN(intervalMinutes) ||
    //             intervalMinutes <= 0
    //         ) {
    //             throw new Error("El intervalo de minutos debe ser un número positivo");
    //         }
    //         if (!Array.isArray(attendees) || attendees.length === 0) return { days: [] };
    //         if (professionalAllowed.length === 0) return { days: [] };

    //         // Paso base de enumeración de inicios
    //         const STEP_MINUTES = intervalMinutes;

    //         // Helpers locales
    //         type Range = { start: moment.Moment; end: moment.Moment };
    //         const TZ = timeZoneClient; // 🆕 si prefieres el TZ del negocio, cámbialo aquí
    //         const toLocal = (d: Date | string) =>
    //             moment(d).tz(TZ).seconds(0).milliseconds(0);

    //         const mergeRanges = (rs: Range[]) => {
    //             const arr = rs
    //                 .map((r) => ({ start: r.start.clone(), end: r.end.clone() }))
    //                 .filter((r) => r.start.isBefore(r.end))
    //                 .sort((a, b) => a.start.valueOf() - b.start.valueOf());
    //             if (!arr.length) return arr;
    //             const out: Range[] = [];
    //             let cur = arr[0];
    //             for (let i = 1; i < arr.length; i++) {
    //                 const r = arr[i];
    //                 if (r.start.isSameOrBefore(cur.end)) {
    //                     if (r.end.isAfter(cur.end)) cur.end = r.end.clone();
    //                 } else {
    //                     out.push(cur);
    //                     cur = r;
    //                 }
    //             }
    //             out.push(cur);
    //             return out;
    //         };

    //         // resta [busy] a [shift] -> free[]
    //         const subtractBusy = (shift: Range, busy: Range[]) => {
    //             const merged = mergeRanges(busy);
    //             let cursor = shift.start.clone();
    //             const free: Range[] = [];
    //             for (const b of merged) {
    //                 if (b.end.isSameOrBefore(cursor) || b.start.isSameOrAfter(shift.end)) continue;
    //                 if (b.start.isAfter(cursor)) {
    //                     free.push({ start: cursor.clone(), end: moment.min(b.start, shift.end) });
    //                 }
    //                 cursor = moment.max(cursor, b.end);
    //                 if (!cursor.isBefore(shift.end)) break;
    //             }
    //             if (cursor.isBefore(shift.end)) free.push({ start: cursor, end: shift.end.clone() });
    //             return free.filter((r) => r.start.isBefore(r.end));
    //         };

    //         // cuenta inicios posibles dentro de ventanas, usando ceil relativo al comienzo de la ventana
    //         const countStartsInWindows = (
    //             wins: Range[],
    //             durMin: number,
    //             stepMin: number,
    //             clampFrom?: moment.Moment
    //         ) => {
    //             let total = 0;
    //             for (const w of wins) {
    //                 const wStart = clampFrom ? moment.max(w.start, clampFrom) : w.start;
    //                 const latestStart = w.end.clone().subtract(durMin, "minutes");
    //                 if (wStart.isAfter(latestStart)) continue;

    //                 // ceil relativo a w.start
    //                 const offsetMin = Math.max(
    //                     0,
    //                     Math.floor((wStart.valueOf() - w.start.valueOf()) / 60000)
    //                 );
    //                 const rem = offsetMin % stepMin;
    //                 const cur = wStart
    //                     .clone()
    //                     .add(rem === 0 ? 0 : stepMin - rem, "minutes")
    //                     .seconds(0)
    //                     .milliseconds(0);

    //                 const spanMin = Math.max(
    //                     0,
    //                     Math.floor((latestStart.valueOf() - cur.valueOf()) / 60000)
    //                 );
    //                 const cnt = 1 + Math.floor(spanMin / stepMin);
    //                 if (cnt > 0) total += cnt;
    //             }
    //             return total;
    //         };

    //         // 1) Elegibles por servicio
    //         const withinAllowed = (ids: string[]) =>
    //             ids.filter((id) => professionalAllowed.includes(id));

    //         const userIdsByService = new Map<string, string[]>();
    //         for (const a of attendees) {
    //             if (a.staffId) {
    //                 const elig = professionalAllowed.includes(a.staffId) ? [a.staffId] : [];
    //                 userIdsByService.set(a.serviceId, elig);
    //             } else {
    //                 const users = await getUsersWhoCanPerformService(
    //                     idWorkspace,
    //                     a.serviceId,
    //                     a.categoryId
    //                 );
    //                 userIdsByService.set(a.serviceId, withinAllowed(users));
    //             }
    //         }
    //         const allUserIds = Array.from(
    //             new Set(Array.from(userIdsByService.values()).flat())
    //         );
    //         if (!allUserIds.length) {
    //             const days = enumerateDays(start, end).map((d) => ({
    //                 date: d,
    //                 hasSlots: false,
    //                 capacity: 0,
    //             }));
    //             return { days };
    //         }

    //         // 2) Calendar y reglas
    //         // const calendar = await prisma.calendar.findFirst({
    //         //     where: {
    //         //         idCompanyFk: idCompany,
    //         //         idWorkspaceFk: idWorkspace,
    //         //         deletedDate: null,
    //         //     },
    //         //     select: { id: true },
    //         // });

    //         const businessHours = await businessHoursService.getBusinessHoursFromRedis(
    //             idCompany,
    //             idWorkspace
    //         );
    //         const workerHoursMap = await workerHoursService.getWorkerHoursFromRedis(
    //             allUserIds,
    //             idWorkspace
    //         );
    //         const temporaryHoursMap =
    //             await temporaryHoursService.getTemporaryHoursFromRedis(
    //                 allUserIds,
    //                 idWorkspace,
    //                 { start, end }
    //             );
    //         const events = await getEventsOverlappingRange(
    //             allUserIds,
    //             start,
    //             end,
    //             excludeEventId
    //         );

    //         // 3) Capacidad por servicio (para detectar grupales)
    //         // const serviceCaps = await prisma.service.findMany({
    //         //     where: { id: { in: attendees.map((a) => a.serviceId) } },
    //         //     select: { id: true, maxParticipants: true },
    //         // });
    //         // const capByService = new Map(
    //         //     serviceCaps.map((s) => [s.id, Math.max(1, s.maxParticipants ?? 1)])
    //         // );

    //         // Obtenemos el servicio de su microservicio
    //         const serviceCaps: ServiceBrief[] = await getServiceByUserIds(allUserIds, idWorkspace);
    //         const capByService = new Map<string, number>();
    //         for (const sc of serviceCaps) {
    //             if (!capByService.has(sc.id)) {
    //                 capByService.set(sc.id, Math.max(1, sc.maxParticipants ?? 1));
    //             }
    //         }

    //         // Agrupa eventos por user para acelerar
    //         const eventsByUser = new Map<
    //             string,
    //             Array<{ startDate: Date; endDate: Date }>
    //         >();
    //         for (const ev of events) {
    //             const uid = (ev as any).idUserPlatformFk as string | null;
    //             if (!uid) continue;
    //             const arr = eventsByUser.get(uid) || [];
    //             arr.push({ startDate: ev.startDate, endDate: ev.endDate });
    //             eventsByUser.set(uid, arr);
    //         }

    //         // Helper para obtener turnos de un user en un día
    //         const getShiftsFor = (uid: string, dateISO: string): Range[] => {
    //             const weekDay = moment
    //                 .tz(`${dateISO}T00:00:00`, "YYYY-MM-DDTHH:mm:ss", TZ)
    //                 .format("dddd")
    //                 .toUpperCase() as any;

    //             const workerDay = (workerHoursMap as any)?.[uid]?.[weekDay];
    //             const tempDay = (temporaryHoursMap as any)?.[uid]?.[dateISO];

    //             let slots: string[][] = [];
    //             if (tempDay === null) slots = [];
    //             else if (Array.isArray(tempDay) && tempDay.length) slots = tempDay;
    //             else if (workerDay === null) slots = [];
    //             else if (Array.isArray(workerDay) && workerDay.length) slots = workerDay;
    //             else {
    //                 const biz = (businessHours as any)?.[weekDay];
    //                 slots = biz === null ? [] : Array.isArray(biz) ? biz : [];
    //             }

    //             return (slots || []).map(([s, e]) => ({
    //                 start: moment.tz(`${dateISO}T${s}`, "YYYY-MM-DDTHH:mm:ss", TZ),
    //                 end: moment.tz(`${dateISO}T${e}`, "YYYY-MM-DDTHH:mm:ss", TZ),
    //             }));
    //         };

    //         // 🆕 Ventana absoluta permitida (TZ = TZ)
    //         const nowRef = moment.tz(TZ);
    //         const earliestAllowed = nowRef
    //             .clone()
    //             .add(minLeadTimeMin, "minutes")
    //             .seconds(0)
    //             .milliseconds(0);
    //         const latestAllowedEnd = nowRef.clone().add(maxAdvanceDays, "days").endOf("day");

    //         const days: DayFlag[] = [];

    //         for (const dateISO of enumerateDays(start, end)) {
    //             const dayStart = moment.tz(
    //                 `${dateISO}T00:00:00`,
    //                 "YYYY-MM-DDTHH:mm:ss",
    //                 TZ
    //             );
    //             const dayEnd = dayStart.clone().endOf("day");
    //             const dayStartUTC = dayStart.clone().utc().toDate();
    //             const dayEndUTC = dayEnd.clone().utc().toDate();

    //             // 🆕 Cortes rápidos por día completo
    //             if (dayEnd.isBefore(earliestAllowed)) {
    //                 days.push({ date: dateISO, hasSlots: false, capacity: 0 });
    //                 continue;
    //             }
    //             if (dayStart.isAfter(latestAllowedEnd)) {
    //                 days.push({ date: dateISO, hasSlots: false, capacity: 0 });
    //                 continue;
    //             }

    //             // 🆕 Si es el día del lead, clamp desde earliestAllowed
    //             const isLeadDay = dayStart.isSame(earliestAllowed, "day");
    //             const clampFrom = isLeadDay ? earliestAllowed : undefined;

    //             // ---- Caso: 1 servicio
    //             if (attendees.length === 1) {
    //                 const a = attendees[0];
    //                 const elig = userIdsByService.get(a.serviceId) ?? [];
    //                 if (!elig.length) {
    //                     days.push({ date: dateISO, hasSlots: false, capacity: 0 });
    //                     continue;
    //                 }

    //                 const svcCap = capByService.get(a.serviceId) ?? 1;
    //                 const isGroup = svcCap > 1;

    //                 // Denominador: inicios posibles por turnos (sin busy), sumados en todos los elegibles
    //                 let denomStarts = 0;
    //                 for (const uid of elig) {
    //                     const shifts = getShiftsFor(uid, dateISO);
    //                     const mergedShifts = mergeRanges(shifts);
    //                     denomStarts += countStartsInWindows(
    //                         mergedShifts,
    //                         a.durationMin,
    //                         STEP_MINUTES,
    //                         clampFrom // 🆕 clamp por lead
    //                     );
    //                 }
    //                 const denomSeats = denomStarts * (isGroup ? svcCap : 1);

    //                 if (denomSeats <= 0) {
    //                     days.push({ date: dateISO, hasSlots: false, capacity: 0 });
    //                     continue;
    //                 }

    //                 // Numerador:
    //                 // (A) plazas libres en clases existentes de este servicio (solo pros elegibles)
    //                 let seatsFromExisting = 0;
    //                 if (isGroup) {
    //                     const groupEvents = await prisma.event.findMany({
    //                         where: {
    //                             // idCalendarFk: calendar.id,
    //                             idWorkspaceFk: idWorkspace,
    //                             idServiceFk: a.serviceId,
    //                             idUserPlatformFk: { in: elig },
    //                             startDate: { lt: dayEndUTC },
    //                             endDate: { gt: dayStartUTC },
    //                             ...(excludeEventId ? { id: { not: excludeEventId } } : {}),
    //                             deletedDate: null,
    //                         },
    //                         select: {
    //                             id: true,
    //                             startDate: true, // 🆕 necesitaremos el start para filtrar lead
    //                             eventParticipant: {
    //                                 where: { deletedDate: null },
    //                                 select: { idClientFk: true, idClientWorkspaceFk: true },
    //                             },
    //                         },
    //                     });

    //                     for (const ev of groupEvents) {
    //                         // 🆕 si es día de lead, ignora clases que empiezan antes del earliestAllowed
    //                         if (isLeadDay) {
    //                             const evStartLocal = toLocal(ev.startDate);
    //                             if (evStartLocal.isBefore(earliestAllowed)) continue;
    //                         }

    //                         const booked = ev.eventParticipant.length;
    //                         const alreadyIn = !!(
    //                             idClient &&
    //                             ev.eventParticipant.some(
    //                                 (p) => p.idClientFk === idClient || p.idClientWorkspaceFk === idClient
    //                             )
    //                         );
    //                         const left = Math.max(0, svcCap - booked);
    //                         seatsFromExisting += alreadyIn ? 0 : left;
    //                     }
    //                 }

    //                 // (B) plazas potenciales por nuevas clases (libres tras busy)
    //                 let startsCreatable = 0;
    //                 for (const uid of elig) {
    //                     const shifts = getShiftsFor(uid, dateISO);

    //                     const busy: Range[] = (eventsByUser.get(uid) || [])
    //                         .filter((ev) => ev.startDate < dayEndUTC && ev.endDate > dayStartUTC)
    //                         .map((ev) => ({ start: toLocal(ev.startDate), end: toLocal(ev.endDate) }));

    //                     const freeWins: Range[] = [];
    //                     for (const sh of shifts) {
    //                         const shStart = clampFrom ? moment.max(sh.start, clampFrom) : sh.start; // 🆕 clamp lead
    //                         if (!shStart.isBefore(sh.end)) continue;
    //                         freeWins.push(...subtractBusy({ start: shStart, end: sh.end }, busy));
    //                     }
    //                     const mergedFree = mergeRanges(freeWins);

    //                     startsCreatable += countStartsInWindows(
    //                         mergedFree,
    //                         a.durationMin,
    //                         STEP_MINUTES,
    //                         clampFrom // 🆕 clamp lead
    //                     );
    //                 }
    //                 const seatsFromNew = startsCreatable * (isGroup ? svcCap : 1);

    //                 const numeratorSeats = seatsFromExisting + seatsFromNew;
    //                 const ratio = Math.max(0, Math.min(1, numeratorSeats / denomSeats));

    //                 days.push({
    //                     date: dateISO,
    //                     hasSlots: ratio > 0,
    //                     capacity: Number(ratio.toFixed(2)),
    //                 });
    //                 continue;
    //             }

    //             // ---- Caso: >1 servicio (sin grupos mezclados)
    //             let anyGroup = false;
    //             for (const a of attendees) {
    //                 if ((capByService.get(a.serviceId) ?? 1) > 1) {
    //                     anyGroup = true;
    //                     break;
    //                 }
    //             }
    //             if (anyGroup) {
    //                 days.push({ date: dateISO, hasSlots: false, capacity: 0 });
    //                 continue;
    //             }

    //             // Para cada servicio individual: ratio = (#starts libres) / (#starts posibles)
    //             const ratios: number[] = [];
    //             for (const a of attendees) {
    //                 const elig = userIdsByService.get(a.serviceId) ?? [];
    //                 if (!elig.length) {
    //                     ratios.push(0);
    //                     continue;
    //                 }

    //                 // denom
    //                 let denomStarts = 0;
    //                 for (const uid of elig) {
    //                     const shifts = getShiftsFor(uid, dateISO);
    //                     const mergedShifts = mergeRanges(shifts);
    //                     denomStarts += countStartsInWindows(
    //                         mergedShifts,
    //                         a.durationMin,
    //                         STEP_MINUTES,
    //                         clampFrom // 🆕 clamp lead
    //                     );
    //                 }
    //                 if (denomStarts <= 0) {
    //                     ratios.push(0);
    //                     continue;
    //                 }

    //                 // numerador (libres tras busy)
    //                 let freeStarts = 0;
    //                 for (const uid of elig) {
    //                     const shifts = getShiftsFor(uid, dateISO);
    //                     const busy: Range[] = (eventsByUser.get(uid) || [])
    //                         .filter((ev) => ev.startDate < dayEndUTC && ev.endDate > dayStartUTC)
    //                         .map((ev) => ({ start: toLocal(ev.startDate), end: toLocal(ev.endDate) }));

    //                     const freeWins: Range[] = [];
    //                     for (const sh of shifts) {
    //                         const shStart = clampFrom ? moment.max(sh.start, clampFrom) : sh.start; // 🆕 clamp lead
    //                         if (!shStart.isBefore(sh.end)) continue;
    //                         freeWins.push(...subtractBusy({ start: shStart, end: sh.end }, busy));
    //                     }
    //                     const mergedFree = mergeRanges(freeWins);
    //                     freeStarts += countStartsInWindows(
    //                         mergedFree,
    //                         a.durationMin,
    //                         STEP_MINUTES,
    //                         clampFrom // 🆕 clamp lead
    //                     );
    //                 }
    //                 ratios.push(Math.max(0, Math.min(1, freeStarts / denomStarts)));
    //             }

    //             const minRatio = ratios.length ? Math.min(...ratios) : 0;
    //             days.push({
    //                 date: dateISO,
    //                 hasSlots: minRatio > 0,
    //                 capacity: Number(minRatio.toFixed(2)),
    //             });
    //         }

    //         return { days };
    //     } catch (error: any) {
    //         throw new CustomError("EventService.getAvailableDays", error);
    //     }
    // }



    public async publicGetAvailableDays(
        input: GetTimeSlotsInputSpecial,
        deps: AvailabilityDepsSpecial
    ): Promise<{ days: DayFlag[] }> {
        try {
            const {
                idCompany,
                idWorkspace,
                timeZoneWorkspace,
                range,
                attendees,
                excludeEventId,
                idClient,
            } = input;

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
                BOOKING_PAGE_CONFIG?.resources?.ids
                    ?.map((r) => (Array.isArray(r) ? r?.[0] : r)) ?? [];

            // Validaciones rápidas
            if (!idCompany || !idWorkspace) throw new Error("Faltan idCompany / idWorkspace");
            if (!timeZoneWorkspace) throw new Error("Falta timeZoneWorkspace");
            if (!start || !end) throw new Error("Faltan fechas de rango (start/end)");

            const dayList = enumerateDays(start, end);

            if (!Array.isArray(attendees) || attendees.length === 0) {
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

            const STEP_MINUTES = intervalMinutes;
            const TZ_WS = timeZoneWorkspace;

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

                    const origin = w.start;
                    const diffMin = Math.max(
                        0,
                        Math.floor((start.valueOf() - origin.valueOf()) / 60000)
                    );
                    const rem = diffMin % stepMin;
                    const first = start
                        .clone()
                        .add(rem === 0 ? 0 : stepMin - rem, "minutes")
                        .seconds(0)
                        .milliseconds(0);

                    if (first.isAfter(latestStart)) continue;

                    const spanMin = Math.floor(
                        (latestStart.valueOf() - first.valueOf()) / 60000
                    );
                    const cnt = 1 + Math.floor(spanMin / stepMin);
                    if (cnt > 0) total += cnt;
                }

                return total;
            };

            // 1) Snapshot de servicios (1 llamada al ms)
            const wantedServiceIds = Array.from(
                new Set(attendees.map((a) => a.serviceId).filter(Boolean))
            ) as string[];
         
            const services =
                wantedServiceIds.length > 0
                    ? await getServiceByIds(wantedServiceIds, idWorkspace)
                    : [];

            const svcById: Record<string, { durationMin: number; maxParticipants: number }> = {};
            for (const s of services) {
                const duration = typeof s.duration === "number" ? s.duration : 60;
                const maxP = Math.max(1, typeof s.maxParticipants === "number" ? s.maxParticipants : 1);
                svcById[s.id] = {
                    durationMin: duration,
                    maxParticipants: maxP,
                };
            }

            const getSvcDur = (svcId: string, fallback: number) =>
                svcById[svcId]?.durationMin ?? fallback;

            const getSvcCap = (svcId: string) =>
                Math.max(1, svcById[svcId]?.maxParticipants ?? 1);

            // 2) Usuarios elegibles por servicio (paralelo)
            const userIdsByServiceEntries = await Promise.all(
                attendees.map(async (a) => {
                    const svcId = a.serviceId;
                    if (!svcId) return [null, []] as const;

                    if (a.staffId) {
                        const elig = professionalAllowed.includes(a.staffId)
                            ? [a.staffId]
                            : [];
                        return [svcId, elig] as const;
                    }

                    const users = await getUsersWhoCanPerformService_SPECIAL(
                        idWorkspace,
                        svcId,
                        a.categoryId ?? null,
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

            const allUserIds = Array.from(
                new Set(Array.from(userIdsByService.values()).flat())
            );

            if (!allUserIds.length) {
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
            const [businessHours, workerHoursMap, temporaryHoursMap, events] =
                await Promise.all([
                    businessHoursService.getBusinessHoursFromRedis(idCompany, idWorkspace),
                    workerHoursService.getWorkerHoursFromRedis(allUserIds, idWorkspace),
                    temporaryHoursService.getTemporaryHoursFromRedis(allUserIds, idWorkspace, {
                        start,
                        end,
                    }),
                    getEventsOverlappingRange_SPECIAL(idWorkspace, allUserIds, start, end, excludeEventId),
                ]);

            // Eventos por usuario
            const eventsByUser = new Map<
                string,
                Array<{ startDate: Date; endDate: Date }>
            >();
            for (const ev of events) {
                const uid = ev.idUserPlatformFk;
                if (!uid) continue;
                let arr = eventsByUser.get(uid);
                if (!arr) {
                    arr = [];
                    eventsByUser.set(uid, arr);
                }
                arr.push({ startDate: ev.startDate, endDate: ev.endDate });
            }

            // 4) bookingWindow absoluto (TZ negocio)
            const nowWS = moment.tz(TZ_WS);
            const earliestAllowed = nowWS
                .clone()
                .add(minLeadTimeMin, "minutes")
                .seconds(0)
                .milliseconds(0);
            const latestAllowedEnd = nowWS
                .clone()
                .add(maxAdvanceDays, "days")
                .endOf("day");

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
                singleSvcId && userIdsByService.has(singleSvcId)
                    ? userIdsByService.get(singleSvcId) || []
                    : [];

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
                const startRange = moment
                    .tz(`${start}T00:00:00`, "YYYY-MM-DDTHH:mm:ss", TZ_WS)
                    .toDate();
                const endRange = moment
                    .tz(`${end}T23:59:59`, "YYYY-MM-DDTHH:mm:ss", TZ_WS)
                    .toDate();

                const rows = await prisma.event.findMany({
                    where: {
                        idWorkspaceFk: idWorkspace,
                        idServiceFk: singleSvcId,
                        idUserPlatformFk: { in: singleElig },
                        deletedDate: null,
                        startDate: { lt: endRange },
                        endDate: { gt: startRange },
                        ...(excludeEventId ? { id: { not: excludeEventId } } : {}),
                    },
                    select: {
                        idUserPlatformFk: true,
                        startDate: true,
                        endDate: true,
                        eventParticipant: {
                            where: { deletedDate: null },
                            select: {
                                idClientFk: true,
                                idClientWorkspaceFk: true,
                            },
                        },
                    },
                });

                groupEvents = rows.map((r) => ({
                    idUserPlatformFk: r.idUserPlatformFk,
                    startDate: r.startDate,
                    endDate: r.endDate,
                    participantsCount: r.eventParticipant.length,
                    participantClientIds: r.eventParticipant
                        .map((p) => p.idClientFk)
                        .filter(Boolean) as string[],
                    participantClientWorkspaceIds: r.eventParticipant
                        .map((p) => p.idClientWorkspaceFk)
                        .filter(Boolean) as string[],
                }));
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

            // Helper: turnos por user/día (business/worker/tmp)
            const getShiftsFor = (uid: string, dateISO: string): Range[] => {
                const dayStart = moment.tz(
                    `${dateISO}T00:00:00`,
                    "YYYY-MM-DDTHH:mm:ss",
                    TZ_WS
                );
                const weekDay = dayStart.format("dddd").toUpperCase() as Weekday;

                const workerDay = (workerHoursMap as any)?.[uid]?.[weekDay];
                const tempDay = (temporaryHoursMap as any)?.[uid]?.[dateISO];

                let slots: string[][] = [];
                if (tempDay === null) slots = [];
                else if (Array.isArray(tempDay) && tempDay.length) slots = tempDay;
                else if (workerDay === null) slots = [];
                else if (Array.isArray(workerDay) && workerDay.length) slots = workerDay;
                else {
                    const biz = (businessHours as any)?.[weekDay];
                    slots = biz === null ? [] : Array.isArray(biz) ? biz : [];
                }

                return (slots || []).map(([s, e]) => ({
                    start: moment.tz(
                        `${dateISO}T${s}`,
                        "YYYY-MM-DDTHH:mm:ss",
                        TZ_WS
                    ),
                    end: moment.tz(
                        `${dateISO}T${e}`,
                        "YYYY-MM-DDTHH:mm:ss",
                        TZ_WS
                    ),
                }));
            };

            // LOOP DÍAS ------------------------------------------

            const days: DayFlag[] = [];

            for (const dateISO of dayList) {
                const dayStart = moment.tz(
                    `${dateISO}T00:00:00`,
                    "YYYY-MM-DDTHH:mm:ss",
                    TZ_WS
                );
                const dayEnd = dayStart.clone().endOf("day");

                // Fuera de ventana → dayoff
                if (!withinBookingWindowDay(dayStart, dayEnd)) {
                    days.push({
                        date: dateISO,
                        hasSlots: false,
                        capacity: 0,
                        status: "dayoff",
                    });
                    continue;
                }

                const isLeadDay = dayStart.isSame(earliestAllowed, "day");
                const clampFrom = isLeadDay ? earliestAllowed : undefined;

                const dayStartUTC = dayStart.clone().utc().toDate();
                const dayEndUTC = dayEnd.clone().utc().toDate();

                // ---- SINGLE SERVICE
                if (isSingleService && singleSvcId && singleAttendee) {
                    const a = singleAttendee;
                    const elig = singleElig;
                    const durMin = getSvcDur(singleSvcId, a.durationMin);
                    const svcCap = singleSvcCap;
                    const isGroup = singleIsGroup;

                    if (!elig.length || durMin <= 0) {
                        days.push({
                            date: dateISO,
                            hasSlots: false,
                            capacity: 0,
                            status: "dayoff",
                        });
                        continue;
                    }

                    // Denominador teórico
                    let denomStarts = 0;
                    for (const uid of elig) {
                        const shifts = mergeRanges(getShiftsFor(uid, dateISO));
                        denomStarts += countStartsInWindows(
                            shifts,
                            durMin,
                            STEP_MINUTES,
                            clampFrom
                        );
                    }
                    const denomSeats = denomStarts * (isGroup ? svcCap : 1);

                    if (denomSeats <= 0) {
                        days.push({
                            date: dateISO,
                            hasSlots: false,
                            capacity: 0,
                            status: "dayoff",
                        });
                        continue;
                    }

                    // Numerador:
                    // (A) plazas libres en clases existentes (solo grupal)
                    let seatsFromExisting = 0;
                    if (isGroup && groupEventsByDay.has(dateISO)) {
                        for (const ev of groupEventsByDay.get(dateISO)!) {
                            const startLocal = moment(ev.startDate)
                                .tz(TZ_WS)
                                .seconds(0)
                                .milliseconds(0);
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

                    // (B) plazas potenciales en slots nuevos
                    let startsCreatable = 0;
                    for (const uid of elig) {
                        const shifts = getShiftsFor(uid, dateISO);
                        if (!shifts.length) continue;

                        const busy: Range[] = (eventsByUser.get(uid) || [])
                            .filter(
                                (ev) =>
                                    ev.startDate < dayEndUTC &&
                                    ev.endDate > dayStartUTC
                            )
                            .map((ev) => ({
                                start: moment(ev.startDate).tz(TZ_WS),
                                end: moment(ev.endDate).tz(TZ_WS),
                            }));

                        const freeWins: Range[] = [];
                        for (const sh of shifts) {
                            const shStart = clampFrom
                                ? moment.max(sh.start, clampFrom)
                                : sh.start;
                            if (!shStart.isBefore(sh.end)) continue;
                            freeWins.push(...subtractBusy({ start: shStart, end: sh.end }, busy));
                        }

                        const mergedFree = mergeRanges(freeWins);
                        startsCreatable += countStartsInWindows(
                            mergedFree,
                            durMin,
                            STEP_MINUTES,
                            clampFrom
                        );
                    }

                    const seatsFromNew = startsCreatable * (isGroup ? svcCap : 1);
                    const numeratorSeats = seatsFromExisting + seatsFromNew;

                    const ratioRaw = numeratorSeats / denomSeats;
                    const capacity = Math.max(
                        0,
                        Math.min(1, Number(ratioRaw.toFixed(2)))
                    );
                    const hasSlots = capacity > 0;
                    const status: DayAvailabilityStatus =
                        !hasSlots ? "completed" : "available";

                    days.push({
                        date: dateISO,
                        hasSlots,
                        capacity,
                        status,
                    });
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
                    // sin soporte combos grupales aquí
                    days.push({
                        date: dateISO,
                        hasSlots: false,
                        capacity: 0,
                        status: "dayoff",
                    });
                    continue;
                }

                const ratios: number[] = [];
                const denoms: number[] = [];

                for (const a of attendees) {
                    const svcId = a.serviceId;
                    const elig = userIdsByService.get(svcId) ?? [];
                    const durMin = getSvcDur(svcId, a.durationMin);

                    if (!elig.length || durMin <= 0) {
                        ratios.push(0);
                        denoms.push(0);
                        continue;
                    }

                    // Denominador servicio
                    let denomStarts = 0;
                    for (const uid of elig) {
                        const shifts = mergeRanges(getShiftsFor(uid, dateISO));
                        denomStarts += countStartsInWindows(
                            shifts,
                            durMin,
                            STEP_MINUTES,
                            clampFrom
                        );
                    }

                    if (denomStarts <= 0) {
                        ratios.push(0);
                        denoms.push(0);
                        continue;
                    }

                    // Numerador (libre tras busy)
                    let freeStarts = 0;
                    for (const uid of elig) {
                        const shifts = getShiftsFor(uid, dateISO);
                        if (!shifts.length) continue;

                        const busy: Range[] = (eventsByUser.get(uid) || [])
                            .filter(
                                (ev) =>
                                    ev.startDate < dayEndUTC &&
                                    ev.endDate > dayStartUTC
                            )
                            .map((ev) => ({
                                start: moment(ev.startDate).tz(TZ_WS),
                                end: moment(ev.endDate).tz(TZ_WS),
                            }));

                        const freeWins: Range[] = [];
                        for (const sh of shifts) {
                            const shStart = clampFrom
                                ? moment.max(sh.start, clampFrom)
                                : sh.start;
                            if (!shStart.isBefore(sh.end)) continue;
                            freeWins.push(...subtractBusy({ start: shStart, end: sh.end }, busy));
                        }

                        const mergedFree = mergeRanges(freeWins);
                        freeStarts += countStartsInWindows(
                            mergedFree,
                            durMin,
                            STEP_MINUTES,
                            clampFrom
                        );
                    }

                    const ratio = Math.max(0, Math.min(1, freeStarts / denomStarts));
                    ratios.push(ratio);
                    denoms.push(denomStarts);
                }

                const allDenomZero = denoms.every((d) => d <= 0);
                if (allDenomZero) {
                    days.push({
                        date: dateISO,
                        hasSlots: false,
                        capacity: 0,
                        status: "dayoff",
                    });
                    continue;
                }

                const minRatio =
                    ratios.length > 0
                        ? Math.max(
                            0,
                            Math.min(
                                1,
                                Number(Math.min(...ratios).toFixed(2))
                            )
                        )
                        : 0;

                const hasSlots = minRatio > 0;
                const status: DayAvailabilityStatus =
                    !hasSlots ? "completed" : "available";

                days.push({
                    date: dateISO,
                    hasSlots,
                    capacity: minRatio,
                    status,
                });
            }

            console.log("Available days:", days);

            return { days };
        } catch (error: any) {
            throw new CustomError("EventService.publicGetAvailableDays", error);
        }
    }



    // ⬇️ util: crea o une a un evento de grupo (capacidad = Service.maxParticipants)
    async createOrJoinGroupEvent(
        tx: Prisma.TransactionClient,
        params: {
            idCompany: string;
            idWorkspace: string;
            seg: { serviceId: string; userId: string; start: moment.Moment; end: moment.Moment };
            svc: {
                id: string;
                name?: string | null;
                price?: number | null;
                discount?: number | null;
                duration?: number | null;
                maxParticipants?: number | null; // <=1 => individual
            };
            timeZoneWorkspace: string;
            note?: string | null;
            customer: { id: string; idClientWorkspace: string };
        }
    ): Promise<{ event: Event; action: "created" | "joined" | "already-in" }> {
        const { idWorkspace, idCompany, seg, svc, timeZoneWorkspace, note, customer } = params;
        const startDate = seg.start.toDate();
        const endDate = seg.end.toDate();
        const capacity = Math.max(1, svc.maxParticipants ?? 1);
        const isGroup = capacity > 1;

        // 🔒 lock por (pro|servicio)+inicio
        await tx.$executeRawUnsafe(
            `SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`,
            `${seg.userId}|${seg.serviceId}`,
            seg.start.toISOString()
        );

        // ¿ya existe ese evento exacto?
        const existing = await tx.event.findFirst({
            where: {
                idWorkspaceFk: idWorkspace,
                idServiceFk: seg.serviceId,
                idUserPlatformFk: seg.userId,
                startDate,
                endDate,
            },
            select: { id: true },
        });

        if (existing) {
            if (!isGroup) {
                // Individual ⇒ si ya está el mismo cliente, idempotente; si no, ocupado
                const same = await tx.eventParticipant.findFirst({
                    where: {
                        idEventFk: existing.id,
                        idClientWorkspaceFk: customer.idClientWorkspace,
                        deletedDate: null,
                    },
                    select: { id: true },
                });
                const ev = await tx.event.findUnique({ where: { id: existing.id } });
                if (same) return { event: ev!, action: "already-in" };
                throw new Error("Ese horario ya está ocupado.");
            }

            // Grupal ⇒ comprueba plazas y si ya está dentro
            const [count, already] = await Promise.all([
                tx.eventParticipant.count({ where: { idEventFk: existing.id, deletedDate: null } }),
                tx.eventParticipant.findFirst({
                    where: {
                        idEventFk: existing.id,
                        idClientWorkspaceFk: customer.idClientWorkspace,
                        deletedDate: null,
                    },
                    select: { id: true },
                }),
            ]);

            const ev = await tx.event.findUnique({ where: { id: existing.id } });

            if (already) return { event: ev!, action: "already-in" };
            if (count >= capacity) throw new Error("No quedan plazas disponibles en ese grupo.");

            await tx.eventParticipant.create({
                data: {
                    idEventFk: existing.id,
                    idClientFk: customer.id,
                    idClientWorkspaceFk: customer.idClientWorkspace,
                },
            });

            return { event: ev!, action: "joined" };
        }

        // Evitar solapes con otros eventos del pro
        const overlappingOther = await tx.event.findFirst({
            where: {
                idUserPlatformFk: seg.userId,
                startDate: { lt: endDate },
                endDate: { gt: startDate },
            },
            select: { id: true },
        });
        if (overlappingOther) throw new Error("Ese profesional ya tiene otro evento en ese horario.");

        // Crear evento
        const ev = await tx.event.create({
            data: {
                idCompanyFk: idCompany,
                idWorkspaceFk: idWorkspace,
                // service: { connect: { id: seg.serviceId } },
                idServiceFk: seg.serviceId,
                idUserPlatformFk: seg.userId,
                startDate,
                endDate,
                title: svc.name ?? "Cita",
                description: note ?? null,
                timeZone: timeZoneWorkspace,
                eventPurposeType: "APPOINTMENT",
                serviceNameSnapshot: svc.name ?? null,
                servicePriceSnapshot: typeof svc.price === "number" ? svc.price : null,
                serviceDiscountSnapshot: typeof svc.discount === "number" ? svc.discount : null,
                serviceDurationSnapshot: typeof svc.duration === "number" ? svc.duration : null,
                eventParticipant: {
                    create: {
                        idClientFk: customer.id,
                        idClientWorkspaceFk: customer.idClientWorkspace,
                    },
                },
            },
        });

        return { event: ev, action: "created" };
    }


    async addEventFromWeb(input: AddFromWebInput, deps: AddFromWebDeps) {
        try {
            const {
                idCompany, idWorkspace, timeZoneClient, startLocalISO,
                attendees, excludeEventId, note, customer,
            } = input;
            const {
                timeZoneWorkspace, businessHoursService, workerHoursService,
                temporaryHoursService, bookingConfig, cache,
            } = deps;

            console.log(CONSOLE_COLOR.FgMagenta, "[addEventFromWeb] input:", input, CONSOLE_COLOR.Reset);

            if (!idCompany || !idWorkspace) throw new Error("Faltan idCompany/idWorkspace");
            if (!timeZoneWorkspace) throw new Error("Falta timeZoneWorkspace");
            if (!timeZoneClient) throw new Error("Falta timeZoneClient");
            if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(startLocalISO))
                throw new Error("startLocalISO debe ser YYYY-MM-DDTHH:mm:ss");
            if (!Array.isArray(attendees) || attendees.length === 0) throw new Error("attendees vacío");
            if (!customer?.id) throw new Error("Falta customer.id");
            if (!customer?.idClientWorkspace) throw new Error("Falta customer.idClientWorkspace");

            console.log(CONSOLE_COLOR.FgCyan, "[addEventFromWeb] startLocalISO:", startLocalISO, CONSOLE_COLOR.Reset);

            const startClient = moment.tz(startLocalISO, "YYYY-MM-DDTHH:mm:ss", timeZoneClient);
            if (!startClient.isValid()) throw new Error("startLocalISO inválido");

            const startWS = startClient.clone().tz(timeZoneWorkspace);
            const dateWS = startWS.format("YYYY-MM-DD");

            const todayWS = moment().tz(timeZoneWorkspace).startOf("day");
            if (startWS.clone().startOf("day").isBefore(todayWS, "day")) {
                console.log(CONSOLE_COLOR.BgRed, "[addEventFromWeb] Día pasado en TZ workspace", CONSOLE_COLOR.Reset);
                return { ok: false };
            }

            const { roundedNow, isToday } = computeSlotConfig({
                // alignMode: bookingConfig?.slot?.alignMode ?? "service",
                // attendees,
                intervalMinutes: 5,
                timeZoneWorkspace,
                dayStartLocal: startWS.clone().startOf("day"),
            });
            if (isToday && startWS.isBefore(roundedNow)) {
                console.log(CONSOLE_COLOR.BgRed, "[addEventFromWeb] Hora pasada en TZ workspace", CONSOLE_COLOR.Reset);
                return { ok: false };
            }

            // 2) Elegibles por servicio (quién puede hacer el servicio)
            const userIdsByService = new Map<string, string[]>();
            for (const a of attendees) {
                if (a.staffId) userIdsByService.set(a.serviceId, [a.staffId]);
                else {
                    const users = await getUsersWhoCanPerformService_SPECIAL(
                        idWorkspace, a.serviceId, a.categoryId, cache
                    );
                    userIdsByService.set(a.serviceId, users);
                }
            }
            const allUserIds = Array.from(new Set(Array.from(userIdsByService.values()).flat()));
            if (allUserIds.length === 0) {
                console.log(CONSOLE_COLOR.BgRed, "[addEventFromWeb] No hay profesionales elegibles", CONSOLE_COLOR.Reset);
                return { ok: false };
            }

            // 3) Reglas del día (ventanas de trabajo reales por user)
            const businessHours = await businessHoursService.getBusinessHoursFromRedis(idCompany, idWorkspace);
            const workerHoursMap = await workerHoursService.getWorkerHoursFromRedis(allUserIds, idWorkspace);
            const temporaryHoursMap = await temporaryHoursService.getTemporaryHoursFromRedis(allUserIds, idWorkspace, { date: dateWS });

            const events = await getEventsOverlappingRange_SPECIAL(idWorkspace, allUserIds, dateWS, dateWS, excludeEventId);
            const eventsByUser = groupEventsByUser_SPECIAL(events);

            type MM = { start: moment.Moment; end: moment.Moment };
            const weekDay = startWS.format("dddd").toUpperCase() as any;
            const bizShifts: string[][] = (() => {
                const biz = (businessHours as any)?.[weekDay];
                return biz === null ? [] : Array.isArray(biz) ? biz : [];
            })();

            const shiftsByUserLocal: Record<string, MM[]> = {};
            for (const uid of allUserIds) {
                let workShifts: string[][] = [];
                const tmp = (temporaryHoursMap as any)?.[uid]?.[dateWS];
                if (tmp === null) workShifts = [];
                else if (Array.isArray(tmp) && tmp.length > 0) workShifts = tmp;
                else {
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

            // 3.5) Snapshot servicios (saber si es grupal)
            const serviceById = await _getServicesSnapshotById({ idCompany, idWorkspace, attendees });

            // ==== Pesos RR (0–100; default 100) ====
            const rawIds = Array.isArray(bookingConfig?.resources?.ids)
                ? bookingConfig!.resources!.ids as unknown as [string, number][]
                : [];

            const weightsMap: Record<string, number> = Object.fromEntries(
                rawIds.map(([id, w]) => [id, Number.isFinite(w) ? w : 100])
            );


            // === PATH ESPECIAL: 1 servicio GRUPAL ===
            const isSingleGroup =
                attendees.length === 1 &&
                Math.max(1, serviceById[attendees[0].serviceId]?.maxParticipants ?? 1) > 1;

            let assignment: Array<{ serviceId: string; userId: string; start: moment.Moment; end: moment.Moment }> = [];

            if (isSingleGroup) {
                const svcReq = attendees[0];
                const svcSnap = serviceById[svcReq.serviceId];
                const dur = svcReq.durationMin ?? (svcSnap?.duration ?? 0);
                const endWS = startWS.clone().add(dur, "minutes");
                const elig = userIdsByService.get(svcReq.serviceId) ?? [];

                // 1) intentar UNIRSE a un evento existente por solape
                // const calendar = await prisma.calendar.findFirst({
                //     where: { idCompanyFk: idCompany, idWorkspaceFk: idWorkspace, deletedDate: null },
                //     select: { id: true },
                // });


                // if (calendar && elig.length) {
                // 
                if (elig.length) {
                    const overlappingEvents = await prisma.event.findMany({
                        where: {
                            // idCalendarFk: calendar.id,
                            idWorkspaceFk: idWorkspace,
                            idServiceFk: svcReq.serviceId,
                            idUserPlatformFk: { in: elig },
                            startDate: { lt: endWS.toDate() },
                            endDate: { gt: startWS.toDate() },
                            ...(excludeEventId ? { id: { not: excludeEventId } } : {}),
                            deletedDate: null,
                        },
                        orderBy: { startDate: "asc" },
                        select: {
                            id: true,
                            idUserPlatformFk: true,
                            startDate: true,
                            endDate: true,
                            eventParticipant: { where: { deletedDate: null }, select: { idClientFk: true, idClientWorkspaceFk: true } },
                        },
                    });

                    const pick = (() => {
                        if (!overlappingEvents.length) return null;
                        const exact = overlappingEvents.find(ev =>
                            moment(ev.startDate).isSame(startWS, "minute") &&
                            moment(ev.endDate).isSame(endWS, "minute")
                        );
                        if (exact) return exact;
                        return overlappingEvents
                            .map(ev => ({ ev, d: Math.abs(moment(ev.startDate).diff(startWS, "minutes")) }))
                            .sort((a, b) => a.d - b.d)[0].ev;
                    })();

                    if (pick && pick.idUserPlatformFk) {
                        const capacity = Math.max(1, svcSnap?.maxParticipants ?? 1);
                        const booked = pick.eventParticipant.length;
                        const hasSeat = booked < capacity;

                        const alreadyIn = pick.eventParticipant.some(p =>
                            p.idClientFk === customer.id || p.idClientWorkspaceFk === customer.idClientWorkspace
                        );

                        if (hasSeat && !alreadyIn) {
                            assignment = [{
                                serviceId: svcReq.serviceId,
                                userId: pick.idUserPlatformFk,
                                start: startWS.clone().seconds(0).milliseconds(0),
                                end: endWS.clone().seconds(0).milliseconds(0),
                            }];
                        }
                    }
                }

                // 2) si no había evento con plazas, crear el primero con RR
                if (assignment.length === 0) {
                    const eligAvail = (userIdsByService.get(svcReq.serviceId) ?? []).filter(uid =>
                        (freeWindowsByUser[uid] ?? []).some(w => startWS.isSameOrAfter(w.start) && endWS.isSameOrBefore(w.end))
                    );

                    const chosen = await this.chooseStaffWithRR(
                        idWorkspace,
                        undefined, // idBookingPage (no lo tenemos aquí)
                        svcReq.serviceId,
                        startWS.toDate(),
                        endWS.toDate(),
                        eligAvail,
                        weightsMap
                    );
                    if (!chosen) {
                        console.log(CONSOLE_COLOR.BgRed, "[addEventFromWeb] Grupo: ningún pro disponible para el slot", CONSOLE_COLOR.Reset);
                        return { ok: false };
                    }
                    assignment = [{
                        serviceId: svcReq.serviceId,
                        userId: chosen,
                        start: startWS.clone().seconds(0).milliseconds(0),
                        end: endWS.clone().seconds(0).milliseconds(0),
                    }];
                }
            } else {
                // === PATH NORMAL ===
                const isSingleIndividual =
                    attendees.length === 1 &&
                    Math.max(1, serviceById[attendees[0].serviceId]?.maxParticipants ?? 1) === 1;

                if (isSingleIndividual) {
                    // RR para individual (sin backtracking)
                    const svcReq = attendees[0];
                    const dur = svcReq.durationMin ?? (serviceById[svcReq.serviceId]?.duration ?? 0);
                    const endWS = startWS.clone().add(dur, "minutes");

                    const eligAvail = (userIdsByService.get(svcReq.serviceId) ?? []).filter(uid =>
                        (freeWindowsByUser[uid] ?? []).some(w => startWS.isSameOrAfter(w.start) && endWS.isSameOrBefore(w.end))
                    );

                    // TODO: Buscar el idBookingPage, se intentará que llegue desde el front client al hacer la reserva
                    const chosen = await this.chooseStaffWithRR(
                        idWorkspace,
                        undefined, // idBookingPage (no lo tenemos aquí)
                        svcReq.serviceId,
                        startWS.toDate(),
                        endWS.toDate(),
                        eligAvail,
                        weightsMap
                    );
                    if (!chosen) {
                        console.log(CONSOLE_COLOR.BgRed, "[addEventFromWeb] Individual: ningún pro disponible para el slot", CONSOLE_COLOR.Reset);
                        return { ok: false };
                    }

                    assignment = [{
                        serviceId: svcReq.serviceId,
                        userId: chosen,
                        start: startWS.clone().seconds(0).milliseconds(0),
                        end: endWS.clone().seconds(0).milliseconds(0),
                    }];
                } else {
                    // Multi-servicio → tu flujo actual (sin RR)
                    // Verificación previa
                    for (const svc of attendees) {
                        const elig = userIdsByService.get(svc.serviceId) ?? [];
                        const algunoTieneHueco = elig.some((uid) =>
                            (freeWindowsByUser[uid] ?? []).some(
                                (w) => w.end.diff(w.start, "minutes") >= svc.durationMin
                            )
                        );
                        if (!algunoTieneHueco) {
                            console.log(CONSOLE_COLOR.BgRed, "[addEventFromWeb] No hay hueco suficiente para al menos uno de los servicios.", CONSOLE_COLOR.Reset);
                            return { ok: false };
                        }
                    }

                    const eligibleUsersByService: Record<string, string[]> = {};
                    for (const a of attendees) {
                        eligibleUsersByService[a.serviceId] = userIdsByService.get(a.serviceId) ?? [];
                    }

                    const _assignment: typeof assignment = [];
                    const ok = assignSequentially_SPECIAL({
                        idx: 0,
                        start: startWS.clone().seconds(0).milliseconds(0),
                        attendees,
                        eligibleUsersByService,
                        freeWindowsByUser,
                        usedByUserAt: [],
                        assignment: _assignment,
                    });

                    if (!ok) {
                        console.log(CONSOLE_COLOR.BgRed, "[addEventFromWeb] El inicio elegido ya no está disponible (cambió la disponibilidad).", CONSOLE_COLOR.Reset);
                        return { ok: false };
                    }
                    assignment = _assignment;
                }
            }

            // total/end para la respuesta
            const totalDuration = attendees.reduce((acc, a) => acc + a.durationMin, 0);
            const endWS = startWS.clone().add(totalDuration, "minutes");

            // 6) Calendar & transacción (group-aware)
            // const calendar = await prisma.calendar.upsert({
            //     where: { idCompanyFk_idWorkspaceFk: { idCompanyFk: idCompany, idWorkspaceFk: idWorkspace } },
            //     update: {},
            //     create: { idCompanyFk: idCompany, idWorkspaceFk: idWorkspace },
            // });




            const created = await prisma.$transaction(async (tx) => {
                const events = [];
                for (const seg of assignment) {
                    const svc = serviceById[seg.serviceId];
                    if (!svc) throw new Error("Servicio no disponible o no pertenece a este workspace.");
                    const ev = await this.createOrJoinGroupEvent(tx, {
                        idWorkspace,
                        idCompany,
                        seg,
                        svc,
                        timeZoneWorkspace,
                        note,
                        customer: { id: customer.id, idClientWorkspace: customer.idClientWorkspace! },
                    });
                    events.push(ev);
                }
                return events;
            });

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
                created,
            };
        } catch (error: any) {
            console.error("Error en EventV2Service:", error);
            throw new CustomError("Error al crear evento", error);
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
            idBookingPage,
            idService,
            startISO: start.toISOString(),
            endISO: end.toISOString(),
            ttlSec: TIME_SECONDS.MINUTE,
        });
        if (!acquired) return null; // otro proceso está reservando este mismo slot

        // 2) Weighted Smooth RR (usa pesos 0–100; default 100)
        const chosen = await rr.pickWeightedSmoothRR({
            idWorkspace,
            idBookingPage,
            // idService, // es global
            eligibles,
            weights: weightsMap,
            stateTTLSec: TIME_SECONDS.WEEK * 2
        });

        if (!chosen) {
            // si no pudimos elegir, liberamos el hold
            await rr.releaseHold({
                idWorkspace,
                idBookingPage,
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
                where: { id: idEvent, idWorkspaceFk: idWorkspace, deletedDate: null },
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
                    eventSourceType: true,
                    eventStatusType: true,
                    allDay: true,
                    // timeZone: true,
                    serviceNameSnapshot: true,
                    servicePriceSnapshot: true,
                    serviceDiscountSnapshot: true,
                    serviceDurationSnapshot: true,

                    // Relaciones con select específico
                    eventParticipant: {
                        where: { deletedDate: null },
                        select: {
                            id: true,
                            idClientFk: true,
                            idClientWorkspaceFk: true,
                            eventStatusType: true,
                        },
                    },


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
}
