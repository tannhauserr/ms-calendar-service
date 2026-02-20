import { EventStatusType, Prisma } from "@prisma/client";
import prisma from "../../../lib/prisma";
import CustomError from "../../../models/custom-error/CustomError";
import { Pagination } from "../../../models/pagination";
import { EventExtraData } from "../../../services/@database/event/dto/EventExtraData";
import { getServiceByIds } from "../../../services/@service-token-client/api-ms/bookingPage.ms";
import { getClientWorkspacesByIds } from "../../../services/@service-token-client/api-ms/client.ms";
import { getGenericSpecialEvent2 } from "../../../utils/get-genetic/calendar-event/getGenericSpecialEvent2";

export class EventPlatformQueryService {
    private withGroupFields<T extends { groupEvents?: any }>(event: T | null) {
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

    private async getEventsData(
        pagination: Pagination,
        includeCancelledForList: boolean = true
    ): Promise<any> {
        try {
            if (!includeCancelledForList) {
                const select: Prisma.EventSelect = {
                    id: true,
                    title: true,
                    startDate: true,
                    endDate: true,
                    idGroup: true,
                    idUserPlatformFk: true,
                    eventPurposeType: true,
                    idServiceFk: true,
                    allDay: true,
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
                        },
                    },
                };

                const maxItemsPerPage = 1000;
                const normalizedPagination = {
                    ...pagination,
                    page: 1,
                    itemsPerPage: maxItemsPerPage,
                };

                const result = await getGenericSpecialEvent2(
                    normalizedPagination,
                    "event",
                    select,
                    false,
                    { maxItemsPerPage }
                );

                result.rows = result.rows.map((row: any) => this.withGroupFields(row as any));
                return result;
            }

            const select: Prisma.EventSelect = {
                id: true,
                title: true,
                description: true,
                startDate: true,
                endDate: true,
                idGroup: true,
                idUserPlatformFk: true,
                eventPurposeType: true,
                allDay: true,
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
                            },
                        },
                        eventSourceType: true,
                        eventStatusType: true,
                        timeZone: true,
                    },
                },
            };

            const maxItemsPerPage = 100;
            const itemsPerPage = Math.min(maxItemsPerPage, pagination?.itemsPerPage ?? 25);

            const normalizedPagination: Pagination = {
                ...pagination,
                itemsPerPage,
            };

            if (!normalizedPagination?.orderBy) {
                normalizedPagination.orderBy = {
                    field: "startDate",
                    order: "desc" as "asc" | "desc",
                };
            }

            const result = await getGenericSpecialEvent2(
                normalizedPagination,
                "event",
                select,
                true,
                { maxItemsPerPage }
            );
            result.rows = result.rows.map((row: any) => this.withGroupFields(row as any));
            return result;
        } catch (error: any) {
            throw new CustomError("EventPlatformQueryService.getEventsData", error);
        }
    }

    private async getEventExtraDataRaw(idEventList: string[]): Promise<EventExtraData[]> {
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
                    groupEvents: {
                        select: {
                            commentClient: true,
                            isCommentRead: true,
                            eventParticipant: {
                                where: { deletedDate: null },
                                select: {
                                    id: true,
                                    idClientWorkspaceFk: true,
                                    idClientFk: true,
                                    eventStatusType: true,
                                },
                            },
                        },
                    },
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
                },
            });

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
                    recurrenceRule: (recurrenceRule as any) ?? undefined,
                    commentClient: groupEvents?.commentClient ?? undefined,
                    isCommentRead: groupEvents?.isCommentRead ?? undefined,
                })
            );
        } catch (error: any) {
            throw new CustomError("EventPlatformQueryService.getEventExtraDataRaw", error);
        }
    }

    private async buildEventsExtraData(idList: string[], idCompany: string, idWorkspace: string) {
        const events = await this.getEventExtraDataRaw(idList);

        const allClientIds = events
            .flatMap((ev) => ev.eventParticipant.map((p) => p.idClientWorkspaceFk))
            .filter((id): id is string => !!id);

        const uniqueClientIds = [...new Set(allClientIds)];

        const allServiceIds = events
            .map((ev) => ev.idServiceFk)
            .filter((id): id is string => !!id);

        const uniqueServiceIds = [...new Set(allServiceIds)];

        const clientWorkspaceList = uniqueClientIds.length > 0
            ? await getClientWorkspacesByIds(uniqueClientIds, idCompany)
            : [];

        const services = uniqueServiceIds.length > 0
            ? await getServiceByIds(uniqueServiceIds, idWorkspace)
            : [];

        const clientMap = new Map(clientWorkspaceList.map((c) => [c.id, c]));
        const serviceMap = new Map(services.map((s) => [s.id, s]));

        return events.map((ev) => ({
            ...ev,
            eventParticipant: ev.eventParticipant.map((p) => {
                const fullClient = clientMap.get(p.idClientWorkspaceFk) ?? null;
                const client = fullClient
                    ? {
                        name: fullClient.name,
                        surname1: fullClient.surname1,
                        surname2: fullClient.surname2,
                        image: fullClient.image,
                    }
                    : null;

                return {
                    ...p,
                    client,
                };
            }),
            service: ev.idServiceFk
                ? (() => {
                    const fullService = serviceMap.get(ev.idServiceFk);
                    return fullService
                        ? {
                            id: fullService.id,
                            name: fullService.name,
                            duration: fullService.duration,
                            price: fullService.price,
                            discount: fullService.discount,
                            serviceType: fullService.serviceType,
                            color: fullService.color,
                            image: fullService.image,
                        }
                        : null;
                })()
                : null,
        }));
    }

    public async getEvents(pagination: Pagination) {
        return this.getEventsData(pagination, false);
    }

    public async getEventsList(pagination: Pagination, idCompanyBody?: string, idWorkspaceBody?: string) {
        const result = await this.getEventsData(pagination, true);

        if (result?.rows?.length) {
            const idList = result.rows.map((row: any) => row.id).filter(Boolean);
            const fallbackCompany = result.rows[0]?.groupEvents?.idCompanyFk ?? result.rows[0]?.idCompanyFk;
            const fallbackWorkspace = result.rows[0]?.groupEvents?.idWorkspaceFk ?? result.rows[0]?.idWorkspaceFk;

            const idCompany = idCompanyBody ?? fallbackCompany;
            const idWorkspace = idWorkspaceBody ?? fallbackWorkspace;

            if (idCompany && idWorkspace) {
                const extras = await this.buildEventsExtraData(idList, idCompany, idWorkspace);
                const extrasMap = new Map(extras.map((ev: any) => [ev.id, ev]));

                result.rows = result.rows.map((row: any) => {
                    const extra = extrasMap.get(row.id);
                    return extra
                        ? {
                            ...row,
                            ...extra,
                            eventParticipant: extra.eventParticipant,
                            service: extra.service,
                        }
                        : row;
                });
            }
        }

        return result;
    }

    public async getEventExtraData(idList: string[], idCompany: string, idWorkspace: string) {
        return this.buildEventsExtraData(idList, idCompany, idWorkspace);
    }

    public async getEventById(id: string) {
        try {
            const event = await prisma.event.findUnique({
                where: {
                    id,
                    groupEvents: {
                        eventStatusType: {
                            notIn: [EventStatusType.CANCELLED, EventStatusType.CANCELLED_BY_CLIENT_REMOVED],
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
                                },
                            },
                        },
                    },
                },
            });

            const result = this.withGroupFields(event as any);

            if (result?.idServiceFk && result?.idWorkspaceFk) {
                const service = await getServiceByIds([result.idServiceFk], result.idWorkspaceFk);
                (result as any).service = service[0] ?? null;
            }

            return result;
        } catch (error: any) {
            throw new CustomError("EventPlatformQueryService.getEventById", error);
        }
    }

    public async internalGetEventDataById(id: string, _idWorkspace: string) {
        try {
            const event = await prisma.event.findFirst({
                where: { id, deletedDate: null },
                select: {
                    id: true,
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
                        },
                    },
                },
            });

            return {
                item: event,
                count: event ? 1 : 0,
            };
        } catch (error: any) {
            throw new CustomError("EventPlatformQueryService.internalGetEventDataById", error);
        }
    }

    public async internalGetGroupDataById(idGroup: string, _idWorkspace: string) {
        try {
            const events = await prisma.event.findMany({
                where: {
                    idGroup,
                    deletedDate: null,
                },
                select: {
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
                    serviceNameSnapshot: true,
                    servicePriceSnapshot: true,
                    serviceDiscountSnapshot: true,
                    serviceDurationSnapshot: true,
                    serviceMaxParticipantsSnapshot: true,
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
                        },
                    },
                },
            });

            return {
                item: events,
                count: events.length,
            };
        } catch (error: any) {
            throw new CustomError("EventPlatformQueryService.internalGetGroupDataById", error);
        }
    }

}
