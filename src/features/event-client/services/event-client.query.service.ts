import prisma from "../../../lib/prisma";
import CustomError from "../../../models/custom-error/CustomError";

type BookingScope = "upcoming" | "past";

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
        maxParticipants?: number;
        durationMin: number;
        price: number;
        staffId?: string;
    }[];
};

export class EventClientQueryService {
    /**
     * Aplana campos de groupEvents para mantener el contrato de salida actual.
     */
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
     * Devuelve citas del cliente por scope con paginación a nivel de booking.
     */
    public async getFromWeb(
        scope: BookingScope,
        page: number,
        itemsPerPage: number,
        idClientWorkspace: string,
        idWorkspace: string
    ) {
        try {
            const events = await this._fetchClientEventsForScope(
                scope,
                idClientWorkspace,
                idWorkspace
            );

            return this._buildClientBookingsFromEvents(
                scope,
                events,
                page,
                itemsPerPage
            );
        } catch (error: any) {
            throw new CustomError("EventClientQueryService.getFromWeb", error);
        }
    }

    /**
     * Carga eventos crudos filtrados por scope y cliente/workspace.
     */
    private async _fetchClientEventsForScope(
        scope: BookingScope,
        idClientWorkspace: string,
        idWorkspace: string
    ) {
        const now = new Date();

        const baseWhere = {
            groupEvents: {
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
                eventPurposeType: true,
                allDay: true,
                serviceNameSnapshot: true,
                servicePriceSnapshot: true,
                serviceDiscountSnapshot: true,
                serviceDurationSnapshot: true,
                serviceMaxParticipantsSnapshot: true,
                groupEvents: {
                    select: {
                        commentClient: true,
                        eventStatusType: true,
                        eventSourceType: true,
                        timeZone: true,
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
                },
            },
            orderBy: {
                startDate: scope === "upcoming" ? "asc" : "desc",
            },
        });

        return events.map((event) => this._withGroupFields(event as any));
    }

    /**
     * Agrupa eventos por booking lógico y calcula paginación de respuesta.
     */
    private _buildClientBookingsFromEvents(
        scope: BookingScope,
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
            bookingId: string;
            primaryEventId: string;
            startDate: Date;
            endDate: Date;
            status: string;
            commentClient?: string | null;
            timeZone: string;
            services: ServiceItem[];
        };

        const bookingsMap = new Map<string, BookingRow>();

        for (const event of events) {
            const bookingId = event.idGroup ?? event.id;
            let booking = bookingsMap.get(bookingId);

            if (!booking) {
                booking = {
                    bookingId,
                    primaryEventId: event.id,
                    startDate: event.startDate,
                    endDate: event.endDate,
                    status: event.eventStatusType,
                    commentClient: event.commentClient,
                    timeZone: event.timeZone,
                    services: [],
                };
                bookingsMap.set(bookingId, booking);
            } else {
                if (event.startDate < booking.startDate) {
                    booking.startDate = event.startDate;
                    booking.primaryEventId = event.id;
                }
                if (event.endDate > booking.endDate) {
                    booking.endDate = event.endDate;
                }
            }

            booking.services.push({
                idEvent: event.id,
                idService: event.idServiceFk,
                serviceName: event.serviceNameSnapshot ?? event.title ?? "",
                maxParticipants: event.serviceMaxParticipantsSnapshot ?? null,
                durationMin: event.serviceDurationSnapshot ?? null,
                price: event.servicePriceSnapshot ?? null,
                staffId: event.idUserPlatformFk,
            });
        }

        const allBookings = Array.from(bookingsMap.values()).sort((a, b) =>
            scope === "upcoming"
                ? a.startDate.getTime() - b.startDate.getTime()
                : b.startDate.getTime() - a.startDate.getTime()
        );

        const defaultPerPage = scope === "upcoming" ? 25 : 30;
        const effectiveItemsPerPage =
            itemsPerPage && itemsPerPage > 0
                ? Math.min(itemsPerPage, defaultPerPage)
                : defaultPerPage;

        const total = allBookings.length;
        const totalPages = Math.max(1, Math.ceil(total / effectiveItemsPerPage));

        let currentPage = page && page > 0 ? page : 1;
        if (scope === "upcoming") {
            currentPage = 1;
        } else if (currentPage > totalPages) {
            currentPage = totalPages;
        }

        const skip = scope === "upcoming" ? 0 : (currentPage - 1) * effectiveItemsPerPage;

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
     * Devuelve una cita agrupada por idGroup para cliente/workspace.
     */
    public async getEventByGroupIdAndClientWorkspaceAndWorkspace(
        bookingId: string,
        idClientWorkspace: string,
        idWorkspace: string
    ): Promise<ClientAppointment | null> {
        try {
            const excludedStatuses = ["CANCELLED", "CANCELLED_BY_CLIENT_REMOVED"];

            const events = await prisma.event.findMany({
                where: {
                    deletedDate: null,
                    groupEvents: {
                        idWorkspaceFk: idWorkspace,
                        eventStatusType: { notIn: excludedStatuses as any },
                        eventParticipant: {
                            some: {
                                idClientWorkspaceFk: idClientWorkspace,
                                deletedDate: null,
                            },
                        },
                    },
                    OR: [{ idGroup: bookingId }],
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
                    eventPurposeType: true,
                    allDay: true,
                    serviceNameSnapshot: true,
                    servicePriceSnapshot: true,
                    serviceDiscountSnapshot: true,
                    serviceDurationSnapshot: true,
                    serviceMaxParticipantsSnapshot: true,
                    groupEvents: {
                        select: {
                            commentClient: true,
                            eventStatusType: true,
                            eventSourceType: true,
                            timeZone: true,
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
                    },
                },
                orderBy: { startDate: "asc" },
            });

            if (!events.length) {
                return null;
            }

            const grouped = this._buildClientBookingsFromEvents(
                "upcoming",
                events.map((event) => this._withGroupFields(event as any)),
                1,
                events.length || 10
            );

            const row = grouped.rows[0];
            if (!row) {
                return null;
            }

            return {
                bookingId: row.bookingId,
                primaryEventId: row.primaryEventId,
                startDate: row.startDate.toISOString(),
                endDate: row.endDate.toISOString(),
                status: row.status,
                commentClient: row.commentClient ?? null,
                timeZone: row.timeZone,
                services: row.services.map((service) => ({
                    idEvent: service.idEvent,
                    idService: service.idService ?? "",
                    serviceName: service.serviceName,
                    maxParticipants: service.maxParticipants ?? 1,
                    durationMin: service.durationMin ?? 0,
                    price: service.price ?? 0,
                    staffId: service.staffId ?? undefined,
                })),
            };
        } catch (error: any) {
            throw new CustomError(
                "EventClientQueryService.getEventByGroupIdAndClientWorkspaceAndWorkspace",
                error
            );
        }
    }
}
