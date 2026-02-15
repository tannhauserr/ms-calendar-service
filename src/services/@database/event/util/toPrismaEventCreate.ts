import { EventForBackend } from '../dto/EventForBackend';

// Recurrencia deshabilitada: mapper legacy mantenido en modo passthrough seguro.
export function toPrismaEventCreate(event: EventForBackend['event']): any {
    return {
        title: event?.title,
        description: event?.description,
        startDate: event?.startDate ? new Date(event.startDate) : undefined,
        endDate: event?.endDate ? new Date(event.endDate) : undefined,
        idUserPlatformFk: event?.idUserPlatformFk,
        idServiceFk: event?.idServiceFk ?? null,
        eventPurposeType: event?.eventPurposeType,
        serviceNameSnapshot: event?.serviceNameSnapshot || event?.service?.name || null,
        servicePriceSnapshot: event?.servicePriceSnapshot || event?.service?.price || null,
        serviceDiscountSnapshot: event?.serviceDiscountSnapshot || event?.service?.discount || null,
        serviceDurationSnapshot: event?.serviceDurationSnapshot || event?.service?.duration || null,
        serviceMaxParticipantsSnapshot:
            event?.serviceMaxParticipantsSnapshot || event?.service?.maxParticipants || null,
    };
}
