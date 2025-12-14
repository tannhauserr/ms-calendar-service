import { Event, Prisma } from "@prisma/client";
import prisma from "../../../lib/prisma";
import CustomError from "../../../models/custom-error/CustomError";
import moment from "moment";
import { CONSOLE_COLOR } from "../../../constant/console-color";
import { TIME_SECONDS } from "../../../constant/time";

import {
    assignSequentially_SPECIAL,
    computeSlotConfig,
    getEventsOverlappingRange_SPECIAL,
    getUsersWhoCanPerformService_SPECIAL,
    groupEventsByUser_SPECIAL,
    mergeTouchingWindows_SPECIAL,
    subtractBusyFromShift_SPECIAL,
    type AvailabilityDepsSpecial,
} from "../event/availability-special.service";

import { OnlineBookingConfig } from "../../@redis/cache/interfaces/models/booking-config";
import { RedisStrategyFactory } from "../../@redis/cache/strategies/redisStrategyFactory";
import { _getServicesSnapshotById } from "./util/getInfoServices";
import { IRedisRoundRobinStrategy } from "../../@redis/cache/strategies/roundRobin/interfaces";


// ────────────────────────────────────────────────────────────
// Tipos para reservas públicas desde la web
// ────────────────────────────────────────────────────────────

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
    isCommentRead?: boolean;
    customer: {
        id: string;                    // id del cliente (plataforma)
        idClient?: string;             // alias mismo id si lo usas así
        idClientWorkspace?: string;    // viene del controller (RPC)
        name?: string;
        email?: string;
        phone?: string;
    };

};

type UpdateMode = "single" | "group";

type UpdateFromWebInput = AddFromWebInput & {
    idEvent: string;
    deletedEventIds?: string[];
};


type AddFromWebDeps = {
    timeZoneWorkspace: string;
    autoConfirmClientBookings?: boolean;
    businessHoursService: {
        getBusinessHoursFromRedis(idCompany: string, idWorkspace: string): Promise<any>;
    };
    workerHoursService: {
        getWorkerHoursFromRedis(userIds: string[], idWorkspace: string): Promise<any>;
    };
    temporaryHoursService: {
        getTemporaryHoursFromRedis(
            userIds: string[],
            idWorkspace: string,
            range?: { date?: string; start?: string; end?: string }
        ): Promise<any>;
    };
    bookingConfig: OnlineBookingConfig;
    cache?: AvailabilityDepsSpecial["cache"];
};


type ClientAppointment = {
    bookingId: string;
    primaryEventId: string;
    startDate: string;
    endDate: string;
    status: string;
    commentClient?: string | null;
    timeZone: string;
    services: {
        idEvent: string;
        idService: string;
        serviceName: string;
        durationMin: number;
        price: number;
        staffId?: string;
    }[];
};
// ────────────────────────────────────────────────────────────
// Service con SOLO lógica de creación desde web (+ helpers)
// ────────────────────────────────────────────────────────────

export class ClientEventService {


    cancelEventFromWeb = async (
        idEvent: string,
        idClientWorkspace: string,
        idWorkspace: string,
    ): Promise<void> => {
        try {
            // Verificar que el evento pertenece al cliente y obtener información completa
            const event = await prisma.event.findFirst({
                where: {
                    id: idEvent,
                    idWorkspaceFk: idWorkspace,
                    eventParticipant: {
                        some: {
                            idClientWorkspaceFk: idClientWorkspace,
                            deletedDate: null,
                        },
                    },
                    deletedDate: null,
                },
                select: {
                    id: true,
                    eventStatusType: true,
                    serviceMaxParticipantsSnapshot: true,
                    eventParticipant: {
                        where: {
                            deletedDate: null,
                        },
                        select: {
                            id: true,
                            idClientWorkspaceFk: true,
                            eventStatusType: true,
                        },
                    },
                },
            });

            if (!event) {
                throw new Error('Evento no encontrado o no pertenece al cliente');
            }

            if (event.eventStatusType === 'CANCELLED' || event.eventStatusType === 'CANCELLED_BY_CLIENT_REMOVED') {
                // El evento general ya está cancelado
                return;
            }

            // Determinar si es servicio individual o grupal
            const maxParticipants = event.serviceMaxParticipantsSnapshot ?? 1;
            const isGroupService = maxParticipants > 1;
            const totalParticipants = event.eventParticipant.length;

            // Encontrar el participante del cliente
            const clientParticipant = event.eventParticipant.find(
                (p) => p.idClientWorkspaceFk === idClientWorkspace
            );

            if (!clientParticipant) {
                throw new Error('Participante no encontrado en el evento');
            }

            if (clientParticipant.eventStatusType === 'CANCELLED_BY_CLIENT') {
                // Este cliente ya se había dado de baja
                return;
            }

            if (isGroupService) {
                // Servicio GRUPAL (clase): solo cancelar participación del cliente
                await prisma.eventParticipant.update({
                    where: { id: clientParticipant.id },
                    data: {
                        eventStatusType: 'CANCELLED_BY_CLIENT',
                        // deletedDate: new Date(),
                    },
                });

                // Si este era el último participante activo, cancelar el evento completo
                const activeParticipants = event.eventParticipant.filter(
                    (p) => p.id !== clientParticipant.id && p.eventStatusType !== 'CANCELLED_BY_CLIENT'
                );

                if (activeParticipants.length === 0) {
                    await prisma.event.update({
                        where: { id: idEvent },
                        data: {
                            eventStatusType: 'PENDING',
                        },
                    });
                }
            } else {
                // Servicio INDIVIDUAL: cancelar el evento completo
                await prisma.$transaction([
                    prisma.eventParticipant.update({
                        where: { id: clientParticipant.id },
                        data: {
                            eventStatusType: 'CANCELLED_BY_CLIENT',
                        },
                    }),
                    prisma.event.update({
                        where: { id: idEvent },
                        data: {
                            eventStatusType: 'CANCELLED_BY_CLIENT',
                        },
                    }),
                ]);
            }

        } catch (error: any) {
            throw new CustomError('ClientEventService.cancelEventFromWeb', error);
        }
    };

    /**
 * Obtiene las citas de un cliente en un workspace,
 * agrupando por booking lógico (idGroup ?? id).
 *
 * - scope = "upcoming" → próximas citas (máx 25, sin paginación real)
 * - scope = "past"     → historial paginado (30 por página)
 */
    async getEvents(
        scope: "upcoming" | "past",
        page: number,
        itemsPerPage: number,
        idClientWorkspace: string,
        idWorkspace: string
    ): Promise<any> {
        try {

            console.log("Estoy entrando en getEvents", { scope, page, itemsPerPage, idClientWorkspace, idWorkspace });
            const events = await this._fetchClientEventsForScope(
                scope,
                idClientWorkspace,
                idWorkspace
            );

            console.log("Eventos crudos obtenidos:", events);

            return this._buildClientBookingsFromEvents(
                scope,
                events,
                page,
                itemsPerPage
            );
        } catch (error: any) {
            throw new CustomError("ClientEventService.getEvents", error);
        }
    }

