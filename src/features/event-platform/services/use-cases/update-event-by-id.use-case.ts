import { Prisma } from "@prisma/client";
import prisma from "../../../../lib/prisma";
import { ErrorCatalogByDomain, withCatalogMessage } from "../../../../models/error-codes";

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

type UpdateContext = {
    targetEvent: {
        id: string;
        idGroup: string;
        deletedDate: Date | null;
        startDate: Date;
        endDate: Date;
    };
    originalGroup: GroupCloneSource;
    originalGroupEventsBefore: MinimalEvent[];
    affectedGroupIds: Set<string>;
};

export class UpdateEventByIdUseCase {
    /**
     * Actualiza un evento individual o lo mueve de grupo cuando el cambio aplica a múltiples ocurrencias.
     */
    public async execute(payload: UpdateEventByIdPayload) {
        const { eventInput, isMany, eventUpdateData } = this._prepareInput(payload);

        return prisma.$transaction(async (tx) => {
            const context = await this._loadContext(tx, eventInput.id);

            if (!isMany) {
                return this._updateSingleEvent(tx, context, eventInput.id, eventUpdateData);
            }

            return this._updateManyEvent(tx, context, eventInput.id, eventUpdateData);
        });
    }

    /**
     * Valida y normaliza el payload de entrada antes de iniciar la transacción.
     */
    private _prepareInput(payload: UpdateEventByIdPayload) {
        const eventInput = payload?.event;
        const isMany = !!payload?.isMany;

        if (!eventInput?.id) {
            throw new Error(
                withCatalogMessage(
                    ErrorCatalogByDomain.controller.validation.VALIDATION_REQUIRED_FIELD.message,
                    "event.id es obligatorio"
                )
            );
        }

        if (isMany && (eventInput.startDate === undefined || eventInput.endDate === undefined)) {
            throw new Error(
                withCatalogMessage(
                    ErrorCatalogByDomain.controller.validation.VALIDATION_REQUIRED_FIELD.message,
                    "Para isMany=true debes enviar event.startDate y event.endDate"
                )
            );
        }

        return {
            eventInput,
            isMany,
            eventUpdateData: this._buildEventUpdateData(eventInput),
        };
    }

    /**
     * Carga y valida el evento objetivo junto con el contexto del grupo original.
     */
    private async _loadContext(tx: Prisma.TransactionClient, eventId: string): Promise<UpdateContext> {
        const targetEvent = await tx.event.findUnique({
            where: { id: eventId },
            select: {
                id: true,
                idGroup: true,
                deletedDate: true,
                startDate: true,
                endDate: true,
            },
        });

        if (!targetEvent || targetEvent.deletedDate) {
            throw new Error(
                withCatalogMessage(
                    ErrorCatalogByDomain.controller.resource.RESOURCE_NOT_FOUND.message,
                    "Evento no encontrado"
                )
            );
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
            throw new Error(
                withCatalogMessage(
                    ErrorCatalogByDomain.controller.resource.RESOURCE_NOT_FOUND.message,
                    "Booking original no encontrado"
                )
            );
        }

        const originalGroupEventsBefore = await tx.event.findMany({
            where: { idGroup: targetEvent.idGroup, deletedDate: null },
            select: { id: true, startDate: true, endDate: true },
            orderBy: { startDate: "asc" },
        });

        const affectedGroupIds = new Set<string>();
        affectedGroupIds.add(targetEvent.idGroup);

        return {
            targetEvent,
            originalGroup: originalGroup as unknown as GroupCloneSource,
            originalGroupEventsBefore,
            affectedGroupIds,
        };
    }

    /**
     * Actualiza solo el evento objetivo y sincroniza la ventana temporal del grupo original.
     */
    private async _updateSingleEvent(
        tx: Prisma.TransactionClient,
        context: UpdateContext,
        eventId: string,
        eventUpdateData: Prisma.EventUncheckedUpdateInput
    ) {
        const updatedEvent = await tx.event.update({
            where: { id: eventId },
            data: eventUpdateData,
        });

        await this._syncGroupWindow(tx, context.targetEvent.idGroup);

        return {
            ok: true,
            movedToNewGroup: false,
            oldGroupId: context.targetEvent.idGroup,
            newGroupId: null,
            oldGroupServicesCount: context.originalGroupEventsBefore.length,
            oldGroupWasSplit: false,
            affectedGroupIds: Array.from(context.affectedGroupIds),
            updatedEvent,
        };
    }

