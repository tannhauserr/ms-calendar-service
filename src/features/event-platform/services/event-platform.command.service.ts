import { EventParticipant, EventStatusType } from "@prisma/client";
import { randomUUID } from "crypto";
import prisma from "../../../lib/prisma";
import CustomError from "../../../models/custom-error/CustomError";
import { ErrorCatalogByDomain, withCatalogMessage } from "../../../models/error-codes";
import { ActionKey } from "../../../models/notification/util/action-to-senctions";
import { createNotification as createNotificationPlatform } from "../../../models/notification/util/trigger/util/for-action-platform";
import { SidebarBackendBookingPayload } from "../../../services/@database/event/dto/SidebarBackendBookingPayload";
import { upsertEvent } from "../../../services/@database/event/platform/upsertEvent.service";
import { publishStoreNotificationPurgeByBooking } from "../../../services/@rabbitmq/pubsub/functions";
import { ChangeEventStatusUseCase } from "./use-cases/change-event-status.use-case";
import {
    UpdateEventByIdPayload,
    UpdateEventByIdUseCase,
} from "./use-cases/update-event-by-id.use-case";

export type { UpdateEventByIdPayload } from "./use-cases/update-event-by-id.use-case";

type ParticipantAction = "accept" | "cancel";

const PARTICIPANT_ALLOWED: Record<EventStatusType, EventStatusType[]> = {
    PENDING: [EventStatusType.ACCEPTED, EventStatusType.CANCELLED_BY_CLIENT],
    ACCEPTED: [],
    CONFIRMED: [],
    COMPLETED: [],
    CANCELLED: [],
    CANCELLED_BY_CLIENT: [],
    CANCELLED_BY_CLIENT_REMOVED: [],
    PAID: [],
    NO_SHOW: [],
};

export class EventPlatformCommandService {
    private readonly changeEventStatusUseCase = new ChangeEventStatusUseCase();
    private readonly updateEventByIdUseCase = new UpdateEventByIdUseCase();

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

    public async upsertEventByPlatform(payload: SidebarBackendBookingPayload) {
        const events = await upsertEvent(payload);
        const message = payload.mode === "create"
            ? "Eventos creados exitosamente"
            : "Eventos actualizados exitosamente";

        const isSendNotification = payload?.sendNotification;
        if (isSendNotification && events?.length > 0 && events[0]?.idGroup) {
            await createNotificationPlatform(events[0].idGroup, {
                actionSectionType: payload.mode === "create" ? "add" : "update",
            });
        } else if (!isSendNotification && payload.mode === "edit" && events?.[0]?.idGroup) {
            await publishStoreNotificationPurgeByBooking({
                v: 1,
                bookingId: events[0].idGroup,
                trace: {
                    correlationId: randomUUID() || "",
                    producedAt: new Date().toISOString(),
                },
            });
        }

        return {
            message,
            item: {
                events,
                count: events.length,
            },
        };
    }

    public async markCommentAsRead(eventId: string, idWorkspace: string) {
        try {
            if (!eventId) {
                throw new Error(
                    withCatalogMessage(
                        ErrorCatalogByDomain.controller.validation.VALIDATION_REQUIRED_FIELD.message,
                        "El id del evento es requerido"
                    )
                );
            }

            const event = await prisma.event.findUnique({
                where: { id: eventId },
                include: { groupEvents: true },
            });

            if (!event?.groupEvents || event.groupEvents.idWorkspaceFk !== idWorkspace) {
                throw new Error(
                    withCatalogMessage(
                        ErrorCatalogByDomain.controller.resource.RESOURCE_NOT_FOUND.message,
                        "Evento no encontrado en este workspace"
                    )
                );
            }

            await prisma.groupEvents.update({
                where: { id: event.idGroup },
                data: { isCommentRead: true },
            });

            event.groupEvents.isCommentRead = true;
            return this.withGroupFields(event as any);
        } catch (err: any) {
            throw new CustomError("EventPlatformCommandService.markCommentAsRead", err);
        }
    }