    /**
     * Devuelve los eventos crudos del cliente en ese workspace
     * filtrados por scope (upcoming / past).
     */
    private async _fetchClientEventsForScope(
        scope: "upcoming" | "past",
        idClientWorkspace: string,
        idWorkspace: string
    ) {
        const now = new Date();

        const baseWhere = {
            idWorkspaceFk: idWorkspace,
            eventParticipant: {
                some: {
                    idClientWorkspaceFk: idClientWorkspace,
                    deletedDate: null,
                },
            },
            eventStatusType: {
                notIn: ["CANCELLED", "CANCELLED_BY_CLIENT", "CANCELLED_BY_CLIENT_REMOVED"] as any,
            },
            deletedDate: null,
        } as const;

        const where =
            scope === "upcoming"
                ? { ...baseWhere, startDate: { gte: now } }
                : { ...baseWhere, startDate: { lt: now } };

        const events = await prisma.event.findMany({
            where,
            select: {
                id: true,
                idGroup: true,
                title: true,
                description: true,
                startDate: true,
                endDate: true,
                idUserPlatformFk: true,
                idServiceFk: true,
                eventStatusType: true,
                eventPurposeType: true,
                eventSourceType: true,
                allDay: true,
                timeZone: true,
                serviceNameSnapshot: true,
                servicePriceSnapshot: true,
                serviceDiscountSnapshot: true,
                serviceDurationSnapshot: true,
                serviceMaxParticipantsSnapshot: true,
                commentClient: true,
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
            orderBy: {
                startDate: scope === "upcoming" ? "asc" : "desc",
            },
        });

        return events;
    }

    /**
     * Agrupa eventos por booking lógico (idGroup ?? id)
     * y aplica la paginación a nivel booking.
     */
    private _buildClientBookingsFromEvents(
        scope: "upcoming" | "past",
        events: any[],
        page: number,
        itemsPerPage: number
    ) {
        type ServiceItem = {
            idEvent: string;
            idService?: string | null;
            serviceName: string;
            maxParticipants?: number | null;
            durationMin: number | null;
            price: number | null;
            staffId?: string | null;
        };

        type BookingRow = {
            bookingId: string;      // idGroup o id
            primaryEventId: string; // evento “principal” (el más temprano)
            startDate: Date;
            endDate: Date;
            status: string;
            commentClient?: string | null;
            timeZone: string;
            services: ServiceItem[];
        };

        const bookingsMap = new Map<string, BookingRow>();

        for (const ev of events) {
            const bookingId = ev.idGroup ?? ev.id;

            let booking = bookingsMap.get(bookingId);
            if (!booking) {
                booking = {
                    bookingId,
                    primaryEventId: ev.id,
                    startDate: ev.startDate,
                    endDate: ev.endDate,
                    status: ev.eventStatusType,
                    commentClient: ev.commentClient,
                    timeZone: ev.timeZone,
                    services: [],
                };
                bookingsMap.set(bookingId, booking);
            } else {
                // Ajustar ventana global de la cita
                if (ev.startDate < booking.startDate) {
                    booking.startDate = ev.startDate;
                    booking.primaryEventId = ev.id; // el más temprano como principal
                }
                if (ev.endDate > booking.endDate) {
                    booking.endDate = ev.endDate;
                }
            }

            booking.services.push({
                idEvent: ev.id,
                idService: ev.idServiceFk,
                serviceName: ev.serviceNameSnapshot ?? ev.title ?? "",
                maxParticipants: ev.serviceMaxParticipantsSnapshot ?? null,
                durationMin: ev.serviceDurationSnapshot ?? null,
                price: ev.servicePriceSnapshot ?? null,
                staffId: ev.idUserPlatformFk,
            });
        }

        let allBookings = Array.from(bookingsMap.values());

        // Ordenar bookings
        allBookings.sort((a, b) =>
            scope === "upcoming"
                ? a.startDate.getTime() - b.startDate.getTime()
                : b.startDate.getTime() - a.startDate.getTime()
        );

        // Paginación a nivel booking
        const defaultPerPage = scope === "upcoming" ? 25 : 30;
        const effectiveItemsPerPage =
            itemsPerPage && itemsPerPage > 0
                ? Math.min(itemsPerPage, defaultPerPage)
                : defaultPerPage;

        const total = allBookings.length;
        const totalPages = Math.max(1, Math.ceil(total / effectiveItemsPerPage));

        let currentPage = page && page > 0 ? page : 1;
        if (scope === "upcoming") {
            // upcoming → siempre página 1
            currentPage = 1;
        } else {
            if (currentPage > totalPages) currentPage = totalPages;
        }

        const skip =
            scope === "upcoming"
                ? 0
                : (currentPage - 1) * effectiveItemsPerPage;

        const rows =
            scope === "upcoming"
                ? allBookings.slice(0, effectiveItemsPerPage)
                : allBookings.slice(skip, skip + effectiveItemsPerPage);

        return {
            scope,
            rows,
            total,
            page: currentPage,
            itemsPerPage: effectiveItemsPerPage,
            totalPages,
        };
    }

    /**
 * Obtiene UNA cita (booking lógico) a partir de un idEvent,
 * agrupando por (idGroup ?? id) y devolviendo un ClientAppointment.
 */
    // async getEventByIdAndClientWorkspaceAndWorkspace(
    //     idEvent: string,
    //     idClientWorkspace: string,
    //     idWorkspace: string
    // ): Promise<ClientAppointment | null> {
    //     try {
    //         // 1) Resolver el evento base y su bookingId (idGroup ?? id)
    //         const baseEvent = await prisma.event.findFirst({
    //             where: {
    //                 id: idEvent,
    //                 idWorkspaceFk: idWorkspace,
    //                 deletedDate: null,
    //                 eventParticipant: {
    //                     some: {
    //                         idClientWorkspaceFk: idClientWorkspace,
    //                         deletedDate: null,
    //                     },
    //                 },
    //             },
    //             select: {
    //                 id: true,
    //                 idGroup: true,
    //             },
    //         });

    //         if (!baseEvent) {
    //             return null;
    //         }

    //         const bookingId = baseEvent.idGroup ?? baseEvent.id;

    //         // 2) Traer TODOS los eventos que pertenecen a ese booking lógico
    //         const events = await prisma.event.findMany({
    //             where: {
    //                 idWorkspaceFk: idWorkspace,
    //                 deletedDate: null,
    //                 eventStatusType: {
    //                     notIn: ["CANCELLED", "CANCELLED_BY_CLIENT_REMOVED"] as any,
    //                 },
    //                 eventParticipant: {
    //                     some: {
    //                         idClientWorkspaceFk: idClientWorkspace,
    //                         deletedDate: null,
    //                     },
    //                 },
    //                 OR: [
    //                     { idGroup: bookingId },
    //                     {
    //                         AND: [
    //                             { id: bookingId },
    //                             { idGroup: null },
    //                         ],
    //                     },
    //                 ],
    //             },
    //             select: {
    //                 id: true,
    //                 idGroup: true,
    //                 title: true,
    //                 description: true,
    //                 startDate: true,
    //                 endDate: true,
    //                 idUserPlatformFk: true,
    //                 idServiceFk: true,
    //                 eventStatusType: true,
    //                 eventPurposeType: true,
    //                 eventSourceType: true,
    //                 allDay: true,
    //                 timeZone: true,
    //                 serviceNameSnapshot: true,
    //                 servicePriceSnapshot: true,
    //                 serviceDiscountSnapshot: true,
    //                 serviceDurationSnapshot: true,
    //                 serviceMaxParticipantsSnapshot: true,
    //                 commentClient: true,
    //                 eventParticipant: {
    //                     where: { deletedDate: null },
    //                     select: {
    //                         id: true,
    //                         idClientFk: true,
    //                         idClientWorkspaceFk: true,
    //                         eventStatusType: true,
    //                     },
    //                 },
    //             },
    //             orderBy: { startDate: "asc" },
    //         }); if (!events.length) {
    //             return null;
    //         }

    //         // 3) Reutilizar tu agrupador actual
    //         //    Da igual el scope, solo tenemos 1 booking en estos events
    //         const grouped = this._buildClientBookingsFromEvents(
    //             "upcoming", // o "past", da igual para 1 booking
    //             events,
    //             1,
    //             events.length || 10
    //         );

    //         const row = grouped.rows[0];
    //         if (!row) return null;

    //         // 4) Mapear BookingRow -> ClientAppointment
    //         const appointment: ClientAppointment = {
    //             bookingId: row.bookingId,
    //             primaryEventId: row.primaryEventId,
    //             startDate: row.startDate.toISOString(),
    //             endDate: row.endDate.toISOString(),
    //             status: row.status,
    //             commentClient: row.commentClient ?? null,
    //             timeZone: row.timeZone,
    //             services: row.services.map((s) => ({
    //                 idEvent: s.idEvent,
    //                 idService: s.idService ?? "",
    //                 serviceName: s.serviceName,
    //                 maxParticipants: s?.maxParticipants ?? 1,
    //                 durationMin: s.durationMin ?? 0,

    //                 price: s.price ?? 0,
    //                 staffId: s.staffId ?? undefined,
    //             })),
    //         };

    //         return appointment;
    //     } catch (error: any) {
    //         throw new CustomError("ClientEventService.getEventByIdAsBooking", error);
    //     }
    // }


    async getEventByGroupIdAndClientWorkspaceAndWorkspace(
        bookingId: string,          // ← idGroup que viene del front
        idClientWorkspace: string,
        idWorkspace: string
    ): Promise<ClientAppointment | null> {
        try {

            const EXCLUDED_STATUSES = ["CANCELLED", "CANCELLED_BY_CLIENT_REMOVED"];
            // 1) Traer TODOS los eventos que pertenecen a ese booking lógico
            const events = await prisma.event.findMany({
                where: {
                    idWorkspaceFk: idWorkspace,
                    deletedDate: null,
                    eventStatusType: { notIn: EXCLUDED_STATUSES as any },
                    eventParticipant: {
                        some: {
                            idClientWorkspaceFk: idClientWorkspace,
                            deletedDate: null,
                        },
                    },
                    // Aunque el front envíe idGroup, mantengo OR con id por compatibilidad
                    OR: [
                        { idGroup: bookingId },
                        // {
                        //     AND: [
                        //         { id: bookingId },
                        //         { idGroup: null },
                        //     ],
                        // },
                    ],
                },
                select: {
                    id: true,
                    idGroup: true,
                    title: true,
                    description: true,
                    startDate: true,
                    endDate: true,
                    idUserPlatformFk: true,
                    idServiceFk: true,
                    eventStatusType: true,
                    eventPurposeType: true,
                    eventSourceType: true,
                    allDay: true,
                    timeZone: true,
                    serviceNameSnapshot: true,
                    servicePriceSnapshot: true,
                    serviceDiscountSnapshot: true,
                    serviceDurationSnapshot: true,
                    serviceMaxParticipantsSnapshot: true,
                    commentClient: true,
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
                orderBy: { startDate: "asc" },
            });

            if (!events.length) {
                return null;
            }

            // 2) Reutilizamos el agrupador actual
            const grouped = this._buildClientBookingsFromEvents(
                "upcoming", // scope irrelevante, solo hay un booking
                events,
                1,
                events.length || 10
            );

            const row = grouped.rows[0];
            if (!row) {
                return null;
            }

            // 3) Mapear BookingRow -> ClientAppointment (mismo result que ahora)
            const appointment: ClientAppointment = {
                bookingId: row.bookingId,
                primaryEventId: row.primaryEventId,
                startDate: row.startDate.toISOString(),
                endDate: row.endDate.toISOString(),
                status: row.status,
                commentClient: row.commentClient ?? null,
                timeZone: row.timeZone,
                services: row.services.map((s) => ({
                    idEvent: s.idEvent,
                    idService: s.idService ?? "",
                    serviceName: s.serviceName,
                    maxParticipants: s.maxParticipants ?? 1,
                    durationMin: s.durationMin ?? 0,
                    price: s.price ?? 0,
                    staffId: s.staffId ?? undefined,
                })),
            };

            return appointment;
        } catch (error: any) {
            throw new CustomError(
                "ClientEventService.getEventByGroupIdAndClientWorkspaceAndWorkspace",
                error
            );
        }
    }

    /**
     * Obtiene un evento específico por ID verificando que pertenezca al cliente.
     */
    // async getEventByIdAndClientWorkspaceAndWorkspace(
    //     eventId: string,
    //     idClientWorkspace: string,
    //     idWorkspace: string
    // ): Promise<any> {
    //     try {
    //         console.log(`${CONSOLE_COLOR.BgCyan}[ClientEventService.getEventByIdAndClientWorkspaceAndWorkspace] Parámetros llegados al servicio:${CONSOLE_COLOR.Reset}`, { eventId, idClientWorkspace, idWorkspace });
    //         const event = await prisma.event.findFirst({
    //             where: {
    //                 id: eventId,
    //                 idWorkspaceFk: idWorkspace,
    //                 eventParticipant: {
    //                     some: {
    //                         idClientWorkspaceFk: idClientWorkspace,
    //                         deletedDate: null,
    //                     },
    //                 },
    //                 eventStatusType: {
    //                     notIn: ['CANCELLED', 'CANCELLED_BY_CLIENT_REMOVED'],
    //                 },
    //                 deletedDate: null,
    //             },
    //             select: {
    //                 id: true,
    //                 title: true,
    //                 description: true,
    //                 startDate: true,
    //                 endDate: true,
    //                 idUserPlatformFk: true,
    //                 idServiceFk: true,
    //                 eventStatusType: true,
    //                 eventPurposeType: true,
    //                 eventSourceType: true,
    //                 allDay: true,
    //                 timeZone: true,
    //                 serviceNameSnapshot: true,
    //                 servicePriceSnapshot: true,
    //                 serviceDiscountSnapshot: true,
    //                 serviceDurationSnapshot: true,
    //                 commentClient: true,
    //                 isEditableByClient: true,
    //                 numberUpdates: true,
    //                 eventParticipant: {
    //                     where: {
    //                         deletedDate: null,
    //                     },
    //                     select: {
    //                         id: true,
    //                         idClientFk: true,
    //                         idClientWorkspaceFk: true,
    //                         eventStatusType: true,
    //                     },
    //                 },
    //             },
    //         });

    //         if (!event) {
    //             throw new Error('Evento no encontrado o no pertenece al cliente');
    //         }

    //         return event;
    //     } catch (error: any) {
    //         throw new CustomError('ClientEventService.getEventByIdAndClientWorkspaceAndWorkspace', error);
    //     }
    // }



    /**
     * Elige un staff aplicando Weighted Smooth Round Robin
     * con hold temporal en Redis para evitar colisiones.
     */
    chooseStaffWithRR = async (
        idWorkspace: string,
        idBookingPage: string | undefined,
        idService: string,
        start: Date,
        end: Date,
        eligibles: string[],
        weightsMap: Record<string, number>
    ): Promise<string | null> => {
        if (!eligibles.length) return null;

        const rr = RedisStrategyFactory.getStrategy("roundRobin") as IRedisRoundRobinStrategy;

        // 1) Hold del slot (scoped por workspace + service)
        const acquired = await rr.acquireHold({
            idWorkspace,
            idService,
            startISO: start.toISOString(),
            endISO: end.toISOString(),
            ttlSec: TIME_SECONDS.MINUTE,
        });
        if (!acquired) return null; // otro proceso está reservando este mismo slot

        // 2) Weighted Smooth RR
        const chosen = await rr.pickWeightedSmoothRR({
            idWorkspace,
            idService,
            eligibles,
            weights: weightsMap,
            stateTTLSec: TIME_SECONDS.WEEK * 2,
        });

        if (!chosen) {
            await rr.releaseHold({
                idWorkspace,
                idService,
                startISO: start.toISOString(),
                endISO: end.toISOString(),
            });
            return null;
        }

        // Nota: el hold se mantiene hasta que completes/abortes la creación.
        return chosen;
    };

    /**
     * Crea o une a un evento de grupo (capacidad = maxParticipants del servicio).
     */
    async createOrJoinGroupEvent(
        tx: Prisma.TransactionClient,
        params: {
            idCompany: string;
            idWorkspace: string;
            idGroup?: string;
            seg: { serviceId: string; userId: string; start: moment.Moment; end: moment.Moment };
            svc: {
                id: string;
                name?: string | null;
                price?: number | null;
                discount?: number | null;
                duration?: number | null;
                maxParticipants?: number | null;
            };
            timeZoneWorkspace: string;
            note?: string | null;
            isCommentRead?: boolean;
            customer: { id: string; idClientWorkspace: string };
            autoConfirmClientBookings: boolean;
        }
    ): Promise<{ event: Event; action: "created" | "joined" | "already-in" }> {
        const { idWorkspace, idCompany, seg, svc, timeZoneWorkspace, note, isCommentRead, customer, autoConfirmClientBookings } = params;
        const startDate = seg.start.toDate();
        const endDate = seg.end.toDate();
        const capacity = Math.max(1, svc.maxParticipants ?? 1);
        const isGroup = capacity > 1;

        // Determinar el estado según configuración
        const eventStatus = autoConfirmClientBookings ? 'ACCEPTED' : 'PENDING';
        const participantStatus = autoConfirmClientBookings ? 'ACCEPTED' : 'PENDING';

        // Lock por (pro+servicio+inicio)
        await tx.$executeRawUnsafe(
            `SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`,
            `${seg.userId}|${seg.serviceId}`,
            seg.start.toISOString()
        );

        // ¿Evento exacto ya existe?
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
            // Individual
            if (!isGroup) {
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

            // Grupal
            const [count, already] = await Promise.all([
                tx.eventParticipant.count({
                    where: { idEventFk: existing.id, deletedDate: null },
                }),
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
                    eventStatusType: participantStatus,
                },
            });

            return { event: ev!, action: "joined" };
        }

        // Evitar solape con otros eventos del pro
        const overlappingOther = await tx.event.findFirst({
            where: {
                idUserPlatformFk: seg.userId,
                startDate: { lt: endDate },
                endDate: { gt: startDate },
            },
            select: { id: true },
        });
        if (overlappingOther) throw new Error("Ese profesional ya tiene otro evento en ese horario.");

        // Crear evento nuevo
        const ev = await tx.event.create({
            data: {
                idCompanyFk: idCompany,
                idWorkspaceFk: idWorkspace,
                idServiceFk: seg.serviceId,
                idUserPlatformFk: seg.userId,
                startDate,
                endDate,
                title: svc.name ?? "Cita",

                timeZone: timeZoneWorkspace,
                eventPurposeType: "APPOINTMENT",
                eventStatusType: eventStatus,
                commentClient: note ?? null,
                isCommentRead: isCommentRead ?? false,

                serviceNameSnapshot: svc.name ?? null,
                servicePriceSnapshot: typeof svc.price === "number" ? svc.price : null,
                serviceDiscountSnapshot: typeof svc.discount === "number" ? svc.discount : null,
                serviceDurationSnapshot: typeof svc.duration === "number" ? svc.duration : null,
                serviceMaxParticipantsSnapshot: typeof svc.maxParticipants === "number" ? svc.maxParticipants : null,
                eventParticipant: {
                    create: {
                        idClientFk: customer.id,
                        idClientWorkspaceFk: customer.idClientWorkspace,
                        eventStatusType: participantStatus,
                    },
                },
            },
        });

        return { event: ev, action: "created" };
    }

    // ───────────────── helpers internos ─────────────────

    /**
     * Devuelve true si es exactamente un servicio y ese servicio es grupal (clase),
     * es decir, maxParticipants > 1.
     */
    private isSingleGroupFromWeb(
        attendees: AddFromWebInput["attendees"],
        serviceById: Record<string, { maxParticipants?: number | null }>
    ): boolean {
        if (attendees.length !== 1) return false;
        const svc = serviceById[attendees[0].serviceId];
        const maxP = Math.max(1, svc?.maxParticipants ?? 1);
        return maxP > 1;
    }

    /**
     * Devuelve true si TODOS los servicios son individuales
     * (maxParticipants <= 1 en todos).
     * Pueden ser uno o varios.
     */
    private isOnlyIndividualServicesFromWeb(
        attendees: AddFromWebInput["attendees"],
        serviceById: Record<string, { maxParticipants?: number | null }>
    ): boolean {
        if (!attendees.length) return false;
        return attendees.every((a) => {
            const svc = serviceById[a.serviceId];
            const maxP = Math.max(1, svc?.maxParticipants ?? 1);
            return maxP === 1;
        });
    }


    // ───────────────── addEventFromWeb ─────────────────

    async addEventFromWeb(input: AddFromWebInput, deps: AddFromWebDeps) {
        try {
            const {
                idCompany, idWorkspace, timeZoneClient, startLocalISO,
                attendees, excludeEventId, note, isCommentRead, customer,
            } = input;
            const {
                timeZoneWorkspace, businessHoursService, workerHoursService,
                temporaryHoursService, bookingConfig, cache, autoConfirmClientBookings
            } = deps;

            console.log(CONSOLE_COLOR.FgMagenta, "[addEventFromWeb] input:", input, CONSOLE_COLOR.Reset);

            // ───────────── Validaciones básicas ─────────────
            if (!idCompany || !idWorkspace) throw new Error("Faltan idCompany/idWorkspace");
            if (!timeZoneWorkspace) throw new Error("Falta timeZoneWorkspace");
            if (!timeZoneClient) throw new Error("Falta timeZoneClient");
            if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(startLocalISO))
                throw new Error("startLocalISO debe ser YYYY-MM-DDTHH:mm:ss");
            if (!Array.isArray(attendees) || attendees.length === 0) throw new Error("attendees vacío");
            if (!customer?.id) throw new Error("Falta customer.id");
            if (!customer?.idClientWorkspace) throw new Error("Falta customer.idClientWorkspace");

            console.log(CONSOLE_COLOR.FgCyan, "[addEventFromWeb] startLocalISO:", startLocalISO, CONSOLE_COLOR.Reset);

            // ───────────── Conversión de fechas (cliente → workspace) ─────────────
            const startClient = moment.tz(startLocalISO, "YYYY-MM-DDTHH:mm:ss", timeZoneClient);
            if (!startClient.isValid()) throw new Error("startLocalISO inválido");

            const startWS = startClient.clone().tz(timeZoneWorkspace);
            const dateWS = startWS.format("YYYY-MM-DD");

            const todayWS = moment().tz(timeZoneWorkspace).startOf("day");
            if (startWS.clone().startOf("day").isBefore(todayWS, "day")) {
                console.log(CONSOLE_COLOR.BgRed, "[addEventFromWeb] Día pasado en TZ workspace", CONSOLE_COLOR.Reset);
                return { ok: false as const };
            }

            const { roundedNow, isToday } = computeSlotConfig({
                intervalMinutes: 5,
                timeZoneWorkspace,
                dayStartLocal: startWS.clone().startOf("day"),
            });

            if (isToday && startWS.isBefore(roundedNow)) {
                console.log(CONSOLE_COLOR.BgRed, "[addEventFromWeb] Hora pasada en TZ workspace", CONSOLE_COLOR.Reset);
                return { ok: false as const };
            }

            // ───────────── Elegibles por servicio (quién puede hacer el servicio) ─────────────
            const userIdsByService = new Map<string, string[]>();
            for (const a of attendees) {
                if (a.staffId) {
                    userIdsByService.set(a.serviceId, [a.staffId]);
                } else {
                    const users = await getUsersWhoCanPerformService_SPECIAL(
                        idWorkspace, a.serviceId, a.categoryId, cache
                    );
                    userIdsByService.set(a.serviceId, users);
                }
            }

            const allUserIds = Array.from(
                new Set(Array.from(userIdsByService.values()).flat())
            );
            if (allUserIds.length === 0) {
                console.log(CONSOLE_COLOR.BgRed, "[addEventFromWeb] No hay profesionales elegibles", CONSOLE_COLOR.Reset);
                return { ok: false as const };
            }

            // ───────────── Reglas del día (ventanas de trabajo reales por user) ─────────────
            const businessHours = await businessHoursService.getBusinessHoursFromRedis(idCompany, idWorkspace);
            const workerHoursMap = await workerHoursService.getWorkerHoursFromRedis(allUserIds, idWorkspace);
            const temporaryHoursMap = await temporaryHoursService.getTemporaryHoursFromRedis(
                allUserIds,
                idWorkspace,
                { date: dateWS }
            );

            const events = await getEventsOverlappingRange_SPECIAL(
                idWorkspace,
                allUserIds,
                dateWS,
                dateWS,
                excludeEventId
            );
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

            // ───────────── Snapshot servicios (saber si es grupal / individual) ─────────────
            const serviceById = await _getServicesSnapshotById({ idCompany, idWorkspace, attendees });

            // Pesos RR (0–100; default 100)
            const rawIds = Array.isArray(bookingConfig?.resources?.ids)
                ? (bookingConfig!.resources!.ids as unknown as [string, number][])
                : [];

            const weightsMap: Record<string, number> = Object.fromEntries(
                rawIds.map(([id, w]) => [id, Number.isFinite(w) ? w : 100])
            );

            // ───────────── Clasificación (helpers nuevos) ─────────────
            const isSingleGroup = this.isSingleGroupFromWeb(attendees, serviceById);
            const onlyIndividual = this.isOnlyIndividualServicesFromWeb(attendees, serviceById);
            const isSingleIndividual = onlyIndividual && attendees.length === 1;

            // Cuando hay más de un servicio (todos individuales) queremos un idGroup
            // que será EL ID DEL PRIMER EVENTO creado.
            // const shouldCreateGroupId = onlyIndividual && attendees.length > 1;

            let assignment: Array<{ serviceId: string; userId: string; start: moment.Moment; end: moment.Moment }> = [];

            // ───────────── PATH ESPECIAL: 1 servicio GRUPAL (clase) ─────────────
            if (isSingleGroup) {
                const svcReq = attendees[0];
                const svcSnap = serviceById[svcReq.serviceId];
                const dur = svcReq.durationMin ?? (svcSnap?.duration ?? 0);
                const endWS = startWS.clone().add(dur, "minutes");
                const elig = userIdsByService.get(svcReq.serviceId) ?? [];

                // 1) intentar UNIRSE a un evento existente por solape
                if (elig.length) {
                    const overlappingEvents = await prisma.event.findMany({
                        where: {
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
                            eventParticipant: {
                                where: { deletedDate: null },
                                select: { idClientFk: true, idClientWorkspaceFk: true },
                            },
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
                        (freeWindowsByUser[uid] ?? []).some(w =>
                            startWS.isSameOrAfter(w.start) && endWS.isSameOrBefore(w.end)
                        )
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
                        return { ok: false as const };
                    }
                    assignment = [{
                        serviceId: svcReq.serviceId,
                        userId: chosen,
                        start: startWS.clone().seconds(0).milliseconds(0),
                        end: endWS.clone().seconds(0).milliseconds(0),
                    }];
                }
            } else {
                // ───────────── PATH NORMAL (individuos) ─────────────

                if (isSingleIndividual) {
                    // RR para individual (sin backtracking)
                    const svcReq = attendees[0];
                    const dur = svcReq.durationMin ?? (serviceById[svcReq.serviceId]?.duration ?? 0);
                    const endWS = startWS.clone().add(dur, "minutes");

                    const eligAvail = (userIdsByService.get(svcReq.serviceId) ?? []).filter(uid =>
                        (freeWindowsByUser[uid] ?? []).some(w =>
                            startWS.isSameOrAfter(w.start) && endWS.isSameOrBefore(w.end)
                        )
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
                        console.log(CONSOLE_COLOR.BgRed, "[addEventFromWeb] Individual: ningún pro disponible para el slot", CONSOLE_COLOR.Reset);
                        return { ok: false as const };
                    }

                    assignment = [{
                        serviceId: svcReq.serviceId,
                        userId: chosen,
                        start: startWS.clone().seconds(0).milliseconds(0),
                        end: endWS.clone().seconds(0).milliseconds(0),
                    }];
                } else {
                    // Multi-servicio → flujo actual (sin RR)
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
                            return { ok: false as const };
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
                        return { ok: false as const };
                    }
                    assignment = _assignment;
                }
            }

            // ───────────── total/end para la respuesta ─────────────
            const totalDuration = attendees.reduce((acc, a) => acc + a.durationMin, 0);
            const endWS = startWS.clone().add(totalDuration, "minutes");

            // Helper local: extrae el "evento núcleo" de lo que devuelva createOrJoinGroupEvent
            function getCoreEvent(
                createdItem: any
            ): { id?: string; idGroup?: string | null } | null {
                if (!createdItem) return null;
                // Si viene como { event, notification }, usamos event
                if (createdItem.event) return createdItem.event as any;
                // Si viene ya como evento plano
                return createdItem as any;
            }



            // NUEVO: siempre asignamos idGroup a TODOS los eventos creados en este bloque,
            // usando el id del primero como booking code si no viene ya uno asignado.
            const created = await prisma.$transaction(async (tx) => {
                const eventsCreated: any[] = [];

                for (const seg of assignment) {
                    const svc = serviceById[seg.serviceId];
                    if (!svc) throw new Error("Servicio no disponible o no pertenece a este workspace.");

                    const result = await this.createOrJoinGroupEvent(tx, {
                        idWorkspace,
                        idCompany,
                        seg,
                        svc,
                        timeZoneWorkspace,
                        note,
                        isCommentRead,
                        customer: {
                            id: customer.id,
                            idClientWorkspace: customer.idClientWorkspace!,
                        },
                        autoConfirmClientBookings,
                        // ya no usamos shouldCreateGroupId aquí
                    });

                    eventsCreated.push(result);
                }

                // 🟢 SIEMPRE: asegurar idGroup tipo "booking code" para TODOS los eventos de este bloque
                const coreEvents = eventsCreated
                    .map((c) => getCoreEvent(c))
                    .filter((e) => e && typeof e.id === "string") as {
                        id: string;
                        idGroup?: string | null;
                    }[];

                if (coreEvents.length > 0) {
                    // Si ya viene idGroup del primero, lo respetamos.
                    // Si no, usamos su propio id como booking code.
                    const targetGroupId = coreEvents[0].idGroup ?? coreEvents[0].id;
                    const ids = coreEvents.map((e) => e.id);

                    await tx.event.updateMany({
                        where: { id: { in: ids } },
                        data: { idGroup: targetGroupId },
                    });

                    // Sincronizar copias en memoria
                    for (const item of eventsCreated) {
                        const ev = getCoreEvent(item);
                        if (ev && ids.includes(ev.id!)) {
                            ev.idGroup = targetGroupId;
                        }
                    }
                }

                return eventsCreated;
            });


            // Intentamos extraer un posible objeto notification retornado por createOrJoinGroupEvent
            const notifications = (created as any[])
                .map((c) => c?.notification)
                .filter((n) => !!n);

            const primaryNotification = notifications[0] ?? null;

            // Para devolver idGroup en la respuesta
            const coreEventsForGroup = created
                .map((c) => getCoreEvent(c))
                .filter((e) => e && typeof e.id === "string") as {
                    id: string;
                    idGroup?: string | null;
                }[];

            // const groupId =
            //     shouldCreateGroupId && coreEventsForGroup.length > 0
            //         ? coreEventsForGroup[0].idGroup ?? coreEventsForGroup[0].id
            //         : null;

            const groupId =
                coreEventsForGroup.length > 0
                    ? coreEventsForGroup[0].idGroup ?? coreEventsForGroup[0].id
                    : null;

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
                // Nuevo: devolvemos también el objeto notification (si existe)
                notification: primaryNotification,
                notifications,
                // OLD = Para que el front pueda saber si es multi-servicio agrupado
                // NUEVO = siempre devolvemos idGroup si existe, funciona como un idBooking
                idGroup: groupId,
            };
        } catch (error: any) {
            console.error("Error en EventV2Service:", error);
            throw new CustomError("Error al crear evento", error);
        }
    }




