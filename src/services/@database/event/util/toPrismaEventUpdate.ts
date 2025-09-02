

import { Prisma } from '@prisma/client';
import { EventForBackend } from '../dto/EventForBackend';



export function toPrismaEventScalars(
    e: EventForBackend['event']
): Omit<Prisma.EventUncheckedCreateInput,
    "id" | "createdDate" | "updatedDate" | "deletedDate"> {
    return {
        title: e.title,
        description: e.description,
        startDate: new Date(e.startDate),
        endDate: new Date(e.endDate),
        idUserPlatformFk: e.idUserPlatformFk,
        commentClient: e.commentClient ?? null,
        eventSourceType: e.eventSourceType,
        eventPurposeType: e.eventPurposeType,
        isEditableByClient: e.isEditableByClient,
        numberUpdates: e.numberUpdates,
        eventStatusType: e.eventStatusType,
        idServiceFk: e.service?.id ?? null,
        idCalendarFk: e.idCalendarFk,

        serviceDiscountSnapshot: e.serviceDiscountSnapshot ?? null,
        servicePriceSnapshot: e.servicePriceSnapshot ?? null,
        serviceNameSnapshot: e.serviceNameSnapshot ?? null,
        serviceDurationSnapshot: e.serviceDurationSnapshot ?? null,
    };
}



export function toPrismaEventUpdate(
    e: EventForBackend['event']
): Omit<Prisma.EventUpdateInput, 'recurrenceRule' | 'eventParticipant' | 'service' | 'calendar'> {
    return {
        title: e.title,
        description: e.description,
        startDate: new Date(e.startDate),
        endDate: new Date(e.endDate),
        idUserPlatformFk: e.idUserPlatformFk,
        commentClient: e.commentClient ?? null,
        eventSourceType: e.eventSourceType,
        eventPurposeType: e.eventPurposeType,
        isEditableByClient: e.isEditableByClient,
        numberUpdates: e.numberUpdates,
        eventStatusType: e.eventStatusType,
        
        serviceDiscountSnapshot: e.serviceDiscountSnapshot ?? null,
        servicePriceSnapshot: e.servicePriceSnapshot ?? null,
        serviceNameSnapshot: e.serviceNameSnapshot ?? null,
        serviceDurationSnapshot: e.serviceDurationSnapshot ?? null,
        // NO scalars de FK aquí

        
    };
}


/** Construye el objeto `service` y `eventParticipant` para un update */
export function buildNestedUpdates(
    event: EventForBackend['event'],
    participants?: EventForBackend['eventParticipant'],
    participantsToDelete?: EventForBackend['eventParticipantDelete']
): Pick<
    Prisma.EventUpdateInput,
    'service' | 'eventParticipant'
> {
    const ops: Partial<Prisma.EventUpdateInput> = {};

    if (event.service?.id) {
        ops.service = { connect: { id: event.service.id } };
    }

    // participantes
    const creates = participants
        ? participants.filter(p => !p.id).map(p => ({
            idClientFk: p.idClientFk!,
            idClientWorkspaceFk: p.idClientWorkspaceFk!,
        }))
        : [];

    const updates = participants
        ? participants.filter(p => p.id).map(p => ({
            where: { id: p.id! },
            data: {
                idClientFk: p.idClientFk!,
                idClientWorkspaceFk: p.idClientWorkspaceFk!,
            }
        }))
        : [];

    const deletes = participantsToDelete
        ? participantsToDelete.filter(d => d.id).map(d => ({ id: d.id! }))
        : [];

    if (creates.length || updates.length || deletes.length) {
        ops.eventParticipant = {
            ...(creates.length ? { create: creates } : {}),
            ...(updates.length ? { updateMany: updates } : {}),
            ...(deletes.length ? { deleteMany: deletes } : {}),
        };
    }

    return ops as any;
}


