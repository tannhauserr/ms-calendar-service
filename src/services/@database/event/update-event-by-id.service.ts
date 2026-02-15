import { Prisma } from "@prisma/client";
import prisma from "../../../lib/prisma";
import CustomError from "../../../models/custom-error/CustomError";

type UpdateEventInput = {
    id: string;
    startDate?: string | Date;
    endDate?: string | Date;
    title?: string;
    description?: string | null;
    idUserPlatformFk?: string | null;
    idServiceFk?: string | null;
    eventPurposeType?: any;
    allDay?: boolean;
    serviceNameSnapshot?: string | null;
    servicePriceSnapshot?: number | null;
    serviceDiscountSnapshot?: number | null;
    serviceDurationSnapshot?: number | null;
    serviceMaxParticipantsSnapshot?: number | null;
};

export type UpdateEventByIdPayload = {
    event: UpdateEventInput;
    isMany?: boolean;
    sendNotification?: boolean;
};

type GroupCloneSource = {
    id: string;
    title: string;
    idCompanyFk: string;
    idWorkspaceFk: string;
    commentClient: string | null;
    commentClientHash: string | null;
    isCommentRead: boolean;
    description: string | null;
    descriptionHash: string | null;
    encryptionKeyVersion: number;
    eventSourceType: any;
    isEditableByClient: boolean;
    numberUpdates: number | null;
    eventStatusType: any;
    timeZone: string;
    hasNotifications: boolean;
    eventParticipant: Array<{
        idClientFk: string | null;
        idClientWorkspaceFk: string | null;
        eventStatusType: any;
    }>;
};

type MinimalEvent = {
    id: string;
    startDate: Date;
    endDate: Date;
};