    /**
 * Update de eventos desde la booking page (cliente).
 * - Ruta rápida para single-service.
 * - Ruta multi-service: reconstruye segmentos secuenciales y aplica diff (update/create/delete) con TX.
 * - Servicios grupales (capacity > 1) quedan pendientes (TODO).
 *
 * Requiere extender el tipo:
 * type UpdateFromWebInput = {
 *   ...
 *   deletedEventIds?: string[]; // <- NUEVO (opcional)
 * }
 */
    private async updateEventFromWebBase(
        input: UpdateFromWebInput,
        deps: AddFromWebDeps,
        mode: UpdateMode
    ) {
        try {
            const {
                idCompany,
                idWorkspace,
                timeZoneClient,
                startLocalISO,
                attendees,
                idEvent,
                note,
                isCommentRead,
                customer,
                deletedEventIds = [], // NUEVO
            } = input;

            const {
                timeZoneWorkspace,
                businessHoursService,
                workerHoursService,
                temporaryHoursService,
                bookingConfig,
                cache,
            } = deps;

            console.log(
                CONSOLE_COLOR.FgMagenta,
                `[updateEventFromWebBase][${mode}] input:`,
                {
                    ...input,
                    attendeesLen: attendees?.length,
                    deletedEventIdsLen: deletedEventIds?.length ?? 0,
                },
                CONSOLE_COLOR.Reset
            );

            // ───────────── Validaciones básicas ─────────────
            if (!idEvent) throw new Error("Falta idEvent");
            if (!idCompany || !idWorkspace) throw new Error("Faltan idCompany/idWorkspace");
            if (!timeZoneWorkspace) throw new Error("Falta timeZoneWorkspace");
            if (!timeZoneClient) throw new Error("Falta timeZoneClient");
            if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(startLocalISO))
                throw new Error("startLocalISO debe ser YYYY-MM-DDTHH:mm:ss");
            if (!Array.isArray(attendees) || attendees.length === 0)
                throw new Error("attendees vacío");
            if (!customer?.id) throw new Error("Falta customer.id");
            if (!customer?.idClientWorkspace) throw new Error("Falta customer.idClientWorkspace");

            const startClient = moment.tz(
                startLocalISO,
                "YYYY-MM-DDTHH:mm:ss",
                timeZoneClient
            );
            if (!startClient.isValid()) throw new Error("startLocalISO inválido");

            const startWS = startClient.clone().tz(timeZoneWorkspace);
            const dateWS = startWS.format("YYYY-MM-DD");

            // Día pasado
            const todayWS = moment().tz(timeZoneWorkspace).startOf("day");
            if (startWS.clone().startOf("day").isBefore(todayWS, "day")) {
                console.log(
                    CONSOLE_COLOR.BgRed,
                    "[updateEventFromWebBase] Día pasado en TZ workspace",
                    CONSOLE_COLOR.Reset
                );
                return {
                    ok: false as const,
                    code: "BOOKING_ERR_DAY_IN_PAST",
                    message:
                        "El día seleccionado ya ha pasado en la zona horaria del negocio.",
                };
            }

            // Lead-time / hora pasada hoy
            const { roundedNow, isToday } = computeSlotConfig({
                intervalMinutes: 5,
                timeZoneWorkspace,
                dayStartLocal: startWS.clone().startOf("day"),
            });

            if (isToday && startWS.isBefore(roundedNow)) {
                console.log(
                    CONSOLE_COLOR.BgRed,
                    "[updateEventFromWebBase] Hora pasada en TZ workspace",
                    CONSOLE_COLOR.Reset
                );
                return {
                    ok: false as const,
                    code: "BOOKING_ERR_TIME_PASSED",
                    message:
                        "La hora seleccionada ya ha pasado hoy en la zona horaria del negocio.",
                };
            }

            // ───────────── Evento original + grupo ─────────────
            const original = await prisma.event.findUnique({
                where: { id: idEvent },
                include: {
                    eventParticipant: {
                        where: { deletedDate: null },
                        select: { idClientFk: true, idClientWorkspaceFk: true },
                    },
                },
            });
            if (!original || original.deletedDate)
                throw new Error("Evento original no encontrado");
            if (original.idWorkspaceFk !== idWorkspace)
                throw new Error("El evento original no pertenece a este workspace");

            const isOwner = original.eventParticipant.some(
                (p) =>
                    p.idClientFk === customer.id ||
                    p.idClientWorkspaceFk === customer.idClientWorkspace
            );
            if (!isOwner)
                throw new Error("Este cliente no está asociado al evento original");

            // ⬇️ bookingId estable para notificaciones / dedupe
            const bookingId = original.idGroup ?? original.id;

            // Detectar grupo
            const groupId = original.idGroup ?? original.id;
            const groupEvents = await prisma.event.findMany({
                where: {
                    idWorkspaceFk: idWorkspace,
                    idGroup: groupId,
                    deletedDate: null,
                },
                orderBy: { startDate: "asc" },
            });
            const originalEvents = groupEvents.length ? groupEvents : [original];
            const originalIds = new Set(originalEvents.map((e) => e.id));

            // Si se marca alguno para borrar explícitamente, lo eliminaremos en TX y lo excluimos de solapes
            const explicitDeletes = new Set(
                (deletedEventIds || []).filter((id) => originalIds.has(id))
            );

            // ───────────── Acceso rápido: single → single sin deletes ─────────────
            const maxPerBooking = bookingConfig?.limits?.maxServicesPerBooking ?? 5;
            const fastPathSingle =
                attendees.length === 1 &&
                originalEvents.length === 1 &&
                explicitDeletes.size === 0;

            // ───────────── Snapshot de servicios / RR ─────────────
            const needServiceIds = [...new Set(attendees.map((a) => a.serviceId))];

            const [serviceById, weightsMap] = await Promise.all([
                _getServicesSnapshotById({ idCompany, idWorkspace, attendees }),
                (async () => {
                    const rawIds = Array.isArray(bookingConfig?.resources?.ids)
                        ? (bookingConfig!.resources!.ids as unknown as [
                            string,
                            number
                        ][])
                        : [];
                    return Object.fromEntries(
                        rawIds.map(([id, w]) => [
                            id,
                            Number.isFinite(w) ? w : 100,
                        ])
                    );
                })(),
            ]);

            // ───────────── Validar servicios (no cambiar tipo ni id) ─────────────
            // Conjunto de servicios originales de la reserva (antes de editar)
            const originalServiceIds = new Set(
                originalEvents
                    .map((e) => e.idServiceFk)
                    .filter((id): id is string => !!id)
            );

            // Conjunto de servicios que llegan desde el cliente al editar
            const requestedServiceIds = new Set(needServiceIds);

            // Misma cardinalidad y mismos ids => no ha cambiado el "pack" de servicios
            const sameServiceSet =
                originalServiceIds.size === requestedServiceIds.size &&
                [...originalServiceIds].every((id) => requestedServiceIds.has(id));

            // Recordatorio: Group en este caso significa clase = más de un participante en el mismo evento
            if (mode === "group" && !sameServiceSet) {
                // No se permite cambiar los servicios, da igual single o clase (uno o varios)
                return {
                    ok: false as const,
                    code: "BOOKING_ERR_SERVICE_CHANGED_ON_EDIT",
                    message:
                        "Solo puedes cambiar la fecha y hora de la cita, no los servicios.",
                };
            }

            // ───────────── Detectar edición "pura" de clase ─────────────
            const classServiceId = needServiceIds.length === 1 ? needServiceIds[0] : null;
            const classSnap = classServiceId ? serviceById[classServiceId] : undefined;
            const classCapacity =
                classSnap != null
                    ? Math.max(1, classSnap.maxParticipants ?? 1)
                    : 1;

            // Edición de CLASE soportada cuando:
            // - solo hay 1 servicio
            // - ese servicio tiene capacity > 1 (clase)
            // - el cliente está editando 1 attendee
            // - solo hay 1 Event físico en el grupo (la sesión de clase)
            // - no hay deletes explícitos
            const isPureClassEdit =
                !!classServiceId &&
                classCapacity > 1 &&
                attendees.length === 1 &&
                originalEvents.length === 1 &&
                explicitDeletes.size === 0;

            if (isPureClassEdit) {
                // Mover solo la participación del cliente a otra sesión (misma clase)
                return await this._handlePureClassEdit({
                    idCompany,
                    idWorkspace,
                    timeZoneClient,
                    timeZoneWorkspace,
                    startWS,
                    attendees,
                    original,
                    bookingId,
                    groupId,
                    serviceById,
                    weightsMap,
                    cache,
                    customer: {
                        id: customer.id,
                        idClientWorkspace: customer.idClientWorkspace!,
                    },
                    note,
                });
            }

            // ───────────── Ruta rápida SINGLE (servicio individual) ─────────────
            if (fastPathSingle) {
                const svcReq = attendees[0];
                const svcSnap = serviceById[svcReq.serviceId];
                if (!svcSnap) throw new Error("Servicio no disponible en snapshot");

                const userIdsByService = new Map<string, string[]>();
                if (svcReq.staffId) {
                    userIdsByService.set(svcReq.serviceId, [svcReq.staffId]);
                } else {
                    const users = await getUsersWhoCanPerformService_SPECIAL(
                        idWorkspace,
                        svcReq.serviceId,
                        svcReq.categoryId,
                        cache
                    );
                    userIdsByService.set(svcReq.serviceId, users);
                }

                const allUserIds = Array.from(
                    new Set(Array.from(userIdsByService.values()).flat())
                );
                if (!allUserIds.length) {
                    console.log(
                        CONSOLE_COLOR.BgRed,
                        "[update][single] No hay profesionales elegibles",
                        CONSOLE_COLOR.Reset
                    );
                    return {
                        ok: false as const,
                        code: "BOOKING_ERR_NO_ELIGIBLE_STAFF",
                        message:
                            "No hay profesionales elegibles para el servicio seleccionado.",
                    };
                }

                // Ventanas + eventos del día (excluye el propio idEvent)
                const [businessHours, workerHoursMap, temporaryHoursMap, overlapping] =
                    await Promise.all([
                        businessHoursService.getBusinessHoursFromRedis(
                            idCompany,
                            idWorkspace
                        ),
                        workerHoursService.getWorkerHoursFromRedis(
                            allUserIds,
                            idWorkspace
                        ),
                        temporaryHoursService.getTemporaryHoursFromRedis(
                            allUserIds,
                            idWorkspace,
                            { date: dateWS }
                        ),
                        getEventsOverlappingRange_SPECIAL(
                            idWorkspace,
                            allUserIds,
                            dateWS,
                            dateWS,
                            idEvent
                        ),
                    ]);

                const events = (overlapping || []).filter(
                    (ev: any) => !originalIds.has(ev.id)
                );
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
                        else if (
                            Array.isArray(workerDay) &&
                            workerDay.length > 0
                        )
                            workShifts = workerDay;
                        else workShifts = bizShifts;
                    }
                    shiftsByUserLocal[uid] = (workShifts || []).map(([s, e]) => ({
                        start: moment.tz(
                            `${dateWS}T${s}`,
                            "YYYY-MM-DDTHH:mm:ss",
                            timeZoneWorkspace
                        ),
                        end: moment.tz(
                            `${dateWS}T${e}`,
                            "YYYY-MM-DDTHH:mm:ss",
                            timeZoneWorkspace
                        ),
                    }));
                }

                const freeWindowsByUser: Record<string, MM[]> = {};
                for (const uid of allUserIds) {
                    const busy = (eventsByUser[uid] || []).map((ev: any) => ({
                        start: moment(ev.startDate).tz(timeZoneWorkspace),
                        end: moment(ev.endDate).tz(timeZoneWorkspace),
                    }));
                    const raw = shiftsByUserLocal[uid] || [];
                    const free: MM[] = [];
                    for (const sh of raw) {
                        const startClamped = isToday
                            ? moment.max(sh.start, roundedNow)
                            : sh.start.clone();
                        if (!startClamped.isBefore(sh.end)) continue;
                        free.push(
                            ...subtractBusyFromShift_SPECIAL(
                                startClamped,
                                sh.end,
                                busy
                            )
                        );
                    }
                    freeWindowsByUser[uid] =
                        mergeTouchingWindows_SPECIAL(free);
                }

                const dur = svcReq.durationMin ?? (svcSnap.duration ?? 0);
                const endWS = startWS.clone().add(dur, "minutes");

                const eligAvail = (userIdsByService.get(svcReq.serviceId) ?? []).filter(
                    (uid) =>
                        (freeWindowsByUser[uid] ?? []).some(
                            (w) =>
                                startWS.isSameOrAfter(w.start) &&
                                endWS.isSameOrBefore(w.end)
                        )
                );
                if (!eligAvail.length) {
                    console.log(
                        CONSOLE_COLOR.BgRed,
                        "[update][single] Ningún pro disponible para el slot",
                        CONSOLE_COLOR.Reset
                    );
                    return {
                        ok: false as const,
                        code: "BOOKING_ERR_NO_AVAILABLE_WINDOW",
                        message:
                            "Ningún profesional tiene ese hueco disponible.",
                    };
                }

                const chosen = await this.chooseStaffWithRR(
                    idWorkspace,
                    undefined,
                    svcReq.serviceId,
                    startWS.toDate(),
                    endWS.toDate(),
                    eligAvail,
                    weightsMap
                );
                if (!chosen) {
                    console.log(
                        CONSOLE_COLOR.BgRed,
                        "[update][single] RR no pudo elegir pro",
                        CONSOLE_COLOR.Reset
                    );
                    return {
                        ok: false as const,
                        code: "BOOKING_ERR_RR_NO_CANDIDATE",
                        message:
                            "No se pudo seleccionar un profesional para el slot.",
                    };
                }

                const seg = {
                    serviceId: svcReq.serviceId,
                    userId: chosen,
                    start: startWS.clone().seconds(0).milliseconds(0),
                    end: endWS.clone().seconds(0).milliseconds(0),
                };

                // ───── TX: UPDATE IN PLACE (y NO tocamos participants ni deletedDate) ─────
                const { updatedEvent } = await prisma.$transaction(async (tx) => {
                    // Solape definitivo (excluye el propio id)
                    const overlapping = await tx.event.findFirst({
                        where: {
                            idWorkspaceFk: idWorkspace,
                            idUserPlatformFk: seg.userId,
                            startDate: { lt: seg.end.toDate() },
                            endDate: { gt: seg.start.toDate() },
                            deletedDate: null,
                            NOT: { id: original.id },
                        },
                        select: { id: true },
                    });
                    if (overlapping) {
                        throw new Error(
                            "Ese profesional ya tiene otro evento en ese horario."
                        );
                    }

                    const ev = await tx.event.update({
                        where: { id: original.id },
                        data: {
                            idServiceFk: seg.serviceId,
                            idUserPlatformFk: seg.userId,
                            startDate: seg.start.toDate(),
                            endDate: seg.end.toDate(),

                            commentClient: note ?? null,
                            isCommentRead: isCommentRead ?? false,
                            timeZone: timeZoneWorkspace,
                            eventPurposeType: "APPOINTMENT",
                            // snapshots
                            serviceNameSnapshot:
                                serviceById[seg.serviceId]?.name ?? null,
                            servicePriceSnapshot:
                                typeof serviceById[seg.serviceId]?.price ===
                                    "number"
                                    ? serviceById[seg.serviceId]!.price!
                                    : null,
                            serviceDiscountSnapshot:
                                typeof serviceById[seg.serviceId]?.discount ===
                                    "number"
                                    ? serviceById[seg.serviceId]!.discount!
                                    : null,
                            serviceDurationSnapshot:
                                typeof serviceById[seg.serviceId]?.duration ===
                                    "number"
                                    ? serviceById[seg.serviceId]!.duration!
                                    : null,
                            serviceMaxParticipantsSnapshot:
                                typeof serviceById[seg.serviceId]
                                    ?.maxParticipants === "number"
                                    ? serviceById[seg.serviceId]!.maxParticipants!
                                    : null,
                            idGroup: groupId,
                        },
                    });

                    return { updatedEvent: ev };
                });

