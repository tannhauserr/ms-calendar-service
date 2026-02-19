import { Prisma } from "@prisma/client";
import prisma from "../../../../lib/prisma";
import { ErrorCatalogByDomain, withCatalogMessage } from "../../../../models/error-codes";

type Segment = {
    serviceId: string;
    userId: string;
    start: Date;
    end: Date;
};

type ServiceSnapshot = {
    name?: string | null;
    price?: number | null;
    discount?: number | null;
    duration?: number | null;
    maxParticipants?: number | null;
};

type UpdateSingleEventInput = {
    segment: Segment;
    idWorkspace: string;
    cancelledStates: string[];
    originalEventId: string;
    groupId: string;
    note?: string | null;
    isCommentRead?: boolean;
    timeZoneWorkspace: string;
    serviceSnapshot: ServiceSnapshot;
};

type RebuildBookingInput = {
    idCompany: string;
    idWorkspace: string;
    groupId: string;
    note?: string | null;
    isCommentRead?: boolean;
    timeZoneWorkspace: string;
    customer: { id: string; idClientWorkspace: string };
    chosenSegments: Segment[];
    originalIds: string[];
    originalsKept: Array<{ id: string }>;
    serviceById: Record<string, ServiceSnapshot>;
    explicitDeleteIds: string[];
};

type MoveSingleParticipantInClassEditInput = {
    originalGroupId: string;
    originalEventId: string;
    customer: { id: string; idClientWorkspace: string };
    groupId: string;
    createOrJoin: (
        tx: Prisma.TransactionClient,
        originalGroupId: string
    ) => Promise<{
        targetEventRaw: { id: string; idGroup?: string | null };
        action: "created" | "joined" | "already-in";
    }>;
};

/**
 * Persistencia para operaciones de actualización de reservas web.
 */
export class EventClientUpdatePersistence {
    /**
     * Actualiza una cita de un único segmento en una transacción atómica.
     */
    public async updateSingleEvent(input: UpdateSingleEventInput) {
        return prisma.$transaction(async (tx) => {
            const overlapping = await tx.event.findFirst({
                where: {
                    idUserPlatformFk: input.segment.userId,
                    startDate: { lt: input.segment.end },
                    endDate: { gt: input.segment.start },
                    deletedDate: null,
                    groupEvents: {
                        idWorkspaceFk: input.idWorkspace,
                        eventStatusType: { notIn: input.cancelledStates as any },
                    },
                    NOT: { id: input.originalEventId },
                },
                select: { id: true },
            });
            if (overlapping) {
                throw new Error(
                    withCatalogMessage(
                        ErrorCatalogByDomain.booking.availability.BOOKING_ERR_OVERLAP_CONFLICT.message,
                        "Ese profesional ya tiene otro evento en ese horario."
                    )
                );
            }

            await tx.groupEvents.update({
                where: { id: input.groupId },
                data: {
                    commentClient: input.note ?? null,
                    isCommentRead: input.isCommentRead ?? false,
                    timeZone: input.timeZoneWorkspace,
                },
            });

            const updatedEvent = await tx.event.update({
                where: { id: input.originalEventId },
                data: {
                    idServiceFk: input.segment.serviceId,
                    idUserPlatformFk: input.segment.userId,
                    startDate: input.segment.start,
                    endDate: input.segment.end,
                    eventPurposeType: "APPOINTMENT",
                    serviceNameSnapshot: input.serviceSnapshot?.name ?? null,
                    servicePriceSnapshot:
                        typeof input.serviceSnapshot?.price === "number"
                            ? input.serviceSnapshot.price
                            : null,
                    serviceDiscountSnapshot:
                        typeof input.serviceSnapshot?.discount === "number"
                            ? input.serviceSnapshot.discount
                            : null,
                    serviceDurationSnapshot:
                        typeof input.serviceSnapshot?.duration === "number"
                            ? input.serviceSnapshot.duration
                            : null,
                    serviceMaxParticipantsSnapshot:
                        typeof input.serviceSnapshot?.maxParticipants === "number"
                            ? input.serviceSnapshot.maxParticipants
                            : null,
                    idGroup: input.groupId,
                },
            });

            return { updatedEvent };
        });
    }