export class UpdateEventByIdService {
    private toDateOrThrow(value: string | Date, fieldName: string): Date {
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) {
            throw new Error(`${fieldName} es inválido`);
        }
        return date;
    }

    private buildEventUpdateData(event: UpdateEventInput): Prisma.EventUncheckedUpdateInput {
        const data: Prisma.EventUncheckedUpdateInput = {};

        if (event.startDate !== undefined) {
            data.startDate = this.toDateOrThrow(event.startDate, "event.startDate");
        }
        if (event.endDate !== undefined) {
            data.endDate = this.toDateOrThrow(event.endDate, "event.endDate");
        }
        if (event.title !== undefined) data.title = event.title;
        if (event.description !== undefined) data.description = event.description;
        if (event.idUserPlatformFk !== undefined) data.idUserPlatformFk = event.idUserPlatformFk;
        if (event.idServiceFk !== undefined) data.idServiceFk = event.idServiceFk;
        if (event.eventPurposeType !== undefined) data.eventPurposeType = event.eventPurposeType;
        if (event.allDay !== undefined) data.allDay = event.allDay;
        if (event.serviceNameSnapshot !== undefined) data.serviceNameSnapshot = event.serviceNameSnapshot;
        if (event.servicePriceSnapshot !== undefined) data.servicePriceSnapshot = event.servicePriceSnapshot;
        if (event.serviceDiscountSnapshot !== undefined) data.serviceDiscountSnapshot = event.serviceDiscountSnapshot;
        if (event.serviceDurationSnapshot !== undefined) data.serviceDurationSnapshot = event.serviceDurationSnapshot;
        if (event.serviceMaxParticipantsSnapshot !== undefined) {
            data.serviceMaxParticipantsSnapshot = event.serviceMaxParticipantsSnapshot;
        }

        return data;
    }

    private splitByTimeContinuity(events: MinimalEvent[]): MinimalEvent[][] {
        if (events.length === 0) return [];

        const sorted = [...events].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
        const segments: MinimalEvent[][] = [];
        let currentSegment: MinimalEvent[] = [sorted[0]];

        for (let i = 1; i < sorted.length; i++) {
            const prev = currentSegment[currentSegment.length - 1];
            const next = sorted[i];

            const hasGap = next.startDate.getTime() > prev.endDate.getTime();
            if (hasGap) {
                segments.push(currentSegment);
                currentSegment = [next];
            } else {
                currentSegment.push(next);
            }
        }

        segments.push(currentSegment);
        return segments;
    }

    private getSegmentBounds(segment: MinimalEvent[]): { startDate: Date; endDate: Date } {
        const startDate = segment[0].startDate;
        const endDate = segment.reduce((maxEnd, event) => {
            return event.endDate.getTime() > maxEnd.getTime() ? event.endDate : maxEnd;
        }, segment[0].endDate);

        return { startDate, endDate };
    }

    private cloneGroupWithParticipants = async (
        tx: Prisma.TransactionClient,
        sourceGroup: GroupCloneSource,
        startDate: Date,
        endDate: Date
    ) => {
        return tx.groupEvents.create({
            data: {
                title: sourceGroup.title,
                idCompanyFk: sourceGroup.idCompanyFk,
                idWorkspaceFk: sourceGroup.idWorkspaceFk,
                commentClient: sourceGroup.commentClient,
                commentClientHash: sourceGroup.commentClientHash,
                isCommentRead: sourceGroup.isCommentRead,
                description: sourceGroup.description,
                descriptionHash: sourceGroup.descriptionHash,
                encryptionKeyVersion: sourceGroup.encryptionKeyVersion,
                eventSourceType: sourceGroup.eventSourceType,
                isEditableByClient: sourceGroup.isEditableByClient,
                numberUpdates: sourceGroup.numberUpdates ?? 0,
                eventStatusType: sourceGroup.eventStatusType,
                timeZone: sourceGroup.timeZone,
                hasNotifications: sourceGroup.hasNotifications,
                startDate,
                endDate,
                eventParticipant: {
                    create: sourceGroup.eventParticipant.map((participant) => ({
                        idClientFk: participant.idClientFk,
                        idClientWorkspaceFk: participant.idClientWorkspaceFk,
                        eventStatusType: participant.eventStatusType,
                    })),
                },
            },
        });
    };

    private syncGroupWindow = async (tx: Prisma.TransactionClient, idGroup: string): Promise<boolean> => {
        const activeEvents = await tx.event.findMany({
            where: { idGroup, deletedDate: null },
            select: { startDate: true, endDate: true },
            orderBy: { startDate: "asc" },
        });

        if (activeEvents.length === 0) return false;

        const startDate = activeEvents[0].startDate;
        const endDate = activeEvents.reduce((maxEnd, event) => {
            return event.endDate.getTime() > maxEnd.getTime() ? event.endDate : maxEnd;
        }, activeEvents[0].endDate);

        await tx.groupEvents.update({
            where: { id: idGroup },
            data: { startDate, endDate },
        });

        return true;
    };

    public updateEventById = async (payload: UpdateEventByIdPayload) => {
        try {
            // Código legacy (comentado):
            // return this.updateEventV2(payload);
            const eventInput = payload?.event;
            const isMany = !!payload?.isMany;

            if (!eventInput?.id) {
                throw new Error("event.id es obligatorio");
            }

            if (isMany && (eventInput.startDate === undefined || eventInput.endDate === undefined)) {
                throw new Error("Para isMany=true debes enviar event.startDate y event.endDate");
            }

            const eventUpdateData = this.buildEventUpdateData(eventInput);

            return await prisma.$transaction(async (tx) => {
                const targetEvent = await tx.event.findUnique({
                    where: { id: eventInput.id },
                    select: {
                        id: true,
                        idGroup: true,
                        deletedDate: true,
                        startDate: true,
                        endDate: true,
                    },
                });

                if (!targetEvent || targetEvent.deletedDate) {
                    throw new Error("Evento no encontrado");
                }

                const originalGroup = await tx.groupEvents.findUnique({
                    where: { id: targetEvent.idGroup },
                    include: {
                        eventParticipant: {
                            where: { deletedDate: null },
                            select: {
                                idClientFk: true,
                                idClientWorkspaceFk: true,
                                eventStatusType: true,
                            },
                        },
                    },
                });

                if (!originalGroup) {
                    throw new Error("Booking original no encontrado");
                }

                const originalGroupEventsBefore = await tx.event.findMany({
                    where: { idGroup: targetEvent.idGroup, deletedDate: null },
                    select: { id: true, startDate: true, endDate: true },
                    orderBy: { startDate: "asc" },
                });

                const affectedGroupIds = new Set<string>();
                affectedGroupIds.add(targetEvent.idGroup);

                if (!isMany) {
                    const updatedEvent = await tx.event.update({
                        where: { id: eventInput.id },
                        data: eventUpdateData,
                    });

                    await this.syncGroupWindow(tx, targetEvent.idGroup);

                    return {
                        ok: true,
                        movedToNewGroup: false,
                        oldGroupId: targetEvent.idGroup,
                        newGroupId: null,
                        oldGroupServicesCount: originalGroupEventsBefore.length,
                        oldGroupWasSplit: false,
                        affectedGroupIds: Array.from(affectedGroupIds),
                        updatedEvent,
                    };
                }

                // isMany=true -> mover evento a un nuevo booking (idGroup nuevo)
                const movedStartDate = eventUpdateData.startDate as Date;
                const movedEndDate = eventUpdateData.endDate as Date;

                if (movedStartDate.getTime() >= movedEndDate.getTime()) {
                    throw new Error("event.startDate debe ser menor que event.endDate");
                }

                const movedEventGroup = await this.cloneGroupWithParticipants(
                    tx,
                    originalGroup as any,
                    movedStartDate,
                    movedEndDate
                );
                affectedGroupIds.add(movedEventGroup.id);

                const movedEvent = await tx.event.update({
                    where: { id: eventInput.id },
                    data: {
                        ...eventUpdateData,
                        idGroup: movedEventGroup.id,
                    },
                });

                const remainingInOriginalGroup = await tx.event.findMany({
                    where: {
                        idGroup: targetEvent.idGroup,
                        deletedDate: null,
                    },
                    select: { id: true, startDate: true, endDate: true },
                    orderBy: { startDate: "asc" },
                });

                const segments = this.splitByTimeContinuity(remainingInOriginalGroup);
                const createdSplitGroupIds: string[] = [];

                if (segments.length > 0) {
                    const firstSegmentBounds = this.getSegmentBounds(segments[0]);
                    await tx.groupEvents.update({
                        where: { id: targetEvent.idGroup },
                        data: {
                            startDate: firstSegmentBounds.startDate,
                            endDate: firstSegmentBounds.endDate,
                        },
                    });

                    for (let index = 1; index < segments.length; index++) {
                        const segment = segments[index];
                        const segmentBounds = this.getSegmentBounds(segment);

                        const splitGroup = await this.cloneGroupWithParticipants(
                            tx,
                            originalGroup as any,
                            segmentBounds.startDate,
                            segmentBounds.endDate
                        );

                        const segmentIds = segment.map((event) => event.id);
                        await tx.event.updateMany({
                            where: { id: { in: segmentIds } },
                            data: { idGroup: splitGroup.id },
                        });

                        createdSplitGroupIds.push(splitGroup.id);
                        affectedGroupIds.add(splitGroup.id);
                    }
                }

                const movedWasLastInOriginalGroup =
                    originalGroupEventsBefore.length > 0 &&
                    originalGroupEventsBefore[originalGroupEventsBefore.length - 1].id === eventInput.id;

                const oldGroupHasActiveEvents = await this.syncGroupWindow(tx, targetEvent.idGroup);

                return {
                    ok: true,
                    movedToNewGroup: true,
                    oldGroupId: targetEvent.idGroup,
                    newGroupId: movedEventGroup.id,
                    oldGroupServicesCount: originalGroupEventsBefore.length,
                    oldGroupHadMoreThanTwoServices: originalGroupEventsBefore.length > 2,
                    movedWasLastInOriginalGroup,
                    oldGroupWasSplit: createdSplitGroupIds.length > 0,
                    oldGroupHasActiveEvents,
                    splitGroupIds: createdSplitGroupIds,
                    affectedGroupIds: Array.from(affectedGroupIds),
                    updatedEvent: movedEvent,
                };
            });
        } catch (error: any) {
            throw new CustomError("UpdateEventByIdService.updateEventById", error);
        }
    };
}
