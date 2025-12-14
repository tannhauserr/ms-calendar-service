

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
        idServiceFk: e.idServiceFk ?? null,
        // idCalendarFk: e.idCalendarFk,
        idWorkspaceFk: e.idWorkspaceFk,
        idCompanyFk: e.idCompanyFk,

        serviceDiscountSnapshot: e?.serviceDiscountSnapshot || e?.service?.discount || null,
        servicePriceSnapshot: e?.servicePriceSnapshot || e?.service?.price || null,
        serviceNameSnapshot: e?.serviceNameSnapshot || e?.service?.name || null,
        serviceDurationSnapshot: e?.serviceDurationSnapshot || e?.service?.duration || null,
        serviceMaxParticipantsSnapshot: e?.serviceMaxParticipantsSnapshot || e?.service?.maxParticipants || null,
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
        idWorkspaceFk: e.idWorkspaceFk,
        idCompanyFk: e.idCompanyFk,
        idServiceFk: e.idServiceFk ?? null,

        commentClient: e.commentClient ?? null,
        eventSourceType: e.eventSourceType,
        eventPurposeType: e.eventPurposeType,
        isEditableByClient: e.isEditableByClient,
        numberUpdates: e.numberUpdates,
        eventStatusType: e.eventStatusType,

        serviceDiscountSnapshot: e?.serviceDiscountSnapshot || e?.service?.discount || null,
        servicePriceSnapshot: e?.servicePriceSnapshot || e?.service?.price || null,
        serviceNameSnapshot: e?.serviceNameSnapshot || e?.service?.name || null,
        serviceDurationSnapshot: e?.serviceDurationSnapshot || e?.service?.duration || null,
        serviceMaxParticipantsSnapshot: e?.serviceMaxParticipantsSnapshot || e?.service?.maxParticipants || null,
        // NO scalars de FK aquí

        // No incluir idGroup, ya que es algo que nunca se cambiaría en un update

    };
}


/** Construye el objeto `service` y `eventParticipant` para un update */
export function buildNestedUpdates(
    event: EventForBackend['event'],
    participants?: EventForBackend['eventParticipant'],
    participantsToDelete?: EventForBackend['eventParticipantDelete']
): Pick<
    Prisma.EventUpdateInput,
    'eventParticipant'
> {
    const ops: Partial<Prisma.EventUpdateInput> = {};



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