    public async deleteEvent(idList: string[]) {
        try {
            const events = await prisma.event.findMany({
                where: { id: { in: idList } },
                select: { idRecurrenceRuleFk: true, idGroup: true },
            });

            const ruleIds = Array.from(
                new Set(
                    events
                        .map((event) => event.idRecurrenceRuleFk)
                        .filter((ruleId): ruleId is string => !!ruleId)
                )
            );

            const groupIds = Array.from(
                new Set(
                    events
                        .map((event) => event.idGroup)
                        .filter((groupId): groupId is string => !!groupId)
                )
            );

            return await prisma.$transaction(async (tx) => {
                await tx.event.deleteMany({
                    where: { id: { in: idList } },
                });

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

                await tx.recurrenceRule.deleteMany({
                    where: {
                        id: { in: ruleIds },
                        events: {
                            none: { id: { notIn: idList } },
                        },
                    },
                });
            });
        } catch (err: any) {
            throw new CustomError("EventPlatformCommandService.deleteEvent", err);
        }
    }

    public async changeEventStatus(id: string, status: EventStatusType, allGroup = false) {
        try {
            const result = await this.changeEventStatusUseCase.execute(id, status, allGroup);

            if (!result) {
                return null;
            }

            const { events, notifyEvents } = result;
            let actionSectionType: ActionKey | null = null;

            if (status === EventStatusType.ACCEPTED || status === EventStatusType.CONFIRMED) {
                actionSectionType = "acceptRequest";
            } else if (
                status === EventStatusType.CANCELLED ||
                status === EventStatusType.CANCELLED_BY_CLIENT ||
                status === EventStatusType.CANCELLED_BY_CLIENT_REMOVED
            ) {
                actionSectionType = "rejectRequest";
            }

            if (actionSectionType && notifyEvents.length) {
                const idGroup = (notifyEvents[0] as any)?.idGroup;
                if (idGroup) {
                    await createNotificationPlatform(idGroup, { actionSectionType });
                }
            }

            return events;
        } catch (err: any) {
            throw new CustomError("EventPlatformCommandService.changeEventStatus", err);
        }
    }

    public async updateById(eventId: string, payload: UpdateEventByIdPayload) {
        try {
            const { event = {} as any, isMany = false, sendNotification = false } = payload;

            const result = await this.updateEventByIdUseCase.execute({
                event: {
                    ...event,
                    id: eventId,
                },
                isMany,
                sendNotification,
            });

            if (sendNotification && Array.isArray(result?.affectedGroupIds) && result.affectedGroupIds.length > 0) {
                await Promise.all(
                    result.affectedGroupIds.map(async (idGroup: string) => {
                        await createNotificationPlatform(idGroup, { actionSectionType: "update" });
                    })
                );
            }

            return result;
        } catch (error: any) {
            throw new CustomError("EventPlatformCommandService.updateById", error);
        }
    }

    public async changeEventStatusByParticipant(
        id: string,
        idClient: string,
        idClientWorkspace: string,
        action: ParticipantAction
    ): Promise<EventParticipant | undefined> {
        try {
            const event = await prisma.event.findUnique({
                where: { id },
                select: { idGroup: true },
            });

            if (!event?.idGroup) {
                throw new Error(
                    withCatalogMessage(
                        ErrorCatalogByDomain.controller.validation.VALIDATION_INVALID_PAYLOAD.message,
                        "Evento sin grupo para actualizar participante"
                    )
                );
            }

            const targetStatus = action === "accept"
                ? EventStatusType.ACCEPTED
                : EventStatusType.CANCELLED_BY_CLIENT;

            const participant = await prisma.eventParticipant.findFirst({
                where: {
                    idGroup: event.idGroup,
                    idClientFk: idClient ?? undefined,
                    idClientWorkspaceFk: idClientWorkspace ?? undefined,
                },
            });

            if (!participant) {
                throw new Error(
                    withCatalogMessage(
                        ErrorCatalogByDomain.controller.resource.RESOURCE_NOT_FOUND.message,
                        "No se encontró ese participante para este evento"
                    )
                );
            }

            const current = participant.eventStatusType;
            if (!PARTICIPANT_ALLOWED[current].includes(targetStatus)) {
                return undefined;
            }

            return prisma.eventParticipant.update({
                where: { id: participant.id },
                data: { eventStatusType: targetStatus },
            });
        } catch (error: any) {
            throw new CustomError("EventPlatformCommandService.changeEventStatusByParticipant", error);
        }
    }

}