    /**
     * Mueve un evento a un nuevo grupo y divide los eventos restantes por continuidad temporal si hace falta.
     */
    private async _updateManyEvent(
        tx: Prisma.TransactionClient,
        context: UpdateContext,
        eventId: string,
        eventUpdateData: Prisma.EventUncheckedUpdateInput
    ) {
        const movedStartDate = eventUpdateData.startDate as Date;
        const movedEndDate = eventUpdateData.endDate as Date;

        if (movedStartDate.getTime() >= movedEndDate.getTime()) {
            throw new Error(
                withCatalogMessage(
                    ErrorCatalogByDomain.controller.validation.VALIDATION_INVALID_PAYLOAD.message,
                    "event.startDate debe ser menor que event.endDate"
                )
            );
        }

        const movedEventGroup = await this._cloneGroupWithParticipants(
            tx,
            context.originalGroup,
            movedStartDate,
            movedEndDate
        );
        context.affectedGroupIds.add(movedEventGroup.id);

        const movedEvent = await tx.event.update({
            where: { id: eventId },
            data: {
                ...eventUpdateData,
                idGroup: movedEventGroup.id,
            },
        });

        const remainingInOriginalGroup = await tx.event.findMany({
            where: {
                idGroup: context.targetEvent.idGroup,
                deletedDate: null,
            },
            select: { id: true, startDate: true, endDate: true },
            orderBy: { startDate: "asc" },
        });

        const createdSplitGroupIds = await this._splitOriginalGroupIfNeeded(
            tx,
            context,
            remainingInOriginalGroup
        );

        const movedWasLastInOriginalGroup =
            context.originalGroupEventsBefore.length > 0 &&
            context.originalGroupEventsBefore[context.originalGroupEventsBefore.length - 1].id === eventId;

        const oldGroupHasActiveEvents = await this._syncGroupWindow(tx, context.targetEvent.idGroup);

        return {
            ok: true,
            movedToNewGroup: true,
            oldGroupId: context.targetEvent.idGroup,
            newGroupId: movedEventGroup.id,
            oldGroupServicesCount: context.originalGroupEventsBefore.length,
            oldGroupHadMoreThanTwoServices: context.originalGroupEventsBefore.length > 2,
            movedWasLastInOriginalGroup,
            oldGroupWasSplit: createdSplitGroupIds.length > 0,
            oldGroupHasActiveEvents,
            splitGroupIds: createdSplitGroupIds,
            affectedGroupIds: Array.from(context.affectedGroupIds),
            updatedEvent: movedEvent,
        };
    }

    /**
     * Divide los eventos restantes del grupo original en nuevos grupos cuando hay huecos temporales.
     */
    private async _splitOriginalGroupIfNeeded(
        tx: Prisma.TransactionClient,
        context: UpdateContext,
        remainingInOriginalGroup: MinimalEvent[]
    ): Promise<string[]> {
        const segments = this._splitByTimeContinuity(remainingInOriginalGroup);
        const createdSplitGroupIds: string[] = [];

        if (segments.length === 0) {
            return createdSplitGroupIds;
        }

        const firstSegmentBounds = this._getSegmentBounds(segments[0]);
        await tx.groupEvents.update({
            where: { id: context.targetEvent.idGroup },
            data: {
                startDate: firstSegmentBounds.startDate,
                endDate: firstSegmentBounds.endDate,
            },
        });

        for (let index = 1; index < segments.length; index++) {
            const segment = segments[index];
            const segmentBounds = this._getSegmentBounds(segment);

            const splitGroup = await this._cloneGroupWithParticipants(
                tx,
                context.originalGroup,
                segmentBounds.startDate,
                segmentBounds.endDate
            );

            const segmentIds = segment.map((event) => event.id);
            await tx.event.updateMany({
                where: { id: { in: segmentIds } },
                data: { idGroup: splitGroup.id },
            });

            createdSplitGroupIds.push(splitGroup.id);
            context.affectedGroupIds.add(splitGroup.id);
        }

        return createdSplitGroupIds;
    }

    /**
     * Mapea los campos de entrada al payload de actualización de Prisma.
     */
    private _buildEventUpdateData(event: UpdateEventInput): Prisma.EventUncheckedUpdateInput {
        const data: Prisma.EventUncheckedUpdateInput = {};

        if (event.startDate !== undefined) {
            data.startDate = this._toDateOrThrow(event.startDate, "event.startDate");
        }
        if (event.endDate !== undefined) {
            data.endDate = this._toDateOrThrow(event.endDate, "event.endDate");
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

    /**
     * Valida una entrada tipo fecha y devuelve una instancia Date válida.
     */
    private _toDateOrThrow(value: string | Date, fieldName: string): Date {
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) {
            throw new Error(
                withCatalogMessage(
                    ErrorCatalogByDomain.controller.validation.VALIDATION_INVALID_PAYLOAD.message,
                    `${fieldName} es inválido`
                )
            );
        }
        return date;
    }

    /**
     * Sincroniza el rango del grupo a partir de los eventos activos actuales de ese grupo.
     */
    private _syncGroupWindow = async (tx: Prisma.TransactionClient, idGroup: string): Promise<boolean> => {
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

    /**
     * Clona un grupo junto con sus participantes para una nueva ventana temporal.
     */
    private _cloneGroupWithParticipants = async (
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

    /**
     * Divide eventos en segmentos temporales contiguos.
     */
    private _splitByTimeContinuity(events: MinimalEvent[]): MinimalEvent[][] {
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

    /**
     * Devuelve las fechas límite (inicio y fin) de un segmento.
     */
    private _getSegmentBounds(segment: MinimalEvent[]): { startDate: Date; endDate: Date } {
        const startDate = segment[0].startDate;
        const endDate = segment.reduce((maxEnd, event) => {
            return event.endDate.getTime() > maxEnd.getTime() ? event.endDate : maxEnd;
        }, segment[0].endDate);

        return { startDate, endDate };
    }
}
