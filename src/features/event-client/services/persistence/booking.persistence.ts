import { Prisma } from "@prisma/client";
import prisma from "../../../../lib/prisma";
import type { AssignmentSegment } from "../../domain";

type OverlappingGroupCandidate = {
    id: string;
    idUserPlatformFk: string | null;
    startDate: Date;
    endDate: Date;
    groupEvents: {
        eventParticipant: Array<{
            idClientFk: string | null;
            idClientWorkspaceFk: string | null;
        }>;
    } | null;
};

type CreatedEventLike = {
    id?: string;
    idGroup?: string | null;
};

type CreatedItemLike =
    | CreatedEventLike
    | {
          event?: CreatedEventLike;
      };

type FindOverlappingGroupCandidatesInput = {
    idWorkspace: string;
    serviceId: string;
    eligibleUserIds: string[];
    startDate: Date;
    endDate: Date;
    excludeEventId?: string;
};

type CreateAssignmentsAndSyncGroupIdInput<TCreated extends CreatedItemLike> = {
    assignment: AssignmentSegment[];
    createEvent: (
        tx: Prisma.TransactionClient,
        segment: AssignmentSegment
    ) => Promise<TCreated>;
};

/**
 * Persistencia de reservas web de clientes.
 */
export class BookingPersistence {
    /**
     * Obtiene eventos grupales que se solapan para intentar unir al cliente.
     */
    public async findOverlappingGroupCandidates(
        input: FindOverlappingGroupCandidatesInput
    ): Promise<OverlappingGroupCandidate[]> {
        if (!input.eligibleUserIds.length) {
            return [];
        }

        return prisma.event.findMany({
            where: {
                idServiceFk: input.serviceId,
                idUserPlatformFk: { in: input.eligibleUserIds },
                startDate: { lt: input.endDate },
                endDate: { gt: input.startDate },
                groupEvents: {
                    idWorkspaceFk: input.idWorkspace,
                    eventStatusType: {
                        notIn: ["CANCELLED", "CANCELLED_BY_CLIENT", "CANCELLED_BY_CLIENT_REMOVED"],
                    },
                },
                ...(input.excludeEventId ? { id: { not: input.excludeEventId } } : {}),
                deletedDate: null,
            },
            orderBy: { startDate: "asc" },
            select: {
                id: true,
                idUserPlatformFk: true,
                startDate: true,
                endDate: true,
                groupEvents: {
                    select: {
                        eventParticipant: {
                            where: { deletedDate: null },
                            select: { idClientFk: true, idClientWorkspaceFk: true },
                        },
                    },
                },
            },
        });
    }

    /**
     * Crea los eventos en transacción y normaliza idGroup para todos los creados.
     */
    public async createAssignmentsAndSyncGroupId<TCreated extends CreatedItemLike>(
        input: CreateAssignmentsAndSyncGroupIdInput<TCreated>
    ): Promise<TCreated[]> {
        return prisma.$transaction(async (tx) => {
            const createdItems: TCreated[] = [];

            for (const segment of input.assignment) {
                const created = await input.createEvent(tx, segment);
                createdItems.push(created);
            }

            const coreEvents = createdItems
                .map((item) => this._getCoreEvent(item))
                .filter(this._hasId);

            if (coreEvents.length > 0) {
                const targetGroupId = coreEvents[0].idGroup ?? coreEvents[0].id;
                const ids = coreEvents.map((event) => event.id);

                await tx.event.updateMany({
                    where: { id: { in: ids } },
                    data: { idGroup: targetGroupId },
                });

                for (const item of createdItems) {
                    const event = this._getCoreEvent(item);
                    if (event && event.id && ids.includes(event.id)) {
                        event.idGroup = targetGroupId;
                    }
                }
            }

            return createdItems;
        });
    }

    /**
     * Devuelve el evento núcleo desde estructuras creadas en write services.
     */
    private _getCoreEvent(item: CreatedItemLike): CreatedEventLike | null {
        if (!item) {
            return null;
        }

        if ("event" in item && item.event) {
            return item.event;
        }

        if ("id" in item || "idGroup" in item) {
            return item;
        }

        return null;
    }

    /**
     * Type guard para eventos con id.
     */
    private _hasId(
        event: CreatedEventLike | null
    ): event is { id: string; idGroup?: string | null } {
        return !!event?.id;
    }
}
