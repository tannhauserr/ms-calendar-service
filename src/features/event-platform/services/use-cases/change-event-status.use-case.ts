import { EventStatusType } from "@prisma/client";
import prisma from "../../../../lib/prisma";

export type ChangeEventStatusResult = {
    events: any[];
    notifyEvents: any[];
};

const ALLOWED: Record<EventStatusType, EventStatusType[]> = {
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
    CANCELLED: [],
    CANCELLED_BY_CLIENT: [EventStatusType.CANCELLED_BY_CLIENT_REMOVED],
    CANCELLED_BY_CLIENT_REMOVED: [],
};

export class ChangeEventStatusUseCase {
    /**
     * Aplica una transición de estado sobre un evento o sobre todo el grupo.
     */
    public async execute(
        id: string,
        status: EventStatusType,
        allGroup = false
    ): Promise<ChangeEventStatusResult | undefined> {
        return prisma.$transaction<ChangeEventStatusResult | undefined>(async (tx) => {
            const evt = await tx.event.findUnique({
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

            if (!ALLOWED[current].includes(status)) {
                return undefined;
            }

            const eventIds: string[] = [];
            const notifyIds: string[] = [];

            const groupEvents = await tx.event.findMany({
                where: {
                    idGroup: evt.idGroup,
                    deletedDate: null,
                },
                select: { id: true },
            });

            const groupEventIds = groupEvents.map((groupEvent) => groupEvent.id);
            const targetIds = allGroup ? groupEventIds : [id];
            eventIds.push(...targetIds);

            if (this._shouldNotifyOnTransition(current, status)) {
                notifyIds.push(...targetIds);
            }

            await tx.groupEvents.update({
                where: { id: evt.idGroup },
                data: { eventStatusType: status },
            });

            if (
                status === EventStatusType.CANCELLED ||
                status === EventStatusType.CANCELLED_BY_CLIENT_REMOVED
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
                    data: { eventStatusType: status },
                });
            }

            if (status === EventStatusType.CONFIRMED || status === EventStatusType.ACCEPTED) {
                await tx.eventParticipant.updateMany({
                    where: {
                        idGroup: evt.idGroup,
                        eventStatusType: EventStatusType.PENDING,
                    },
                    data: { eventStatusType: EventStatusType.ACCEPTED },
                });
            }

            const events = await tx.event.findMany({
                where: { id: { in: eventIds } },
                include: {
                    groupEvents: { include: { eventParticipant: true } },
                    recurrenceRule: true,
                },
            });

            const flattenedEvents = events.map((event) => this._withGroupFields(event as any));
            const flattenedNotify = flattenedEvents.filter((event) => notifyIds.includes((event as any).id));

            return {
                events: flattenedEvents as any,
                notifyEvents: flattenedNotify as any,
            };
        });
    }

    /**
     * Determina si esta transición de estado debe disparar efectos de notificación.
     */
    private _shouldNotifyOnTransition(oldStatus: EventStatusType, newStatus: EventStatusType): boolean {
        if (oldStatus !== EventStatusType.PENDING) return false;

        return (
            newStatus === EventStatusType.ACCEPTED ||
            newStatus === EventStatusType.CONFIRMED ||
            newStatus === EventStatusType.CANCELLED ||
            newStatus === EventStatusType.CANCELLED_BY_CLIENT ||
            newStatus === EventStatusType.CANCELLED_BY_CLIENT_REMOVED
        );
    }

    /**
     * Aplana campos del grupo dentro del objeto evento usado por capas superiores.
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
}