                return {
                    ok: true as const,
                    outcome: "updated_in_place",
                    fromEventId: original.id,
                    notification: {
                        idBooking: bookingId,
                        type: "single-service" as const,
                    },
                    appointment: {
                        startLocalISO: startWS
                            .clone()
                            .tz(timeZoneClient)
                            .format("YYYY-MM-DDTHH:mm:ss"),
                        endLocalISO: endWS
                            .clone()
                            .tz(timeZoneClient)
                            .format("YYYY-MM-DDTHH:mm:ss"),
                        timeZoneClient,
                        timeZoneWorkspace,
                        totalDurationMin: dur,
                    },
                    assignments: [
                        {
                            serviceId: seg.serviceId,
                            userId: seg.userId,
                            startUTC: seg.start.toISOString(),
                            endUTC: seg.end.toISOString(),
                            startLocalClient: seg.start
                                .clone()
                                .tz(timeZoneClient)
                                .format("YYYY-MM-DDTHH:mm:ss"),
                            endLocalClient: seg.end
                                .clone()
                                .tz(timeZoneClient)
                                .format("YYYY-MM-DDTHH:mm:ss"),
                        },
                    ],
                    created: [],
                    updated: [updatedEvent],
                    deleted: [],
                };
            }

            // ───────────── Ruta MULTI-SERVICIO (secuencial) ─────────────
            if (attendees.length > maxPerBooking) {
                throw new Error(`Máximo ${maxPerBooking} servicios por reserva`);
            }

            // Resolver elegibles por servicio
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
            const allUserIds = Array.from(
                new Set(Array.from(userIdsByService.values()).flat())
            );
            if (!allUserIds.length) {
                console.log(
                    CONSOLE_COLOR.BgRed,
                    "[update][multi] No hay profesionales elegibles",
                    CONSOLE_COLOR.Reset
                );
                return {
                    ok: false as const,
                    code: "BOOKING_ERR_NO_ELIGIBLE_STAFF",
                    message:
                        "No hay profesionales elegibles para los servicios seleccionados.",
                };
            }

            // Ventanas + eventos en paralelo
            const [businessHours, workerHoursMap, temporaryHoursMap, overlapping] =
                await Promise.all([
                    businessHoursService.getBusinessHoursFromRedis(
                        idCompany,
                        idWorkspace
                    ),
                    workerHoursService.getWorkerHoursFromRedis(
                        allUserIds,
                        idWorkspace
                    ),
                    temporaryHoursService.getTemporaryHoursFromRedis(
                        allUserIds,
                        idWorkspace,
                        { date: dateWS }
                    ),
                    getEventsOverlappingRange_SPECIAL(
                        idWorkspace,
                        allUserIds,
                        dateWS,
                        dateWS,
                        undefined
                    ),
                ]);

            // Excluir TODO el grupo original y cualquier explicit delete del cálculo de ocupación
            const toIgnore = new Set([...originalIds, ...explicitDeletes]);
            const events = (overlapping || []).filter(
                (ev: any) => !toIgnore.has(ev.id)
            );
            const eventsByUser = groupEventsByUser_SPECIAL(events);

            type MM2 = { start: moment.Moment; end: moment.Moment };
            const weekDay2 = startWS.format("dddd").toUpperCase() as any;
            const bizShifts2: string[][] = (() => {
                const biz = (businessHours as any)?.[weekDay2];
                return biz === null ? [] : Array.isArray(biz) ? biz : [];
            })();

            const shiftsByUserLocal2: Record<string, MM2[]> = {};
            for (const uid of allUserIds) {
                let workShifts: string[][] = [];
                const tmp = (temporaryHoursMap as any)?.[uid]?.[dateWS];
                if (tmp === null) workShifts = [];
                else if (Array.isArray(tmp) && tmp.length > 0) workShifts = tmp;
                else {
                    const workerDay = (workerHoursMap as any)?.[uid]?.[weekDay2];
                    if (workerDay === null) workShifts = [];
                    else if (Array.isArray(workerDay) && workerDay.length > 0)
                        workShifts = workerDay;
                    else workShifts = bizShifts2;
                }
                shiftsByUserLocal2[uid] = (workShifts || []).map(([s, e]) => ({
                    start: moment.tz(
                        `${dateWS}T${s}`,
                        "YYYY-MM-DDTHH:mm:ss",
                        timeZoneWorkspace
                    ),
                    end: moment.tz(
                        `${dateWS}T${e}`,
                        "YYYY-MM-DDTHH:mm:ss",
                        timeZoneWorkspace
                    ),
                }));
            }

            const freeWindowsByUser2: Record<string, MM2[]> = {};
            for (const uid of allUserIds) {
                const busy = (eventsByUser[uid] || []).map((ev: any) => ({
                    start: moment(ev.startDate).tz(timeZoneWorkspace),
                    end: moment(ev.endDate).tz(timeZoneWorkspace),
                }));
                const raw = shiftsByUserLocal2[uid] || [];
                const free: MM2[] = [];
                for (const sh of raw) {
                    const startClamped = isToday
                        ? moment.max(sh.start, roundedNow)
                        : sh.start.clone();
                    if (!startClamped.isBefore(sh.end)) continue;
                    free.push(
                        ...subtractBusyFromShift_SPECIAL(
                            startClamped,
                            sh.end,
                            busy
                        )
                    );
                }
                freeWindowsByUser2[uid] = mergeTouchingWindows_SPECIAL(free);
            }

            // Plan secuencial de segmentos
            type Seg = {
                serviceId: string;
                userId: string;
                start: moment.Moment;
                end: moment.Moment;
            };
            let cursor = startWS.clone();
            const chosenSegments: Seg[] = [];
            for (const a of attendees) {
                const snap = serviceById[a.serviceId];
                if (!snap) throw new Error("Servicio no disponible");
                const dur = a.durationMin ?? (snap.duration ?? 0);
                const segStart = cursor.clone().seconds(0).milliseconds(0);
                const segEnd = cursor.clone().add(dur, "minutes").seconds(0).milliseconds(0);

                const eligAvail = (userIdsByService.get(a.serviceId) ?? []).filter(
                    (uid) =>
                        (freeWindowsByUser2[uid] ?? []).some(
                            (w) =>
                                segStart.isSameOrAfter(w.start) &&
                                segEnd.isSameOrBefore(w.end)
                        )
                );
                if (!eligAvail.length) {
                    console.log(
                        CONSOLE_COLOR.BgRed,
                        "[update][multi] No encaja un segmento",
                        { serviceId: a.serviceId },
                        CONSOLE_COLOR.Reset
                    );
                    return {
                        ok: false as const,
                        code: "BOOKING_ERR_MULTI_SEGMENT_DOES_NOT_FIT",
                        message:
                            "Un segmento no encuentra hueco disponible en la secuencia.",
                    };
                }

                const chosen = await this.chooseStaffWithRR(
                    idWorkspace,
                    undefined,
                    a.serviceId,
                    segStart.toDate(),
                    segEnd.toDate(),
                    eligAvail,
                    weightsMap
                );
                if (!chosen) {
                    console.log(
                        CONSOLE_COLOR.BgRed,
                        "[update][multi] RR no pudo elegir pro",
                        CONSOLE_COLOR.Reset
                    );
                    return {
                        ok: false as const,
                        code: "BOOKING_ERR_MULTI_RR_NO_CANDIDATE",
                        message:
                            "No se pudo seleccionar profesional para uno de los segmentos.",
                    };
                }

                chosenSegments.push({
                    serviceId: a.serviceId,
                    userId: chosen,
                    start: segStart,
                    end: segEnd,
                });
                cursor = segEnd.clone();
            }

            // Diff contra originales (quitando los explicitDeletes de la lista de candidatos a update)
            const originalsKept = originalEvents.filter(
                (e) => !explicitDeletes.has(e.id)
            );
            const toUpdate = Math.min(originalsKept.length, chosenSegments.length);

            const totalDurationMin = chosenSegments.reduce(
                (acc, s) => acc + s.end.diff(s.start, "minutes"),
                0
            );
            const endWS = startWS.clone().add(totalDurationMin, "minutes");

            // ───── TX: aplicar UPDATE / CREATE / DELETE ─────
            const result = await prisma.$transaction(async (tx) => {
                // 1) anti-solape definitivo por cada seg planificado (excluye todo el grupo original)
                for (const seg of chosenSegments) {
                    const overlapping = await tx.event.findFirst({
                        where: {
                            idWorkspaceFk: idWorkspace,
                            idUserPlatformFk: seg.userId,
                            startDate: { lt: seg.end.toDate() },
                            endDate: { gt: seg.start.toDate() },
                            deletedDate: null,
                            NOT: { id: { in: Array.from(originalIds) } },
                        },
                        select: { id: true },
                    });
                    if (overlapping) {
                        throw new Error(
                            "Un profesional tiene otro evento en el horario planificado."
                        );
                    }
                }

                // 2) updates
                const updated: any[] = [];
                for (let i = 0; i < toUpdate; i++) {
                    const target = originalsKept[i];
                    const seg = chosenSegments[i];
                    const snap = serviceById[seg.serviceId];

                    const ev = await tx.event.update({
                        where: { id: target.id },
                        data: {
                            idServiceFk: seg.serviceId,
                            idUserPlatformFk: seg.userId,
                            startDate: seg.start.toDate(),
                            endDate: seg.end.toDate(),
                            timeZone: timeZoneWorkspace,

                            commentClient: note ?? null,
                            isCommentRead: isCommentRead ?? false,
                            eventPurposeType: "APPOINTMENT",
                            idGroup: groupId,
                            // snapshots
                            serviceNameSnapshot: snap?.name ?? null,
                            servicePriceSnapshot:
                                typeof snap?.price === "number" ? snap!.price! : null,
                            serviceDiscountSnapshot:
                                typeof snap?.discount === "number"
                                    ? snap!.discount!
                                    : null,
                            serviceDurationSnapshot:
                                typeof snap?.duration === "number"
                                    ? snap!.duration!
                                    : null,
                            serviceMaxParticipantsSnapshot:
                                typeof snap?.maxParticipants === "number"
                                    ? snap!.maxParticipants!
                                    : null,
                        },
                    });
                    updated.push(ev);
                }

                // 3) creates
                const created: any[] = [];
                for (let i = toUpdate; i < chosenSegments.length; i++) {
                    const seg = chosenSegments[i];
                    const snap = serviceById[seg.serviceId];
                    const ev = await tx.event.create({
                        data: {
                            title: snap?.name,
                            idCompanyFk: idCompany,
                            idWorkspaceFk: idWorkspace,
                            idServiceFk: seg.serviceId,
                            idUserPlatformFk: seg.userId,
                            startDate: seg.start.toDate(),
                            endDate: seg.end.toDate(),
                            timeZone: timeZoneWorkspace,
                            eventPurposeType: "APPOINTMENT",
                            idGroup: groupId,
                            commentClient: note ?? null,
                            isCommentRead: false,
                            // snapshots
                            serviceNameSnapshot: snap?.name ?? null,
                            servicePriceSnapshot:
                                typeof snap?.price === "number" ? snap!.price! : null,
                            serviceDiscountSnapshot:
                                typeof snap?.discount === "number"
                                    ? snap!.discount!
                                    : null,
                            serviceDurationSnapshot:
                                typeof snap?.duration === "number"
                                    ? snap!.duration!
                                    : null,
                            serviceMaxParticipantsSnapshot:
                                typeof snap?.maxParticipants === "number"
                                    ? snap!.maxParticipants!
                                    : null,
                            // description: note ?? null,
                        },
                    });

                    // Asegurar participación del cliente en el nuevo evento
                    await tx.eventParticipant.create({
                        data: {
                            idEventFk: ev.id,
                            idClientFk: customer.id,
                            idClientWorkspaceFk: customer.idClientWorkspace!,
                        },
                    });

                    created.push(ev);
                }

                // 4) deletes (explícitos + sobrantes)
                const toSoftDeleteIds = new Set<string>(explicitDeletes);
                for (let i = chosenSegments.length; i < originalsKept.length; i++) {
                    toSoftDeleteIds.add(originalsKept[i].id);
                }
                const deleted: string[] = [];
                if (toSoftDeleteIds.size) {
                    const now = new Date();
                    for (const id of toSoftDeleteIds) {
                        await tx.event.update({
                            where: { id },
                            data: { deletedDate: now },
                        });
                        deleted.push(id);
                    }
                }

                return { updated, created, deleted };
            });

            // ⬇️ tipo para notification según nº de segmentos tras el plan
            const notificationType =
                chosenSegments.length <= 1
                    ? ("single-service" as const)
                    : ("several-services" as const);

            return {
                ok: true as const,
                message: "Evento actualizado reconstruyendo segmentos.",
                code: "BOOKING_INFO_EVENT_REBUILT",
                notification: {
                    idBooking: bookingId,
                    type: notificationType,
                },
                item: {
                    outcome: "rebuild_group",
                    fromEventId: original.id,
                    appointment: {
                        startLocalISO: startWS
                            .clone()
                            .tz(timeZoneClient)
                            .format("YYYY-MM-DDTHH:mm:ss"),
                        endLocalISO: endWS
                            .clone()
                            .tz(timeZoneClient)
                            .format("YYYY-MM-DDTHH:mm:ss"),
                        timeZoneClient,
                        timeZoneWorkspace,
                        totalDurationMin: totalDurationMin,
                    },
                    assignments: chosenSegments.map((a) => ({
                        serviceId: a.serviceId,
                        userId: a.userId,
                        startUTC: a.start.toISOString(),
                        endUTC: a.end.toISOString(),
                        startLocalClient: a.start
                            .clone()
                            .tz(timeZoneClient)
                            .format("YYYY-MM-DDTHH:mm:ss"),
                        endLocalClient: a.end
                            .clone()
                            .tz(timeZoneClient)
                            .format("YYYY-MM-DDTHH:mm:ss"),
                    })),
                    ...result,
                },
            };
        } catch (error: any) {
            console.error(
                "Error en EventV2Service.updateEventFromWebBase:",
                error
            );
            throw new CustomError("Error al actualizar evento", error);
        }
    }


    private async _handlePureClassEdit(params: {
        idCompany: string;
        idWorkspace: string;
        timeZoneClient: string;
        timeZoneWorkspace: string;
        startWS: moment.Moment;
        attendees: any[];
        original: any;
        bookingId: string;
        groupId: string;
        serviceById: Record<string, any>;
        weightsMap: Record<string, number>;
        cache: any;
        customer: { id: string; idClientWorkspace: string };
        note?: string | null;
    }) {
        const {
            idCompany,
            idWorkspace,
            timeZoneClient,
            timeZoneWorkspace,
            startWS,
            attendees,
            original,
            bookingId,
            // groupId = es un id booking, general para todos los eventos. Se puede repetir en varios eventos (más de un servicio)
            // En clases nunca se repetirá porque las clases siempre son un servicio
            groupId, // ahora mismo no lo usamos, pero lo dejamos por si acaso
            serviceById,
            weightsMap,
            cache,
            customer,
            note,
        } = params;

        // Sólo 1 servicio (ya garantizado en isPureClassEdit)
        const svcReq = attendees[0];
        const svcSnap = serviceById[svcReq.serviceId];
        if (!svcSnap) throw new Error("Servicio no disponible en snapshot");

        const dur = svcReq.durationMin ?? (svcSnap.duration ?? 0);
        const endWS = startWS.clone().add(dur, "minutes");

        // Resolver profesionales elegibles
        const userIdsByService = new Map<string, string[]>();
        if (svcReq.staffId) {
            userIdsByService.set(svcReq.serviceId, [svcReq.staffId]);
        } else {
            const users = await getUsersWhoCanPerformService_SPECIAL(
                idWorkspace,
                svcReq.serviceId,
                svcReq.categoryId,
                cache
            );
            userIdsByService.set(svcReq.serviceId, users);
        }

        const allUserIds = Array.from(
            new Set(Array.from(userIdsByService.values()).flat())
        );
        if (!allUserIds.length) {
            return {
                ok: false as const,
                code: "BOOKING_ERR_NO_ELIGIBLE_STAFF",
                message: "No hay profesionales elegibles para el servicio seleccionado.",
            };
        }

        // Elegimos pro con RR (no recalculamos ventanas aquí, confiamos en que el slot viene validado)
        const eligAvail = allUserIds;
        const chosen = await this.chooseStaffWithRR(
            idWorkspace,
            undefined,
            svcReq.serviceId,
            startWS.toDate(),
            endWS.toDate(),
            eligAvail,
            weightsMap
        );
        if (!chosen) {
            return {
                ok: false as const,
                code: "BOOKING_ERR_RR_NO_CANDIDATE",
                message: "No se pudo seleccionar un profesional para el slot.",
            };
        }

        const seg = {
            serviceId: svcReq.serviceId,
            userId: chosen,
            start: startWS.clone().seconds(0).milliseconds(0),
            end: endWS.clone().seconds(0).milliseconds(0),
        };

        // ───────────────── TX: mover participación de la clase ─────────────────
        const { targetEvent, action, deletedEventIds } = await prisma.$transaction(
            async (tx) => {
                // Participantes activos actuales en esa clase
                const activeParticipants = await tx.eventParticipant.findMany({
                    where: { idEventFk: original.id, deletedDate: null },
                    select: {
                        id: true,
                        idClientFk: true,
                        idClientWorkspaceFk: true,
                    },
                });

                const mine = activeParticipants.filter(
                    (p) =>
                        (p.idClientFk && p.idClientFk === customer.id) ||
                        (p.idClientWorkspaceFk &&
                            p.idClientWorkspaceFk === customer.idClientWorkspace)
                );
                if (!mine.length) {
                    throw new Error(
                        "Este cliente no está asociado al evento original (class edit)."
                    );
                }

                const now = new Date();
                const deletedEventIds: string[] = [];

                if (activeParticipants.length === 1) {
                    // Solo este cliente estaba en la clase → podemos “mover” la sesión entera
                    await tx.event.update({
                        where: { id: original.id },
                        data: { deletedDate: now },
                    });
                    await tx.eventParticipant.updateMany({
                        where: { idEventFk: original.id, deletedDate: null },
                        data: { deletedDate: now },
                    });
                    deletedEventIds.push(original.id);
                } else {
                    // Hay más gente en la clase → solo sacamos a este cliente
                    await tx.eventParticipant.updateMany({
                        where: {
                            idEventFk: original.id,
                            deletedDate: null,
                            OR: [
                                { idClientFk: customer.id },
                                { idClientWorkspaceFk: customer.idClientWorkspace },
                            ],
                        },
                        data: { deletedDate: now },
                    });
                }

                // Crear o unirse a la nueva sesión de la misma clase
                // NOTA: En updates de clases, mantenemos el estado original del evento/participante
                // No aplicamos autoConfirmClientBookings aquí porque estamos MOVIENDO participación,
                // no creando una reserva nueva desde cero.
                const { event: targetEventRaw, action } =
                    await this.createOrJoinGroupEvent(tx, {
                        idCompany,
                        idWorkspace,
                        seg,
                        svc: {
                            id: svcSnap.id,
                            name: svcSnap.name,
                            price: svcSnap.price,
                            discount: svcSnap.discount,
                            duration: svcSnap.duration,
                            maxParticipants: svcSnap.maxParticipants,
                        },
                        timeZoneWorkspace,
                        note: note ?? null,
                        customer,
                        autoConfirmClientBookings: true, // Mantener estado ACCEPTED al mover participación
                    });

                // 🟢 Asegurar idGroup "booking code" también en la nueva sesión
                const targetEvent =
                    targetEventRaw?.idGroup === groupId
                        ? targetEventRaw
                        : await tx.event.update({
                            where: { id: targetEventRaw.id },
                            data: { idGroup: groupId },
                        });

                return { targetEvent, action, deletedEventIds };
            }
        );

        // ───────────────── Respuesta ─────────────────
        return {
            ok: true as const,
            outcome: "move_single_participant_in_class" as const,
            fromEventId: original.id,
            notification: {
                idBooking: bookingId,
                type: "single-service" as const,
            },
            appointment: {
                startLocalISO: seg.start
                    .clone()
                    .tz(timeZoneClient)
                    .format("YYYY-MM-DDTHH:mm:ss"),
                endLocalISO: seg.end
                    .clone()
                    .tz(timeZoneClient)
                    .format("YYYY-MM-DDTHH:mm:ss"),
                timeZoneClient,
                timeZoneWorkspace,
                totalDurationMin: dur,
            },
            assignments: [
                {
                    serviceId: seg.serviceId,
                    userId: seg.userId,
                    startUTC: seg.start.toISOString(),
                    endUTC: seg.end.toISOString(),
                    startLocalClient: seg.start
                        .clone()
                        .tz(timeZoneClient)
                        .format("YYYY-MM-DDTHH:mm:ss"),
                    endLocalClient: seg.end
                        .clone()
                        .tz(timeZoneClient)
                        .format("YYYY-MM-DDTHH:mm:ss"),
                },
            ],
            created: action === "created" ? [targetEvent] : [],
            updated:
                action === "joined" || action === "already-in"
                    ? [targetEvent]
                    : [],
            deleted: deletedEventIds,
        };
    }


    // private async updateEventFromWebBase(
    //     input: UpdateFromWebInput,
    //     deps: AddFromWebDeps,
    //     mode: UpdateMode
    // ) {
    //     try {
    //         const {
    //             idCompany,
    //             idWorkspace,
    //             timeZoneClient,
    //             startLocalISO,
    //             attendees,
    //             idEvent,
    //             note,
    //             customer,
    //             deletedEventIds = [], // NUEVO
    //         } = input;

    //         const {
    //             timeZoneWorkspace,
    //             businessHoursService,
    //             workerHoursService,
    //             temporaryHoursService,
    //             bookingConfig,
    //             cache,
    //         } = deps;

    //         console.log(
    //             CONSOLE_COLOR.FgMagenta,
    //             `[updateEventFromWebBase][${mode}] input:`,
    //             { ...input, attendeesLen: attendees?.length, deletedEventIdsLen: deletedEventIds?.length ?? 0 },
    //             CONSOLE_COLOR.Reset
    //         );

    //         // ───────────── Validaciones básicas ─────────────
    //         if (!idEvent) throw new Error("Falta idEvent");
    //         if (!idCompany || !idWorkspace) throw new Error("Faltan idCompany/idWorkspace");
    //         if (!timeZoneWorkspace) throw new Error("Falta timeZoneWorkspace");
    //         if (!timeZoneClient) throw new Error("Falta timeZoneClient");
    //         if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(startLocalISO))
    //             throw new Error("startLocalISO debe ser YYYY-MM-DDTHH:mm:ss");
    //         if (!Array.isArray(attendees) || attendees.length === 0)
    //             throw new Error("attendees vacío");
    //         if (!customer?.id) throw new Error("Falta customer.id");
    //         if (!customer?.idClientWorkspace) throw new Error("Falta customer.idClientWorkspace");

    //         const startClient = moment.tz(startLocalISO, "YYYY-MM-DDTHH:mm:ss", timeZoneClient);
    //         if (!startClient.isValid()) throw new Error("startLocalISO inválido");

    //         const startWS = startClient.clone().tz(timeZoneWorkspace);
    //         const dateWS = startWS.format("YYYY-MM-DD");

    //         // Día pasado
    //         const todayWS = moment().tz(timeZoneWorkspace).startOf("day");
    //         if (startWS.clone().startOf("day").isBefore(todayWS, "day")) {
    //             console.log(CONSOLE_COLOR.BgRed, "[updateEventFromWebBase] Día pasado en TZ workspace", CONSOLE_COLOR.Reset);
    //             return {
    //                 ok: false as const,
    //                 code: "BOOKING_ERR_DAY_IN_PAST",
    //                 message: "El día seleccionado ya ha pasado en la zona horaria del negocio."
    //             };
    //         }

    //         // Lead-time / hora pasada hoy
    //         const { roundedNow, isToday } = computeSlotConfig({
    //             intervalMinutes: 5,
    //             timeZoneWorkspace,
    //             dayStartLocal: startWS.clone().startOf("day"),
    //         });

    //         if (isToday && startWS.isBefore(roundedNow)) {
    //             console.log(CONSOLE_COLOR.BgRed, "[updateEventFromWebBase] Hora pasada en TZ workspace", CONSOLE_COLOR.Reset);
    //             return {
    //                 ok: false as const,
    //                 code: "BOOKING_ERR_TIME_PASSED",
    //                 message: "La hora seleccionada ya ha pasado hoy en la zona horaria del negocio."
    //             };
    //         }

    //         // ───────────── Evento original + grupo ─────────────
    //         const original = await prisma.event.findUnique({
    //             where: { id: idEvent },
    //             include: {
    //                 eventParticipant: {
    //                     where: { deletedDate: null },
    //                     select: { idClientFk: true, idClientWorkspaceFk: true },
    //                 },
    //             },
    //         });
    //         if (!original || original.deletedDate) throw new Error("Evento original no encontrado");
    //         if (original.idWorkspaceFk !== idWorkspace) throw new Error("El evento original no pertenece a este workspace");

    //         const isOwner = original.eventParticipant.some(
    //             (p) => p.idClientFk === customer.id || p.idClientWorkspaceFk === customer.idClientWorkspace
    //         );
    //         if (!isOwner) throw new Error("Este cliente no está asociado al evento original");

    //         // Detectar grupo
    //         const groupId = original.idGroup ?? original.id;
    //         const groupEvents = await prisma.event.findMany({
    //             where: { idWorkspaceFk: idWorkspace, idGroup: groupId, deletedDate: null },
    //             orderBy: { startDate: "asc" },
    //         });
    //         const originalEvents = groupEvents.length ? groupEvents : [original];
    //         const originalIds = new Set(originalEvents.map((e) => e.id));

    //         // Si se marca alguno para borrar explícitamente, lo eliminaremos en TX y lo excluimos de solapes
    //         const explicitDeletes = new Set(
    //             (deletedEventIds || []).filter((id) => originalIds.has(id))
    //         );

    //         // ───────────── Acceso rápido: single → single sin deletes ─────────────
    //         const maxPerBooking = bookingConfig?.limits?.maxServicesPerBooking ?? 5;
    //         const fastPathSingle =
    //             attendees.length === 1 &&
    //             originalEvents.length === 1 &&
    //             explicitDeletes.size === 0;

    //         // Cargamos snapshot de SOLO lo necesario en cada ruta
    //         const needServiceIds = [...new Set(attendees.map((a) => a.serviceId))];

    //         const [serviceById, weightsMap] = await Promise.all([
    //             _getServicesSnapshotById({ idCompany, idWorkspace, attendees }),
    //             (async () => {
    //                 const rawIds = Array.isArray(bookingConfig?.resources?.ids)
    //                     ? (bookingConfig!.resources!.ids as unknown as [string, number][])
    //                     : [];
    //                 return Object.fromEntries(rawIds.map(([id, w]) => [id, Number.isFinite(w) ? w : 100]));
    //             })(),
    //         ]);

    //         // Validar que no hay servicios grupales (pending)
    //         for (const sid of needServiceIds) {
    //             const snap = serviceById[sid];
    //             const capacity = Math.max(1, snap?.maxParticipants ?? 1);
    //             if (capacity > 1) {
    //                 throw new Error("Edición de servicios grupales (capacity>1) pendiente de implementar.");
    //             }
    //         }

    //         // ───────────── Ruta rápida SINGLE ─────────────
    //         if (fastPathSingle) {
    //             const svcReq = attendees[0];
    //             const svcSnap = serviceById[svcReq.serviceId];
    //             if (!svcSnap) throw new Error("Servicio no disponible en snapshot");

    //             const userIdsByService = new Map<string, string[]>();
    //             if (svcReq.staffId) {
    //                 userIdsByService.set(svcReq.serviceId, [svcReq.staffId]);
    //             } else {
    //                 const users = await getUsersWhoCanPerformService_SPECIAL(
    //                     idWorkspace,
    //                     svcReq.serviceId,
    //                     svcReq.categoryId,
    //                     cache
    //                 );
    //                 userIdsByService.set(svcReq.serviceId, users);
    //             }

    //             const allUserIds = Array.from(new Set(Array.from(userIdsByService.values()).flat()));
    //             if (!allUserIds.length) {
    //                 console.log(CONSOLE_COLOR.BgRed, "[update][single] No hay profesionales elegibles", CONSOLE_COLOR.Reset);
    //                 return {
    //                     ok: false as const,
    //                     code: "BOOKING_ERR_NO_ELIGIBLE_STAFF",
    //                     message: "No hay profesionales elegibles para el servicio seleccionado."
    //                 };
    //             }

    //             // Ventanas + eventos del día (excluye el propio idEvent)
    //             const [businessHours, workerHoursMap, temporaryHoursMap, overlapping] = await Promise.all([
    //                 businessHoursService.getBusinessHoursFromRedis(idCompany, idWorkspace),
    //                 workerHoursService.getWorkerHoursFromRedis(allUserIds, idWorkspace),
    //                 temporaryHoursService.getTemporaryHoursFromRedis(allUserIds, idWorkspace, { date: dateWS }),
    //                 getEventsOverlappingRange_SPECIAL(idWorkspace, allUserIds, dateWS, dateWS, idEvent),
    //             ]);

    //             const events = (overlapping || []).filter((ev: any) => !originalIds.has(ev.id));
    //             const eventsByUser = groupEventsByUser_SPECIAL(events);

    //             type MM = { start: moment.Moment; end: moment.Moment };
    //             const weekDay = startWS.format("dddd").toUpperCase() as any;
    //             const bizShifts: string[][] = (() => {
    //                 const biz = (businessHours as any)?.[weekDay];
    //                 return biz === null ? [] : Array.isArray(biz) ? biz : [];
    //             })();

    //             const shiftsByUserLocal: Record<string, MM[]> = {};
    //             for (const uid of allUserIds) {
    //                 let workShifts: string[][] = [];
    //                 const tmp = (temporaryHoursMap as any)?.[uid]?.[dateWS];
    //                 if (tmp === null) workShifts = [];
    //                 else if (Array.isArray(tmp) && tmp.length > 0) workShifts = tmp;
    //                 else {
    //                     const workerDay = (workerHoursMap as any)?.[uid]?.[weekDay];
    //                     if (workerDay === null) workShifts = [];
    //                     else if (Array.isArray(workerDay) && workerDay.length > 0) workShifts = workerDay;
    //                     else workShifts = bizShifts;
    //                 }
    //                 shiftsByUserLocal[uid] = (workShifts || []).map(([s, e]) => ({
    //                     start: moment.tz(`${dateWS}T${s}`, "YYYY-MM-DDTHH:mm:ss", timeZoneWorkspace),
    //                     end: moment.tz(`${dateWS}T${e}`, "YYYY-MM-DDTHH:mm:ss", timeZoneWorkspace),
    //                 }));
    //             }

    //             const freeWindowsByUser: Record<string, MM[]> = {};
    //             for (const uid of allUserIds) {
    //                 const busy = (eventsByUser[uid] || []).map((ev: any) => ({
    //                     start: moment(ev.startDate).tz(timeZoneWorkspace),
    //                     end: moment(ev.endDate).tz(timeZoneWorkspace),
    //                 }));
    //                 const raw = shiftsByUserLocal[uid] || [];
    //                 const free: MM[] = [];
    //                 for (const sh of raw) {
    //                     const startClamped = isToday ? moment.max(sh.start, roundedNow) : sh.start.clone();
    //                     if (!startClamped.isBefore(sh.end)) continue;
    //                     free.push(...subtractBusyFromShift_SPECIAL(startClamped, sh.end, busy));
    //                 }
    //                 freeWindowsByUser[uid] = mergeTouchingWindows_SPECIAL(free);
    //             }

    //             const dur = svcReq.durationMin ?? (svcSnap.duration ?? 0);
    //             const endWS = startWS.clone().add(dur, "minutes");

    //             const eligAvail = (userIdsByService.get(svcReq.serviceId) ?? []).filter((uid) =>
    //                 (freeWindowsByUser[uid] ?? []).some(
    //                     (w) => startWS.isSameOrAfter(w.start) && endWS.isSameOrBefore(w.end)
    //                 )
    //             );
    //             if (!eligAvail.length) {
    //                 console.log(CONSOLE_COLOR.BgRed, "[update][single] Ningún pro disponible para el slot", CONSOLE_COLOR.Reset);
    //                 return {
    //                     ok: false as const,
    //                     code: "BOOKING_ERR_NO_AVAILABLE_WINDOW",
    //                     message: "Ningún profesional tiene ese hueco disponible."
    //                 };
    //             }

    //             const chosen = await this.chooseStaffWithRR(
    //                 idWorkspace,
    //                 undefined,
    //                 svcReq.serviceId,
    //                 startWS.toDate(),
    //                 endWS.toDate(),
    //                 eligAvail,
    //                 weightsMap
    //             );
    //             if (!chosen) {
    //                 console.log(CONSOLE_COLOR.BgRed, "[update][single] RR no pudo elegir pro", CONSOLE_COLOR.Reset);
    //                 return {
    //                     ok: false as const,
    //                     code: "BOOKING_ERR_RR_NO_CANDIDATE",
    //                     message: "No se pudo seleccionar un profesional para el slot."
    //                 };
    //             }

    //             const seg = {
    //                 serviceId: svcReq.serviceId,
    //                 userId: chosen,
    //                 start: startWS.clone().seconds(0).milliseconds(0),
    //                 end: endWS.clone().seconds(0).milliseconds(0),
    //             };

    //             // ───── TX: UPDATE IN PLACE (y NO tocamos participants ni deletedDate) ─────
    //             const { updatedEvent } = await prisma.$transaction(async (tx) => {
    //                 // Solape definitivo (excluye el propio id)
    //                 const overlapping = await tx.event.findFirst({
    //                     where: {
    //                         idWorkspaceFk: idWorkspace,
    //                         idUserPlatformFk: seg.userId,
    //                         startDate: { lt: seg.end.toDate() },
    //                         endDate: { gt: seg.start.toDate() },
    //                         deletedDate: null,
    //                         NOT: { id: original.id },
    //                     },
    //                     select: { id: true },
    //                 });
    //                 if (overlapping) {
    //                     throw new Error("Ese profesional ya tiene otro evento en ese horario.");
    //                 }

    //                 const ev = await tx.event.update({
    //                     where: { id: original.id },
    //                     data: {
    //                         idServiceFk: seg.serviceId,
    //                         idUserPlatformFk: seg.userId,
    //                         startDate: seg.start.toDate(),
    //                         endDate: seg.end.toDate(),
    //                         description: note ?? null,
    //                         timeZone: timeZoneWorkspace,
    //                         eventPurposeType: "APPOINTMENT",
    //                         // snapshots
    //                         serviceNameSnapshot: serviceById[seg.serviceId]?.name ?? null,
    //                         servicePriceSnapshot: typeof serviceById[seg.serviceId]?.price === "number" ? serviceById[seg.serviceId]!.price! : null,
    //                         serviceDiscountSnapshot: typeof serviceById[seg.serviceId]?.discount === "number" ? serviceById[seg.serviceId]!.discount! : null,
    //                         serviceDurationSnapshot: typeof serviceById[seg.serviceId]?.duration === "number" ? serviceById[seg.serviceId]!.duration! : null,
    //                         idGroup: groupId,
    //                     },
    //                 });

    //                 return { updatedEvent: ev };
    //             });

    //             return {
    //                 ok: true as const,
    //                 outcome: "updated_in_place",
    //                 fromEventId: original.id,
    //                 appointment: {
    //                     startLocalISO: startWS.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
    //                     endLocalISO: endWS.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
    //                     timeZoneClient,
    //                     timeZoneWorkspace,
    //                     totalDurationMin: dur,
    //                 },
    //                 assignments: [
    //                     {
    //                         serviceId: seg.serviceId,
    //                         userId: seg.userId,
    //                         startUTC: seg.start.toISOString(),
    //                         endUTC: seg.end.toISOString(),
    //                         startLocalClient: seg.start.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
    //                         endLocalClient: seg.end.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
    //                     },
    //                 ],
    //                 created: [],
    //                 updated: [updatedEvent],
    //                 deleted: [],
    //             };
    //         }

    //         // ───────────── Ruta MULTI-SERVICIO (secuencial) ─────────────
    //         if (attendees.length > maxPerBooking) {
    //             throw new Error(`Máximo ${maxPerBooking} servicios por reserva`);
    //         }

    //         // Resolver elegibles por servicio
    //         const userIdsByService = new Map<string, string[]>();
    //         for (const a of attendees) {
    //             if (a.staffId) {
    //                 userIdsByService.set(a.serviceId, [a.staffId]);
    //             } else {
    //                 const users = await getUsersWhoCanPerformService_SPECIAL(
    //                     idWorkspace,
    //                     a.serviceId,
    //                     a.categoryId,
    //                     cache
    //                 );
    //                 userIdsByService.set(a.serviceId, users);
    //             }
    //         }
    //         const allUserIds = Array.from(new Set(Array.from(userIdsByService.values()).flat()));
    //         if (!allUserIds.length) {
    //             console.log(CONSOLE_COLOR.BgRed, "[update][multi] No hay profesionales elegibles", CONSOLE_COLOR.Reset);
    //             return {
    //                 ok: false as const,
    //                 code: "BOOKING_ERR_NO_ELIGIBLE_STAFF",
    //                 message: "No hay profesionales elegibles para los servicios seleccionados."
    //             };
    //         }

    //         // Ventanas + eventos en paralelo
    //         const [businessHours, workerHoursMap, temporaryHoursMap, overlapping] = await Promise.all([
    //             businessHoursService.getBusinessHoursFromRedis(idCompany, idWorkspace),
    //             workerHoursService.getWorkerHoursFromRedis(allUserIds, idWorkspace),
    //             temporaryHoursService.getTemporaryHoursFromRedis(allUserIds, idWorkspace, { date: dateWS }),
    //             getEventsOverlappingRange_SPECIAL(idWorkspace, allUserIds, dateWS, dateWS, undefined),
    //         ]);

    //         // Excluir TODO el grupo original y cualquier explicit delete del cálculo de ocupación
    //         const toIgnore = new Set([...originalIds, ...explicitDeletes]);
    //         const events = (overlapping || []).filter((ev: any) => !toIgnore.has(ev.id));
    //         const eventsByUser = groupEventsByUser_SPECIAL(events);

    //         type MM = { start: moment.Moment; end: moment.Moment };
    //         const weekDay = startWS.format("dddd").toUpperCase() as any;
    //         const bizShifts: string[][] = (() => {
    //             const biz = (businessHours as any)?.[weekDay];
    //             return biz === null ? [] : Array.isArray(biz) ? biz : [];
    //         })();

    //         const shiftsByUserLocal: Record<string, MM[]> = {};
    //         for (const uid of allUserIds) {
    //             let workShifts: string[][] = [];
    //             const tmp = (temporaryHoursMap as any)?.[uid]?.[dateWS];
    //             if (tmp === null) workShifts = [];
    //             else if (Array.isArray(tmp) && tmp.length > 0) workShifts = tmp;
    //             else {
    //                 const workerDay = (workerHoursMap as any)?.[uid]?.[weekDay];
    //                 if (workerDay === null) workShifts = [];
    //                 else if (Array.isArray(workerDay) && workerDay.length > 0) workShifts = workerDay;
    //                 else workShifts = bizShifts;
    //             }
    //             shiftsByUserLocal[uid] = (workShifts || []).map(([s, e]) => ({
    //                 start: moment.tz(`${dateWS}T${s}`, "YYYY-MM-DDTHH:mm:ss", timeZoneWorkspace),
    //                 end: moment.tz(`${dateWS}T${e}`, "YYYY-MM-DDTHH:mm:ss", timeZoneWorkspace),
    //             }));
    //         }

    //         const freeWindowsByUser: Record<string, MM[]> = {};
    //         for (const uid of allUserIds) {
    //             const busy = (eventsByUser[uid] || []).map((ev: any) => ({
    //                 start: moment(ev.startDate).tz(timeZoneWorkspace),
    //                 end: moment(ev.endDate).tz(timeZoneWorkspace),
    //             }));
    //             const raw = shiftsByUserLocal[uid] || [];
    //             const free: MM[] = [];
    //             for (const sh of raw) {
    //                 const startClamped = isToday ? moment.max(sh.start, roundedNow) : sh.start.clone();
    //                 if (!startClamped.isBefore(sh.end)) continue;
    //                 free.push(...subtractBusyFromShift_SPECIAL(startClamped, sh.end, busy));
    //             }
    //             freeWindowsByUser[uid] = mergeTouchingWindows_SPECIAL(free);
    //         }

    //         // Plan secuencial de segmentos
    //         type Seg = { serviceId: string; userId: string; start: moment.Moment; end: moment.Moment };
    //         let cursor = startWS.clone();
    //         const chosenSegments: Seg[] = [];
    //         for (const a of attendees) {
    //             const snap = serviceById[a.serviceId];
    //             if (!snap) throw new Error("Servicio no disponible");
    //             const dur = a.durationMin ?? (snap.duration ?? 0);
    //             const segStart = cursor.clone().seconds(0).milliseconds(0);
    //             const segEnd = cursor.clone().add(dur, "minutes").seconds(0).milliseconds(0);

    //             const eligAvail = (userIdsByService.get(a.serviceId) ?? []).filter((uid) =>
    //                 (freeWindowsByUser[uid] ?? []).some(
    //                     (w) => segStart.isSameOrAfter(w.start) && segEnd.isSameOrBefore(w.end)
    //                 )
    //             );
    //             if (!eligAvail.length) {
    //                 console.log(CONSOLE_COLOR.BgRed, "[update][multi] No encaja un segmento", { serviceId: a.serviceId }, CONSOLE_COLOR.Reset);
    //                 return {
    //                     ok: false as const,
    //                     code: "BOOKING_ERR_MULTI_SEGMENT_DOES_NOT_FIT",
    //                     message: "Un segmento no encuentra hueco disponible en la secuencia."
    //                 };
    //             }

    //             const chosen = await this.chooseStaffWithRR(
    //                 idWorkspace,
    //                 undefined,
    //                 a.serviceId,
    //                 segStart.toDate(),
    //                 segEnd.toDate(),
    //                 eligAvail,
    //                 weightsMap
    //             );
    //             if (!chosen) {
    //                 console.log(CONSOLE_COLOR.BgRed, "[update][multi] RR no pudo elegir pro", CONSOLE_COLOR.Reset);
    //                 return {
    //                     ok: false as const,
    //                     code: "BOOKING_ERR_MULTI_RR_NO_CANDIDATE",
    //                     message: "No se pudo seleccionar profesional para uno de los segmentos."
    //                 };
    //             }

    //             chosenSegments.push({ serviceId: a.serviceId, userId: chosen, start: segStart, end: segEnd });
    //             cursor = segEnd.clone();
    //         }

    //         // Diff contra originales (quitando los explicitDeletes de la lista de candidatos a update)
    //         const originalsKept = originalEvents.filter((e) => !explicitDeletes.has(e.id));
    //         const toUpdate = Math.min(originalsKept.length, chosenSegments.length);

    //         const totalDurationMin = chosenSegments.reduce((acc, s) => acc + s.end.diff(s.start, "minutes"), 0);
    //         const endWS = startWS.clone().add(totalDurationMin, "minutes");

    //         // ───── TX: aplicar UPDATE / CREATE / DELETE ─────
    //         const result = await prisma.$transaction(async (tx) => {
    //             // 1) anti-solape definitivo por cada seg planificado (excluye todo el grupo original)
    //             for (const seg of chosenSegments) {
    //                 const overlapping = await tx.event.findFirst({
    //                     where: {
    //                         idWorkspaceFk: idWorkspace,
    //                         idUserPlatformFk: seg.userId,
    //                         startDate: { lt: seg.end.toDate() },
    //                         endDate: { gt: seg.start.toDate() },
    //                         deletedDate: null,
    //                         NOT: { id: { in: Array.from(originalIds) } },
    //                     },
    //                     select: { id: true },
    //                 });
    //                 if (overlapping) {
    //                     throw new Error("Un profesional tiene otro evento en el horario planificado.");
    //                 }
    //             }

    //             // 2) updates
    //             const updated: any[] = [];
    //             for (let i = 0; i < toUpdate; i++) {
    //                 const target = originalsKept[i];
    //                 const seg = chosenSegments[i];
    //                 const snap = serviceById[seg.serviceId];

    //                 const ev = await tx.event.update({
    //                     where: { id: target.id },
    //                     data: {
    //                         idServiceFk: seg.serviceId,
    //                         idUserPlatformFk: seg.userId,
    //                         startDate: seg.start.toDate(),
    //                         endDate: seg.end.toDate(),
    //                         timeZone: timeZoneWorkspace,
    //                         description: note ?? null,
    //                         eventPurposeType: "APPOINTMENT",
    //                         idGroup: groupId,
    //                         // snapshots
    //                         serviceNameSnapshot: snap?.name ?? null,
    //                         servicePriceSnapshot: typeof snap?.price === "number" ? snap!.price! : null,
    //                         serviceDiscountSnapshot: typeof snap?.discount === "number" ? snap!.discount! : null,
    //                         serviceDurationSnapshot: typeof snap?.duration === "number" ? snap!.duration! : null,
    //                     },
    //                 });
    //                 updated.push(ev);
    //             }

    //             // 3) creates
    //             const created: any[] = [];
    //             for (let i = toUpdate; i < chosenSegments.length; i++) {
    //                 const seg = chosenSegments[i];
    //                 const snap = serviceById[seg.serviceId];
    //                 const ev = await tx.event.create({
    //                     data: {
    //                         title: snap?.name,
    //                         idCompanyFk: idCompany,
    //                         idWorkspaceFk: idWorkspace,
    //                         idServiceFk: seg.serviceId,
    //                         idUserPlatformFk: seg.userId,
    //                         startDate: seg.start.toDate(),
    //                         endDate: seg.end.toDate(),
    //                         timeZone: timeZoneWorkspace,
    //                         eventPurposeType: "APPOINTMENT",
    //                         idGroup: groupId,
    //                         // snapshots
    //                         serviceNameSnapshot: snap?.name ?? null,
    //                         servicePriceSnapshot: typeof snap?.price === "number" ? snap!.price! : null,
    //                         serviceDiscountSnapshot: typeof snap?.discount === "number" ? snap!.discount! : null,
    //                         serviceDurationSnapshot: typeof snap?.duration === "number" ? snap!.duration! : null,
    //                         description: note ?? null,
    //                     },
    //                 });

    //                 // Asegurar participación del cliente en el nuevo evento
    //                 await tx.eventParticipant.create({
    //                     data: {
    //                         idEventFk: ev.id,
    //                         idClientFk: customer.id,
    //                         idClientWorkspaceFk: customer.idClientWorkspace!,
    //                     },
    //                 });

    //                 created.push(ev);
    //             }

    //             // 4) deletes (explícitos + sobrantes)
    //             const toSoftDeleteIds = new Set<string>(explicitDeletes);
    //             for (let i = chosenSegments.length; i < originalsKept.length; i++) {
    //                 toSoftDeleteIds.add(originalsKept[i].id);
    //             }
    //             const deleted: string[] = [];
    //             if (toSoftDeleteIds.size) {
    //                 const now = new Date();
    //                 for (const id of toSoftDeleteIds) {
    //                     await tx.event.update({ where: { id }, data: { deletedDate: now } });
    //                     deleted.push(id);
    //                 }
    //             }

    //             return { updated, created, deleted };
    //         });

    //         return {
    //             ok: true as const,
    //             message: "Evento actualizado reconstruyendo segmentos.",
    //             code: "BOOKING_INFO_EVENT_REBUILT",
    //             item: {
    //                 outcome: "rebuild_group",
    //                 fromEventId: original.id,
    //                 appointment: {
    //                     startLocalISO: startWS.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
    //                     endLocalISO: endWS.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
    //                     timeZoneClient,
    //                     timeZoneWorkspace,
    //                     totalDurationMin: totalDurationMin,
    //                 },
    //                 assignments: chosenSegments.map((a) => ({
    //                     serviceId: a.serviceId,
    //                     userId: a.userId,
    //                     startUTC: a.start.toISOString(),
    //                     endUTC: a.end.toISOString(),
    //                     startLocalClient: a.start.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
    //                     endLocalClient: a.end.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
    //                 })),
    //                 ...result,
    //             }
    //         };
    //     } catch (error: any) {
    //         console.error("Error en EventV2Service.updateEventFromWebBase:", error);
    //         throw new CustomError("Error al actualizar evento", error);
    //     }
    // }



    /**
     * Punto de entrada para actualizar citas individuales desde la web pública.
     */
    async updateSingleEventFromWeb(input: UpdateFromWebInput, deps: AddFromWebDeps) {
        console.log(`${CONSOLE_COLOR.FgCyan}[updateSingleEventFromWeb] input SINGLE:`, input, `${CONSOLE_COLOR.Reset}`);
        return this.updateEventFromWebBase(input, deps, "single");
    }

    /**
     * Punto de entrada para actualizar eventos grupales desde la web pública.
     * (Pendiente de implementar la lógica específica de grupos)
     */
    async updateGroupEventFromWeb(input: UpdateFromWebInput, deps: AddFromWebDeps) {
        console.log(`${CONSOLE_COLOR.FgCyan}[updateGroupEventFromWeb] input GROUP:`, input, `${CONSOLE_COLOR.Reset}`);
        // TODO: implementar lógica de actualización para eventos grupales:
        // - mover plaza de un grupo a otro
        // - controlar capacidad, etc.
        return this.updateEventFromWebBase(input, deps, "group");
    }

    //     /**
    //    * Base común para actualizar eventos desde la web pública.
    //    * mode = "single" → cita individual (implementado)
    //    * mode = "group"  → evento grupal (TODO)
    //    */
    //     private async updateEventFromWebBase(
    //         input: UpdateFromWebInput,
    //         deps: AddFromWebDeps,
    //         mode: UpdateMode
    //     ) {
    //         try {
    //             const {
    //                 idCompany,
    //                 idWorkspace,
    //                 timeZoneClient,
    //                 startLocalISO,
    //                 attendees,
    //                 idEvent,
    //                 note,
    //                 customer,
    //             } = input;

    //             const {
    //                 timeZoneWorkspace,
    //                 businessHoursService,
    //                 workerHoursService,
    //                 temporaryHoursService,
    //                 bookingConfig,
    //                 cache,
    //             } = deps;

    //             console.log(
    //                 CONSOLE_COLOR.FgMagenta,
    //                 `[updateEventFromWebBase][${mode}] input:`,
    //                 input,
    //                 CONSOLE_COLOR.Reset
    //             );

    //             // ───────────── Validaciones básicas ─────────────
    //             if (!idEvent) throw new Error("Falta idEvent");
    //             if (!idCompany || !idWorkspace) throw new Error("Faltan idCompany/idWorkspace");
    //             if (!timeZoneWorkspace) throw new Error("Falta timeZoneWorkspace");
    //             if (!timeZoneClient) throw new Error("Falta timeZoneClient");
    //             if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(startLocalISO))
    //                 throw new Error("startLocalISO debe ser YYYY-MM-DDTHH:mm:ss");
    //             if (!Array.isArray(attendees) || attendees.length === 0)
    //                 throw new Error("attendees vacío");
    //             if (!customer?.id) throw new Error("Falta customer.id");
    //             if (!customer?.idClientWorkspace)
    //                 throw new Error("Falta customer.idClientWorkspace");
    //             if (attendees.length !== 1) {
    //                 // Mantenerlo simple como en tu recorte
    //                 throw new Error("Update desde web solo soporta un servicio en esta versión.");
    //             }

    //             const startClient = moment.tz(
    //                 startLocalISO,
    //                 "YYYY-MM-DDTHH:mm:ss",
    //                 timeZoneClient
    //             );
    //             if (!startClient.isValid()) throw new Error("startLocalISO inválido");

    //             const startWS = startClient.clone().tz(timeZoneWorkspace);
    //             const dateWS = startWS.format("YYYY-MM-DD");

    //             // Día pasado
    //             const todayWS = moment().tz(timeZoneWorkspace).startOf("day");
    //             if (startWS.clone().startOf("day").isBefore(todayWS, "day")) {
    //                 console.log(
    //                     CONSOLE_COLOR.BgRed,
    //                     "[updateEventFromWebBase] Día pasado en TZ workspace",
    //                     CONSOLE_COLOR.Reset
    //                 );
    //                 return { ok: false };
    //             }

    //             // Lead-time / hora pasada hoy
    //             const { roundedNow, isToday } = computeSlotConfig({
    //                 intervalMinutes: 5,
    //                 timeZoneWorkspace,
    //                 dayStartLocal: startWS.clone().startOf("day"),
    //             });

    //             if (isToday && startWS.isBefore(roundedNow)) {
    //                 console.log(
    //                     CONSOLE_COLOR.BgRed,
    //                     "[updateEventFromWebBase] Hora pasada en TZ workspace",
    //                     CONSOLE_COLOR.Reset
    //                 );
    //                 return { ok: false };
    //             }

    //             // ───────────── Evento original (seguridad) ─────────────
    //             const originalEvent = await prisma.event.findUnique({
    //                 where: { id: idEvent },
    //                 include: {
    //                     eventParticipant: {
    //                         where: { deletedDate: null },
    //                         select: {
    //                             idClientFk: true,
    //                             idClientWorkspaceFk: true,
    //                         },
    //                     },
    //                 },
    //             });

    //             if (!originalEvent || originalEvent.deletedDate) {
    //                 throw new Error("Evento original no encontrado");
    //             }

    //             if (originalEvent.idWorkspaceFk !== idWorkspace) {
    //                 throw new Error("El evento original no pertenece a este workspace");
    //             }

    //             const isOwner = originalEvent.eventParticipant.some(
    //                 (p) =>
    //                     p.idClientFk === customer.id ||
    //                     p.idClientWorkspaceFk === customer.idClientWorkspace
    //             );

    //             if (!isOwner) {
    //                 throw new Error("Este cliente no está asociado al evento original");
    //             }

    //             // ───────────── 1) Quién puede hacer qué servicio ─────────────
    //             const svcReq = attendees[0];

    //             const userIdsByService = new Map<string, string[]>();
    //             if (svcReq.staffId) {
    //                 userIdsByService.set(svcReq.serviceId, [svcReq.staffId]);
    //             } else {
    //                 const users = await getUsersWhoCanPerformService_SPECIAL(
    //                     idWorkspace,
    //                     svcReq.serviceId,
    //                     svcReq.categoryId,
    //                     cache
    //                 );
    //                 userIdsByService.set(svcReq.serviceId, users);
    //             }

    //             const allUserIds = Array.from(
    //                 new Set(Array.from(userIdsByService.values()).flat())
    //             );

    //             if (!allUserIds.length) {
    //                 console.log(
    //                     CONSOLE_COLOR.BgRed,
    //                     "[updateEventFromWebBase] No hay profesionales elegibles",
    //                     CONSOLE_COLOR.Reset
    //                 );
    //                 return { ok: false };
    //             }

    //             // ───────────── 2) Ventanas + eventos + snapshot en paralelo ─────────────
    //             const [
    //                 businessHours,
    //                 workerHoursMap,
    //                 temporaryHoursMap,
    //                 events,
    //                 serviceById,
    //             ] = await Promise.all([
    //                 businessHoursService.getBusinessHoursFromRedis(idCompany, idWorkspace),
    //                 workerHoursService.getWorkerHoursFromRedis(allUserIds, idWorkspace),
    //                 temporaryHoursService.getTemporaryHoursFromRedis(
    //                     allUserIds,
    //                     idWorkspace,
    //                     { date: dateWS }
    //                 ),
    //                 // Excluimos el evento que estamos editando
    //                 getEventsOverlappingRange_SPECIAL(
    //                     idWorkspace,
    //                     allUserIds,
    //                     dateWS,
    //                     dateWS,
    //                     idEvent
    //                 ),
    //                 _getServicesSnapshotById({
    //                     idCompany,
    //                     idWorkspace,
    //                     attendees,
    //                 }),
    //             ]);

    //             const eventsByUser = groupEventsByUser_SPECIAL(events);

    //             type MM = { start: moment.Moment; end: moment.Moment };

    //             // Slots de negocio
    //             const weekDay = startWS.format("dddd").toUpperCase() as any;
    //             const bizShifts: string[][] = (() => {
    //                 const biz = (businessHours as any)?.[weekDay];
    //                 return biz === null ? [] : Array.isArray(biz) ? biz : [];
    //             })();

    //             // Shifts por user
    //             const shiftsByUserLocal: Record<string, MM[]> = {};
    //             for (const uid of allUserIds) {
    //                 let workShifts: string[][] = [];
    //                 const tmp = (temporaryHoursMap as any)?.[uid]?.[dateWS];

    //                 if (tmp === null) workShifts = [];
    //                 else if (Array.isArray(tmp) && tmp.length > 0) workShifts = tmp;
    //                 else {
    //                     const workerDay = (workerHoursMap as any)?.[uid]?.[weekDay];
    //                     if (workerDay === null) workShifts = [];
    //                     else if (Array.isArray(workerDay) && workerDay.length > 0)
    //                         workShifts = workerDay;
    //                     else workShifts = bizShifts;
    //                 }

    //                 shiftsByUserLocal[uid] = (workShifts || []).map(([s, e]) => ({
    //                     start: moment.tz(
    //                         `${dateWS}T${s}`,
    //                         "YYYY-MM-DDTHH:mm:ss",
    //                         timeZoneWorkspace
    //                     ),
    //                     end: moment.tz(
    //                         `${dateWS}T${e}`,
    //                         "YYYY-MM-DDTHH:mm:ss",
    //                         timeZoneWorkspace
    //                     ),
    //                 }));
    //             }

    //             // Free windows por user
    //             const freeWindowsByUser: Record<string, MM[]> = {};
    //             for (const uid of allUserIds) {
    //                 const busy = (eventsByUser[uid] || []).map((ev: any) => ({
    //                     start: moment(ev.startDate).tz(timeZoneWorkspace),
    //                     end: moment(ev.endDate).tz(timeZoneWorkspace),
    //                 }));

    //                 const raw = shiftsByUserLocal[uid] || [];
    //                 const free: MM[] = [];

    //                 for (const sh of raw) {
    //                     const startClamped = isToday
    //                         ? moment.max(sh.start, roundedNow)
    //                         : sh.start.clone();
    //                     if (!startClamped.isBefore(sh.end)) continue;
    //                     free.push(
    //                         ...subtractBusyFromShift_SPECIAL(startClamped, sh.end, busy)
    //                     );
    //                 }

    //                 freeWindowsByUser[uid] = mergeTouchingWindows_SPECIAL(free);
    //             }

    //             // ───────────── 3) Snapshot servicio y pesos RR ─────────────
    //             const svcSnap = serviceById[svcReq.serviceId];
    //             if (!svcSnap) throw new Error("Servicio no disponible en snapshot");

    //             const capacity = Math.max(1, svcSnap.maxParticipants ?? 1);

    //             // Pesos RR (0–100; default 100) desde bookingConfig.resources.ids
    //             const rawIds = Array.isArray(bookingConfig?.resources?.ids)
    //                 ? (bookingConfig!.resources!.ids as unknown as [string, number][])
    //                 : [];

    //             const weightsMap: Record<string, number> = Object.fromEntries(
    //                 rawIds.map(([id, w]) => [id, Number.isFinite(w) ? w : 100])
    //             );

    //             // Validación modo vs capacidad
    //             if (mode === "single" && capacity > 1) {
    //                 throw new Error("Servicio grupal usado en modo single.");
    //             }
    //             if (mode === "group" && capacity <= 1) {
    //                 throw new Error("Servicio individual usado en modo group.");
    //             }

    //             // ───────────── MODO SINGLE (implementado) ─────────────
    //             // ───────────── MODO SINGLE (edit-in-place) ─────────────
    //             if (mode === "single") {
    //                 const dur = svcReq.durationMin ?? (svcSnap.duration ?? 0);
    //                 const endWS = startWS.clone().add(dur, "minutes");

    //                 // Profes elegibles que tienen ese hueco libre
    //                 const eligAvail = (userIdsByService.get(svcReq.serviceId) ?? []).filter((uid) =>
    //                     (freeWindowsByUser[uid] ?? []).some(
    //                         (w) => startWS.isSameOrAfter(w.start) && endWS.isSameOrBefore(w.end)
    //                     )
    //                 );

    //                 if (!eligAvail.length) {
    //                     console.log(
    //                         CONSOLE_COLOR.BgRed,
    //                         "[updateEventFromWebBase][single] Ningún pro disponible para el nuevo slot",
    //                         CONSOLE_COLOR.Reset
    //                     );
    //                     return { ok: false };
    //                 }

    //                 const chosen = await this.chooseStaffWithRR(
    //                     idWorkspace,
    //                     undefined,
    //                     svcReq.serviceId,
    //                     startWS.toDate(),
    //                     endWS.toDate(),
    //                     eligAvail,
    //                     weightsMap
    //                 );

    //                 if (!chosen) {
    //                     console.log(
    //                         CONSOLE_COLOR.BgRed,
    //                         "[updateEventFromWebBase][single] RR no pudo elegir pro",
    //                         CONSOLE_COLOR.Reset
    //                     );
    //                     return { ok: false };
    //                 }

    //                 const seg = {
    //                     serviceId: svcReq.serviceId,
    //                     userId: chosen,
    //                     start: startWS.clone().seconds(0).milliseconds(0),
    //                     end: endWS.clone().seconds(0).milliseconds(0),
    //                 };

    //                 // ───── TX: ACTUALIZAR EN SITIO (NO borrar, NO tocar participants) ─────
    //                 const { updatedEvent } = await prisma.$transaction(async (tx) => {
    //                     const existing = await tx.event.findUnique({
    //                         where: { id: idEvent },
    //                         include: {
    //                             eventParticipant: {
    //                                 where: { deletedDate: null },
    //                                 select: { idClientFk: true, idClientWorkspaceFk: true },
    //                             },
    //                         },
    //                     });

    //                     if (!existing || existing.deletedDate) {
    //                         throw new Error("Evento original no encontrado (tx)");
    //                     }

    //                     // Seguridad extra (ya validado antes, pero dejamos aquí por si acaso)
    //                     if (existing.idWorkspaceFk !== idWorkspace) {
    //                         throw new Error("El evento original no pertenece a este workspace (tx)");
    //                     }

    //                     const mine = existing.eventParticipant.some(
    //                         (p) =>
    //                             p.idClientFk === customer.id ||
    //                             p.idClientWorkspaceFk === customer.idClientWorkspace
    //                     );
    //                     if (!mine) {
    //                         throw new Error("Cliente no asociado al evento original (tx)");
    //                     }

    //                     // Evitar autocolisión: excluye el propio evento del overlap check
    //                     const overlapping = await tx.event.findFirst({
    //                         where: {
    //                             idWorkspaceFk: idWorkspace,
    //                             idUserPlatformFk: seg.userId,
    //                             startDate: { lt: seg.end.toDate() },
    //                             endDate: { gt: seg.start.toDate() },
    //                             deletedDate: null,
    //                             NOT: { id: idEvent },
    //                         },
    //                         select: { id: true },
    //                     });
    //                     if (overlapping) {
    //                         throw new Error("Ese profesional ya tiene otro evento en ese horario.");
    //                     }

    //                     // Edita el mismo evento (mismo id). No tocamos participants ni deletedDate.
    //                     const ev = await tx.event.update({
    //                         where: { id: idEvent },
    //                         data: {
    //                             idServiceFk: seg.serviceId,
    //                             idUserPlatformFk: seg.userId,
    //                             startDate: seg.start.toDate(),
    //                             endDate: seg.end.toDate(),
    //                             description: note ?? null,
    //                             timeZone: timeZoneWorkspace,
    //                             eventPurposeType: "APPOINTMENT",
    //                             // Snapshots actualizados
    //                             serviceNameSnapshot: svcSnap.name ?? null,
    //                             servicePriceSnapshot:
    //                                 typeof svcSnap.price === "number" ? svcSnap.price : null,
    //                             serviceDiscountSnapshot:
    //                                 typeof svcSnap.discount === "number" ? svcSnap.discount : null,
    //                             serviceDurationSnapshot:
    //                                 typeof svcSnap.duration === "number" ? svcSnap.duration : null,
    //                         },
    //                     });

    //                     return { updatedEvent: ev };
    //                 });

    //                 // ───── Respuesta ─────
    //                 return {
    //                     ok: true as const,
    //                     outcome: "updated_in_place",
    //                     fromEventId: idEvent,
    //                     appointment: {
    //                         startLocalISO: startWS.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
    //                         endLocalISO: endWS.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
    //                         timeZoneClient,
    //                         timeZoneWorkspace,
    //                         totalDurationMin: dur,
    //                     },
    //                     assignments: [
    //                         {
    //                             serviceId: seg.serviceId,
    //                             userId: seg.userId,
    //                             startUTC: seg.start.toISOString(),
    //                             endUTC: seg.end.toISOString(),
    //                             startLocalClient: seg.start.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
    //                             endLocalClient: seg.end.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
    //                         },
    //                     ],
    //                     created: [],
    //                     updated: [updatedEvent],
    //                 };
    //             }


    //             // ───────────── MODO GROUP (stub) ─────────────
    //             if (mode === "group") {
    //                 // Aquí implementarás después:
    //                 // - Quitar la participación del cliente del evento grupal original (no tocar el grupo si hay más gente).
    //                 // - Intentar unirlo a otro evento grupal compatible usando createOrJoinGroupEvent.
    //                 // - O crear un nuevo evento grupal si la lógica de negocio lo permite.
    //                 throw new Error("updateEventFromWebBase (group) aún no está implementado.");
    //             }

    //             throw new Error("Modo de actualización no soportado.");
    //         } catch (error: any) {
    //             console.error(
    //                 "Error en EventV2Service.updateEventFromWebBase:",
    //                 error
    //             );
    //             throw new CustomError("Error al actualizar evento", error);
    //         }
    //     }

    // /**
    //  * Update de eventos desde la booking page (cliente).
    //  * - Ruta rápida para single-service.
    //  * - Ruta multi-service: reconstruye segmentos secuenciales y aplica diff (update/create/delete) con TX.
    //  * - Servicios grupales (capacity > 1) quedan pendientes (TODO).
    //  *
    //  * Requiere extender el tipo:
    //  * type UpdateFromWebInput = {
    //  *   ...
    //  *   deletedEventIds?: string[]; // <- NUEVO (opcional)
    //  * }
    //  */
    // private async updateEventFromWebBase(
    //     input: UpdateFromWebInput,
    //     deps: AddFromWebDeps,
    //     mode: UpdateMode
    // ) {
    //     try {
    //         const {
    //             idCompany,
    //             idWorkspace,
    //             timeZoneClient,
    //             startLocalISO,
    //             attendees,
    //             idEvent,
    //             note,
    //             customer,
    //             deletedEventIds = [], // NUEVO
    //         } = input;

    //         const {
    //             timeZoneWorkspace,
    //             businessHoursService,
    //             workerHoursService,
    //             temporaryHoursService,
    //             bookingConfig,
    //             cache,
    //         } = deps;

    //         console.log(
    //             CONSOLE_COLOR.FgMagenta,
    //             `[updateEventFromWebBase][${mode}] input:`,
    //             { ...input, attendeesLen: attendees?.length, deletedEventIdsLen: deletedEventIds?.length ?? 0 },
    //             CONSOLE_COLOR.Reset
    //         );

    //         // ───────────── Validaciones básicas ─────────────
    //         if (!idEvent) throw new Error("Falta idEvent");
    //         if (!idCompany || !idWorkspace) throw new Error("Faltan idCompany/idWorkspace");
    //         if (!timeZoneWorkspace) throw new Error("Falta timeZoneWorkspace");
    //         if (!timeZoneClient) throw new Error("Falta timeZoneClient");
    //         if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(startLocalISO))
    //             throw new Error("startLocalISO debe ser YYYY-MM-DDTHH:mm:ss");
    //         if (!Array.isArray(attendees) || attendees.length === 0)
    //             throw new Error("attendees vacío");
    //         if (!customer?.id) throw new Error("Falta customer.id");
    //         if (!customer?.idClientWorkspace) throw new Error("Falta customer.idClientWorkspace");

    //         const startClient = moment.tz(startLocalISO, "YYYY-MM-DDTHH:mm:ss", timeZoneClient);
    //         if (!startClient.isValid()) throw new Error("startLocalISO inválido");

    //         const startWS = startClient.clone().tz(timeZoneWorkspace);
    //         const dateWS = startWS.format("YYYY-MM-DD");

    //         // Día pasado
    //         const todayWS = moment().tz(timeZoneWorkspace).startOf("day");
    //         if (startWS.clone().startOf("day").isBefore(todayWS, "day")) {
    //             console.log(CONSOLE_COLOR.BgRed, "[updateEventFromWebBase] Día pasado en TZ workspace", CONSOLE_COLOR.Reset);
    //             return { ok: false };
    //         }

    //         // Lead-time / hora pasada hoy
    //         const { roundedNow, isToday } = computeSlotConfig({
    //             intervalMinutes: 5,
    //             timeZoneWorkspace,
    //             dayStartLocal: startWS.clone().startOf("day"),
    //         });

    //         if (isToday && startWS.isBefore(roundedNow)) {
    //             console.log(CONSOLE_COLOR.BgRed, "[updateEventFromWebBase] Hora pasada en TZ workspace", CONSOLE_COLOR.Reset);
    //             return { ok: false };
    //         }

    //         // ───────────── Evento original + grupo ─────────────
    //         const original = await prisma.event.findUnique({
    //             where: { id: idEvent },
    //             include: {
    //                 eventParticipant: {
    //                     where: { deletedDate: null },
    //                     select: { idClientFk: true, idClientWorkspaceFk: true },
    //                 },
    //             },
    //         });
    //         if (!original || original.deletedDate) throw new Error("Evento original no encontrado");
    //         if (original.idWorkspaceFk !== idWorkspace) throw new Error("El evento original no pertenece a este workspace");

    //         const isOwner = original.eventParticipant.some(
    //             (p) => p.idClientFk === customer.id || p.idClientWorkspaceFk === customer.idClientWorkspace
    //         );
    //         if (!isOwner) throw new Error("Este cliente no está asociado al evento original");

    //         // Detectar grupo
    //         const groupId = original.idGroup ?? original.id;
    //         const groupEvents = await prisma.event.findMany({
    //             where: { idWorkspaceFk: idWorkspace, idGroup: groupId, deletedDate: null },
    //             orderBy: { startDate: "asc" },
    //         });
    //         const originalEvents = groupEvents.length ? groupEvents : [original];
    //         const originalIds = new Set(originalEvents.map((e) => e.id));

    //         // Si se marca alguno para borrar explícitamente, lo eliminaremos en TX y lo excluimos de solapes
    //         const explicitDeletes = new Set(
    //             (deletedEventIds || []).filter((id) => originalIds.has(id))
    //         );

    //         // ───────────── Acceso rápido: single → single sin deletes ─────────────
    //         const maxPerBooking = bookingConfig?.limits?.maxServicesPerBooking ?? 5;
    //         const fastPathSingle =
    //             attendees.length === 1 &&
    //             originalEvents.length === 1 &&
    //             explicitDeletes.size === 0;

    //         // Cargamos snapshot de SOLO lo necesario en cada ruta
    //         const needServiceIds = [...new Set(attendees.map((a) => a.serviceId))];

    //         const [serviceById, weightsMap] = await Promise.all([
    //             _getServicesSnapshotById({ idCompany, idWorkspace, attendees }),
    //             (async () => {
    //                 const rawIds = Array.isArray(bookingConfig?.resources?.ids)
    //                     ? (bookingConfig!.resources!.ids as unknown as [string, number][])
    //                     : [];
    //                 return Object.fromEntries(rawIds.map(([id, w]) => [id, Number.isFinite(w) ? w : 100]));
    //             })(),
    //         ]);

    //         // Validar que no hay servicios grupales (pending)
    //         for (const sid of needServiceIds) {
    //             const snap = serviceById[sid];
    //             const capacity = Math.max(1, snap?.maxParticipants ?? 1);
    //             if (capacity > 1) {
    //                 throw new Error("Edición de servicios grupales (capacity>1) pendiente de implementar.");
    //             }
    //         }

    //         // ───────────── Ruta rápida SINGLE ─────────────
    //         if (fastPathSingle) {
    //             const svcReq = attendees[0];
    //             const svcSnap = serviceById[svcReq.serviceId];
    //             if (!svcSnap) throw new Error("Servicio no disponible en snapshot");

    //             const userIdsByService = new Map<string, string[]>();
    //             if (svcReq.staffId) {
    //                 userIdsByService.set(svcReq.serviceId, [svcReq.staffId]);
    //             } else {
    //                 const users = await getUsersWhoCanPerformService_SPECIAL(
    //                     idWorkspace,
    //                     svcReq.serviceId,
    //                     svcReq.categoryId,
    //                     cache
    //                 );
    //                 userIdsByService.set(svcReq.serviceId, users);
    //             }

    //             const allUserIds = Array.from(new Set(Array.from(userIdsByService.values()).flat()));
    //             if (!allUserIds.length) {
    //                 console.log(CONSOLE_COLOR.BgRed, "[update][single] No hay profesionales elegibles", CONSOLE_COLOR.Reset);
    //                 return { ok: false };
    //             }

    //             // Ventanas + eventos del día (excluye el propio idEvent)
    //             const [businessHours, workerHoursMap, temporaryHoursMap, overlapping] = await Promise.all([
    //                 businessHoursService.getBusinessHoursFromRedis(idCompany, idWorkspace),
    //                 workerHoursService.getWorkerHoursFromRedis(allUserIds, idWorkspace),
    //                 temporaryHoursService.getTemporaryHoursFromRedis(allUserIds, idWorkspace, { date: dateWS }),
    //                 getEventsOverlappingRange_SPECIAL(idWorkspace, allUserIds, dateWS, dateWS, idEvent),
    //             ]);

    //             const events = (overlapping || []).filter((ev: any) => !originalIds.has(ev.id));
    //             const eventsByUser = groupEventsByUser_SPECIAL(events);

    //             type MM = { start: moment.Moment; end: moment.Moment };
    //             const weekDay = startWS.format("dddd").toUpperCase() as any;
    //             const bizShifts: string[][] = (() => {
    //                 const biz = (businessHours as any)?.[weekDay];
    //                 return biz === null ? [] : Array.isArray(biz) ? biz : [];
    //             })();

    //             const shiftsByUserLocal: Record<string, MM[]> = {};
    //             for (const uid of allUserIds) {
    //                 let workShifts: string[][] = [];
    //                 const tmp = (temporaryHoursMap as any)?.[uid]?.[dateWS];
    //                 if (tmp === null) workShifts = [];
    //                 else if (Array.isArray(tmp) && tmp.length > 0) workShifts = tmp;
    //                 else {
    //                     const workerDay = (workerHoursMap as any)?.[uid]?.[weekDay];
    //                     if (workerDay === null) workShifts = [];
    //                     else if (Array.isArray(workerDay) && workerDay.length > 0) workShifts = workerDay;
    //                     else workShifts = bizShifts;
    //                 }
    //                 shiftsByUserLocal[uid] = (workShifts || []).map(([s, e]) => ({
    //                     start: moment.tz(`${dateWS}T${s}`, "YYYY-MM-DDTHH:mm:ss", timeZoneWorkspace),
    //                     end: moment.tz(`${dateWS}T${e}`, "YYYY-MM-DDTHH:mm:ss", timeZoneWorkspace),
    //                 }));
    //             }

    //             const freeWindowsByUser: Record<string, MM[]> = {};
    //             for (const uid of allUserIds) {
    //                 const busy = (eventsByUser[uid] || []).map((ev: any) => ({
    //                     start: moment(ev.startDate).tz(timeZoneWorkspace),
    //                     end: moment(ev.endDate).tz(timeZoneWorkspace),
    //                 }));
    //                 const raw = shiftsByUserLocal[uid] || [];
    //                 const free: MM[] = [];
    //                 for (const sh of raw) {
    //                     const startClamped = isToday ? moment.max(sh.start, roundedNow) : sh.start.clone();
    //                     if (!startClamped.isBefore(sh.end)) continue;
    //                     free.push(...subtractBusyFromShift_SPECIAL(startClamped, sh.end, busy));
    //                 }
    //                 freeWindowsByUser[uid] = mergeTouchingWindows_SPECIAL(free);
    //             }

    //             const dur = svcReq.durationMin ?? (svcSnap.duration ?? 0);
    //             const endWS = startWS.clone().add(dur, "minutes");

    //             const eligAvail = (userIdsByService.get(svcReq.serviceId) ?? []).filter((uid) =>
    //                 (freeWindowsByUser[uid] ?? []).some(
    //                     (w) => startWS.isSameOrAfter(w.start) && endWS.isSameOrBefore(w.end)
    //                 )
    //             );
    //             if (!eligAvail.length) {
    //                 console.log(CONSOLE_COLOR.BgRed, "[update][single] Ningún pro disponible para el slot", CONSOLE_COLOR.Reset);
    //                 return { ok: false };
    //             }

    //             const chosen = await this.chooseStaffWithRR(
    //                 idWorkspace,
    //                 undefined,
    //                 svcReq.serviceId,
    //                 startWS.toDate(),
    //                 endWS.toDate(),
    //                 eligAvail,
    //                 weightsMap
    //             );
    //             if (!chosen) {
    //                 console.log(CONSOLE_COLOR.BgRed, "[update][single] RR no pudo elegir pro", CONSOLE_COLOR.Reset);
    //                 return { ok: false };
    //             }

    //             const seg = {
    //                 serviceId: svcReq.serviceId,
    //                 userId: chosen,
    //                 start: startWS.clone().seconds(0).milliseconds(0),
    //                 end: endWS.clone().seconds(0).milliseconds(0),
    //             };

    //             // ───── TX: UPDATE IN PLACE (y NO tocamos participants ni deletedDate) ─────
    //             const { updatedEvent } = await prisma.$transaction(async (tx) => {
    //                 // Solape definitivo (excluye el propio id)
    //                 const overlapping = await tx.event.findFirst({
    //                     where: {
    //                         idWorkspaceFk: idWorkspace,
    //                         idUserPlatformFk: seg.userId,
    //                         startDate: { lt: seg.end.toDate() },
    //                         endDate: { gt: seg.start.toDate() },
    //                         deletedDate: null,
    //                         NOT: { id: original.id },
    //                     },
    //                     select: { id: true },
    //                 });
    //                 if (overlapping) {
    //                     throw new Error("Ese profesional ya tiene otro evento en ese horario.");
    //                 }

    //                 const ev = await tx.event.update({
    //                     where: { id: original.id },
    //                     data: {
    //                         idServiceFk: seg.serviceId,
    //                         idUserPlatformFk: seg.userId,
    //                         startDate: seg.start.toDate(),
    //                         endDate: seg.end.toDate(),
    //                         description: note ?? null,
    //                         timeZone: timeZoneWorkspace,
    //                         eventPurposeType: "APPOINTMENT",
    //                         // snapshots
    //                         serviceNameSnapshot: serviceById[seg.serviceId]?.name ?? null,
    //                         servicePriceSnapshot: typeof serviceById[seg.serviceId]?.price === "number" ? serviceById[seg.serviceId]!.price! : null,
    //                         serviceDiscountSnapshot: typeof serviceById[seg.serviceId]?.discount === "number" ? serviceById[seg.serviceId]!.discount! : null,
    //                         serviceDurationSnapshot: typeof serviceById[seg.serviceId]?.duration === "number" ? serviceById[seg.serviceId]!.duration! : null,
    //                         idGroup: groupId,
    //                     },
    //                 });

    //                 return { updatedEvent: ev };
    //             });

    //             return {
    //                 ok: true as const,
    //                 outcome: "updated_in_place",
    //                 fromEventId: original.id,
    //                 appointment: {
    //                     startLocalISO: startWS.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
    //                     endLocalISO: endWS.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
    //                     timeZoneClient,
    //                     timeZoneWorkspace,
    //                     totalDurationMin: dur,
    //                 },
    //                 assignments: [
    //                     {
    //                         serviceId: seg.serviceId,
    //                         userId: seg.userId,
    //                         startUTC: seg.start.toISOString(),
    //                         endUTC: seg.end.toISOString(),
    //                         startLocalClient: seg.start.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
    //                         endLocalClient: seg.end.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
    //                     },
    //                 ],
    //                 created: [],
    //                 updated: [updatedEvent],
    //                 deleted: [],
    //             };
    //         }

    //         // ───────────── Ruta MULTI-SERVICIO (secuencial) ─────────────
    //         if (attendees.length > maxPerBooking) {
    //             throw new Error(`Máximo ${maxPerBooking} servicios por reserva`);
    //         }

    //         // Resolver elegibles por servicio
    //         const userIdsByService = new Map<string, string[]>();
    //         for (const a of attendees) {
    //             if (a.staffId) {
    //                 userIdsByService.set(a.serviceId, [a.staffId]);
    //             } else {
    //                 const users = await getUsersWhoCanPerformService_SPECIAL(
    //                     idWorkspace,
    //                     a.serviceId,
    //                     a.categoryId,
    //                     cache
    //                 );
    //                 userIdsByService.set(a.serviceId, users);
    //             }
    //         }
    //         const allUserIds = Array.from(new Set(Array.from(userIdsByService.values()).flat()));
    //         if (!allUserIds.length) {
    //             console.log(CONSOLE_COLOR.BgRed, "[update][multi] No hay profesionales elegibles", CONSOLE_COLOR.Reset);
    //             return { ok: false };
    //         }

    //         // Ventanas + eventos en paralelo
    //         const [businessHours, workerHoursMap, temporaryHoursMap, overlapping] = await Promise.all([
    //             businessHoursService.getBusinessHoursFromRedis(idCompany, idWorkspace),
    //             workerHoursService.getWorkerHoursFromRedis(allUserIds, idWorkspace),
    //             temporaryHoursService.getTemporaryHoursFromRedis(allUserIds, idWorkspace, { date: dateWS }),
    //             getEventsOverlappingRange_SPECIAL(idWorkspace, allUserIds, dateWS, dateWS, undefined),
    //         ]);

    //         // Excluir TODO el grupo original y cualquier explicit delete del cálculo de ocupación
    //         const toIgnore = new Set([...originalIds, ...explicitDeletes]);
    //         const events = (overlapping || []).filter((ev: any) => !toIgnore.has(ev.id));
    //         const eventsByUser = groupEventsByUser_SPECIAL(events);

    //         type MM = { start: moment.Moment; end: moment.Moment };
    //         const weekDay = startWS.format("dddd").toUpperCase() as any;
    //         const bizShifts: string[][] = (() => {
    //             const biz = (businessHours as any)?.[weekDay];
    //             return biz === null ? [] : Array.isArray(biz) ? biz : [];
    //         })();

    //         const shiftsByUserLocal: Record<string, MM[]> = {};
    //         for (const uid of allUserIds) {
    //             let workShifts: string[][] = [];
    //             const tmp = (temporaryHoursMap as any)?.[uid]?.[dateWS];
    //             if (tmp === null) workShifts = [];
    //             else if (Array.isArray(tmp) && tmp.length > 0) workShifts = tmp;
    //             else {
    //                 const workerDay = (workerHoursMap as any)?.[uid]?.[weekDay];
    //                 if (workerDay === null) workShifts = [];
    //                 else if (Array.isArray(workerDay) && workerDay.length > 0) workShifts = workerDay;
    //                 else workShifts = bizShifts;
    //             }
    //             shiftsByUserLocal[uid] = (workShifts || []).map(([s, e]) => ({
    //                 start: moment.tz(`${dateWS}T${s}`, "YYYY-MM-DDTHH:mm:ss", timeZoneWorkspace),
    //                 end: moment.tz(`${dateWS}T${e}`, "YYYY-MM-DDTHH:mm:ss", timeZoneWorkspace),
    //             }));
    //         }

    //         const freeWindowsByUser: Record<string, MM[]> = {};
    //         for (const uid of allUserIds) {
    //             const busy = (eventsByUser[uid] || []).map((ev: any) => ({
    //                 start: moment(ev.startDate).tz(timeZoneWorkspace),
    //                 end: moment(ev.endDate).tz(timeZoneWorkspace),
    //             }));
    //             const raw = shiftsByUserLocal[uid] || [];
    //             const free: MM[] = [];
    //             for (const sh of raw) {
    //                 const startClamped = isToday ? moment.max(sh.start, roundedNow) : sh.start.clone();
    //                 if (!startClamped.isBefore(sh.end)) continue;
    //                 free.push(...subtractBusyFromShift_SPECIAL(startClamped, sh.end, busy));
    //             }
    //             freeWindowsByUser[uid] = mergeTouchingWindows_SPECIAL(free);
    //         }

    //         // Plan secuencial de segmentos
    //         type Seg = { serviceId: string; userId: string; start: moment.Moment; end: moment.Moment };
    //         let cursor = startWS.clone();
    //         const chosenSegments: Seg[] = [];
    //         for (const a of attendees) {
    //             const snap = serviceById[a.serviceId];
    //             if (!snap) throw new Error("Servicio no disponible");
    //             const dur = a.durationMin ?? (snap.duration ?? 0);
    //             const segStart = cursor.clone().seconds(0).milliseconds(0);
    //             const segEnd = cursor.clone().add(dur, "minutes").seconds(0).milliseconds(0);

    //             const eligAvail = (userIdsByService.get(a.serviceId) ?? []).filter((uid) =>
    //                 (freeWindowsByUser[uid] ?? []).some(
    //                     (w) => segStart.isSameOrAfter(w.start) && segEnd.isSameOrBefore(w.end)
    //                 )
    //             );
    //             if (!eligAvail.length) {
    //                 console.log(CONSOLE_COLOR.BgRed, "[update][multi] No encaja un segmento", { serviceId: a.serviceId }, CONSOLE_COLOR.Reset);
    //                 return { ok: false };
    //             }

    //             const chosen = await this.chooseStaffWithRR(
    //                 idWorkspace,
    //                 undefined,
    //                 a.serviceId,
    //                 segStart.toDate(),
    //                 segEnd.toDate(),
    //                 eligAvail,
    //                 weightsMap
    //             );
    //             if (!chosen) {
    //                 console.log(CONSOLE_COLOR.BgRed, "[update][multi] RR no pudo elegir pro", CONSOLE_COLOR.Reset);
    //                 return { ok: false };
    //             }

    //             chosenSegments.push({ serviceId: a.serviceId, userId: chosen, start: segStart, end: segEnd });
    //             cursor = segEnd.clone();
    //         }

    //         // Diff contra originales (quitando los explicitDeletes de la lista de candidatos a update)
    //         const originalsKept = originalEvents.filter((e) => !explicitDeletes.has(e.id));
    //         const toUpdate = Math.min(originalsKept.length, chosenSegments.length);

    //         const totalDurationMin = chosenSegments.reduce((acc, s) => acc + s.end.diff(s.start, "minutes"), 0);
    //         const endWS = startWS.clone().add(totalDurationMin, "minutes");

    //         // ───── TX: aplicar UPDATE / CREATE / DELETE ─────
    //         const result = await prisma.$transaction(async (tx) => {
    //             // 1) anti-solape definitivo por cada seg planificado (excluye todo el grupo original)
    //             for (const seg of chosenSegments) {
    //                 const overlapping = await tx.event.findFirst({
    //                     where: {
    //                         idWorkspaceFk: idWorkspace,
    //                         idUserPlatformFk: seg.userId,
    //                         startDate: { lt: seg.end.toDate() },
    //                         endDate: { gt: seg.start.toDate() },
    //                         deletedDate: null,
    //                         NOT: { id: { in: Array.from(originalIds) } },
    //                     },
    //                     select: { id: true },
    //                 });
    //                 if (overlapping) {
    //                     throw new Error("Un profesional tiene otro evento en el horario planificado.");
    //                 }
    //             }

    //             // 2) updates
    //             const updated: any[] = [];
    //             for (let i = 0; i < toUpdate; i++) {
    //                 const target = originalsKept[i];
    //                 const seg = chosenSegments[i];
    //                 const snap = serviceById[seg.serviceId];

    //                 const ev = await tx.event.update({
    //                     where: { id: target.id },
    //                     data: {
    //                         idServiceFk: seg.serviceId,
    //                         idUserPlatformFk: seg.userId,
    //                         startDate: seg.start.toDate(),
    //                         endDate: seg.end.toDate(),
    //                         timeZone: timeZoneWorkspace,
    //                         description: note ?? null,
    //                         eventPurposeType: "APPOINTMENT",
    //                         idGroup: groupId,
    //                         // snapshots
    //                         serviceNameSnapshot: snap?.name ?? null,
    //                         servicePriceSnapshot: typeof snap?.price === "number" ? snap!.price! : null,
    //                         serviceDiscountSnapshot: typeof snap?.discount === "number" ? snap!.discount! : null,
    //                         serviceDurationSnapshot: typeof snap?.duration === "number" ? snap!.duration! : null,
    //                     },
    //                 });
    //                 updated.push(ev);
    //             }

    //             // 3) creates
    //             const created: any[] = [];
    //             for (let i = toUpdate; i < chosenSegments.length; i++) {
    //                 const seg = chosenSegments[i];
    //                 const snap = serviceById[seg.serviceId];
    //                 const ev = await tx.event.create({
    //                     data: {
    //                         title: snap?.name,
    //                         idCompanyFk: idCompany,
    //                         idWorkspaceFk: idWorkspace,
    //                         idServiceFk: seg.serviceId,
    //                         idUserPlatformFk: seg.userId,
    //                         startDate: seg.start.toDate(),
    //                         endDate: seg.end.toDate(),
    //                         timeZone: timeZoneWorkspace,
    //                         eventPurposeType: "APPOINTMENT",
    //                         idGroup: groupId,
    //                         // snapshots
    //                         serviceNameSnapshot: snap?.name ?? null,
    //                         servicePriceSnapshot: typeof snap?.price === "number" ? snap!.price! : null,
    //                         serviceDiscountSnapshot: typeof snap?.discount === "number" ? snap!.discount! : null,
    //                         serviceDurationSnapshot: typeof snap?.duration === "number" ? snap!.duration! : null,
    //                         description: note ?? null,
    //                     },
    //                 });

    //                 // Asegurar participación del cliente en el nuevo evento
    //                 await tx.eventParticipant.create({
    //                     data: {
    //                         idEventFk: ev.id,
    //                         idClientFk: customer.id,
    //                         idClientWorkspaceFk: customer.idClientWorkspace!,
    //                     },
    //                 });

    //                 created.push(ev);
    //             }

    //             // 4) deletes (explícitos + sobrantes)
    //             const toSoftDeleteIds = new Set<string>(explicitDeletes);
    //             for (let i = chosenSegments.length; i < originalsKept.length; i++) {
    //                 toSoftDeleteIds.add(originalsKept[i].id);
    //             }
    //             const deleted: string[] = [];
    //             if (toSoftDeleteIds.size) {
    //                 const now = new Date();
    //                 for (const id of toSoftDeleteIds) {
    //                     await tx.event.update({ where: { id }, data: { deletedDate: now } });
    //                     deleted.push(id);
    //                 }
    //             }

    //             return { updated, created, deleted };
    //         });

    //         return {
    //             ok: true as const,
    //             outcome: "rebuild_group",
    //             fromEventId: original.id,
    //             appointment: {
    //                 startLocalISO: startWS.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
    //                 endLocalISO: endWS.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
    //                 timeZoneClient,
    //                 timeZoneWorkspace,
    //                 totalDurationMin: totalDurationMin,
    //             },
    //             assignments: chosenSegments.map((a) => ({
    //                 serviceId: a.serviceId,
    //                 userId: a.userId,
    //                 startUTC: a.start.toISOString(),
    //                 endUTC: a.end.toISOString(),
    //                 startLocalClient: a.start.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
    //                 endLocalClient: a.end.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
    //             })),
    //             ...result,
    //         };
    //     } catch (error: any) {
    //         console.error("Error en EventV2Service.updateEventFromWebBase:", error);
    //         throw new CustomError("Error al actualizar evento", error);
    //     }
    // }



}
