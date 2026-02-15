import { EventForBackend } from '../dto/EventForBackend';

// Recurrencia deshabilitada: mappers legacy mantenidos en modo no estricto.
export function toPrismaEventScalars(e: EventForBackend['event']): any {
    return {
        idGroup: e?.idGroup as string,
        idCompanyFk: e?.idCompanyFk,
        title: e?.title,
        description: e?.description,
        startDate: e?.startDate ? new Date(e.startDate) : undefined,
        endDate: e?.endDate ? new Date(e.endDate) : undefined,
        idUserPlatformFk: e?.idUserPlatformFk,
        eventPurposeType: e?.eventPurposeType,
        idServiceFk: e?.idServiceFk ?? null,
        serviceDiscountSnapshot: e?.serviceDiscountSnapshot || e?.service?.discount || null,
        servicePriceSnapshot: e?.servicePriceSnapshot || e?.service?.price || null,
        serviceNameSnapshot: e?.serviceNameSnapshot || e?.service?.name || null,
        serviceDurationSnapshot: e?.serviceDurationSnapshot || e?.service?.duration || null,
        serviceMaxParticipantsSnapshot:
            e?.serviceMaxParticipantsSnapshot || e?.service?.maxParticipants || null,
    };
}

export function toPrismaEventUpdate(e: EventForBackend['event']): any {
    return {
        title: e?.title,
        description: e?.description,
        startDate: e?.startDate ? new Date(e.startDate) : undefined,
        endDate: e?.endDate ? new Date(e.endDate) : undefined,
        idUserPlatformFk: e?.idUserPlatformFk,
        idServiceFk: e?.idServiceFk ?? null,
        eventPurposeType: e?.eventPurposeType,
        serviceDiscountSnapshot: e?.serviceDiscountSnapshot || e?.service?.discount || null,
        servicePriceSnapshot: e?.servicePriceSnapshot || e?.service?.price || null,
        serviceNameSnapshot: e?.serviceNameSnapshot || e?.service?.name || null,
        serviceDurationSnapshot: e?.serviceDurationSnapshot || e?.service?.duration || null,
        serviceMaxParticipantsSnapshot:
            e?.serviceMaxParticipantsSnapshot || e?.service?.maxParticipants || null,
    };
}

export function buildNestedUpdates(): any {
    return {};
}