    /**
     * Reconstruye todos los segmentos de una reserva en una única transacción.
     */
    public async rebuildBooking(input: RebuildBookingInput) {
        return prisma.$transaction(async (tx) => {
            await tx.groupEvents.update({
                where: { id: input.groupId },
                data: {
                    commentClient: input.note ?? null,
                    isCommentRead: input.isCommentRead ?? false,
                    timeZone: input.timeZoneWorkspace,
                },
            });

            const existingParticipant = await tx.eventParticipant.findFirst({
                where: {
                    idGroup: input.groupId,
                    idClientWorkspaceFk: input.customer.idClientWorkspace,
                    deletedDate: null,
                },
                select: { id: true },
            });
            if (!existingParticipant) {
                await tx.eventParticipant.create({
                    data: {
                        idGroup: input.groupId,
                        idClientFk: input.customer.id,
                        idClientWorkspaceFk: input.customer.idClientWorkspace,
                    },
                });
            }

            for (const segment of input.chosenSegments) {
                const overlapping = await tx.event.findFirst({
                    where: {
                        idUserPlatformFk: segment.userId,
                        startDate: { lt: segment.end },
                        endDate: { gt: segment.start },
                        deletedDate: null,
                        groupEvents: { idWorkspaceFk: input.idWorkspace },
                        NOT: { id: { in: input.originalIds } },
                    },
                    select: { id: true },
                });
                if (overlapping) {
                    throw new Error(
                        withCatalogMessage(
                            ErrorCatalogByDomain.booking.availability.BOOKING_ERR_OVERLAP_CONFLICT.message,
                            "Un profesional tiene otro evento en el horario planificado."
                        )
                    );
                }
            }

            const toUpdate = Math.min(input.originalsKept.length, input.chosenSegments.length);

            const updated: any[] = [];
            for (let i = 0; i < toUpdate; i++) {
                const target = input.originalsKept[i];
                const segment = input.chosenSegments[i];
                const snapshot = input.serviceById[segment.serviceId];

                const event = await tx.event.update({
                    where: { id: target.id },
                    data: {
                        idServiceFk: segment.serviceId,
                        idUserPlatformFk: segment.userId,
                        startDate: segment.start,
                        endDate: segment.end,
                        eventPurposeType: "APPOINTMENT",
                        idGroup: input.groupId,
                        serviceNameSnapshot: snapshot?.name ?? null,
                        servicePriceSnapshot: typeof snapshot?.price === "number" ? snapshot.price : null,
                        serviceDiscountSnapshot:
                            typeof snapshot?.discount === "number" ? snapshot.discount : null,
                        serviceDurationSnapshot:
                            typeof snapshot?.duration === "number" ? snapshot.duration : null,
                        serviceMaxParticipantsSnapshot:
                            typeof snapshot?.maxParticipants === "number"
                                ? snapshot.maxParticipants
                                : null,
                    },
                });
                updated.push(event);
            }

            const created: any[] = [];
            for (let i = toUpdate; i < input.chosenSegments.length; i++) {
                const segment = input.chosenSegments[i];
                const snapshot = input.serviceById[segment.serviceId];
                const event = await tx.event.create({
                    data: {
                        idCompanyFk: input.idCompany,
                        title: snapshot?.name,
                        idServiceFk: segment.serviceId,
                        idUserPlatformFk: segment.userId,
                        startDate: segment.start,
                        endDate: segment.end,
                        eventPurposeType: "APPOINTMENT",
                        idGroup: input.groupId,
                        serviceNameSnapshot: snapshot?.name ?? null,
                        servicePriceSnapshot: typeof snapshot?.price === "number" ? snapshot.price : null,
                        serviceDiscountSnapshot:
                            typeof snapshot?.discount === "number" ? snapshot.discount : null,
                        serviceDurationSnapshot:
                            typeof snapshot?.duration === "number" ? snapshot.duration : null,
                        serviceMaxParticipantsSnapshot:
                            typeof snapshot?.maxParticipants === "number"
                                ? snapshot.maxParticipants
                                : null,
                    },
                });
                created.push(event);
            }

            const toSoftDeleteIds = new Set<string>(input.explicitDeleteIds);
            for (let i = input.chosenSegments.length; i < input.originalsKept.length; i++) {
                toSoftDeleteIds.add(input.originalsKept[i].id);
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
    }

    /**
     * Mueve un participante dentro de una clase manteniendo consistencia del grupo.
     */
    public async moveSingleParticipantInClassEdit(input: MoveSingleParticipantInClassEditInput) {
        return prisma.$transaction(async (tx) => {
            const activeParticipants = await tx.eventParticipant.findMany({
                where: { idGroup: input.originalGroupId, deletedDate: null },
                select: {
                    id: true,
                    idClientFk: true,
                    idClientWorkspaceFk: true,
                },
            });

            const mine = activeParticipants.filter(
                (participant) =>
                    (participant.idClientFk && participant.idClientFk === input.customer.id) ||
                    (participant.idClientWorkspaceFk &&
                        participant.idClientWorkspaceFk === input.customer.idClientWorkspace)
            );
            if (!mine.length) {
                throw new Error(
                    withCatalogMessage(
                        ErrorCatalogByDomain.booking.authorization.BOOKING_ERR_NOT_OWNER.message,
                        "Este cliente no esta asociado al evento original (class edit)."
                    )
                );
            }

            const now = new Date();
            const deletedEventIds: string[] = [];

            if (activeParticipants.length === 1) {
                await tx.event.updateMany({
                    where: { idGroup: input.originalGroupId },
                    data: { deletedDate: now },
                });
                await tx.eventParticipant.updateMany({
                    where: { idGroup: input.originalGroupId, deletedDate: null },
                    data: { deletedDate: now },
                });
                deletedEventIds.push(input.originalEventId);
            } else {
                await tx.eventParticipant.updateMany({
                    where: {
                        idGroup: input.originalGroupId,
                        deletedDate: null,
                        OR: [
                            { idClientFk: input.customer.id },
                            { idClientWorkspaceFk: input.customer.idClientWorkspace },
                        ],
                    },
                    data: { deletedDate: now },
                });
            }

            const { targetEventRaw, action } = await input.createOrJoin(tx, input.originalGroupId);
            const targetEvent =
                targetEventRaw?.idGroup === input.groupId
                    ? targetEventRaw
                    : await tx.event.update({
                          where: { id: targetEventRaw.id },
                          data: { idGroup: input.groupId },
                      });

            return { targetEvent, action, deletedEventIds };
        });
    }
}
