// src/services/event/utils/prismaEventMappers.ts
import { Prisma } from '@prisma/client';
import { EventForBackend } from '../dto/EventForBackend';

export function toPrismaEventCreate(
    event: EventForBackend['event']
): Omit<Prisma.EventCreateInput, 'recurrenceRule' | 'eventParticipant'> {
    const {
        id,                    // se lo quitas
        idRecurrenceRuleFk,    // idem
        service,               // idem (o mapéalo por nested si lo tienes)
        // idCalendarFk,
        idWorkspaceFk,
        idCompanyFk,
        idServiceFk,
        startDate,
        endDate,
        title,
        description,
        idUserPlatformFk,
        commentClient,
        eventSourceType,
        eventPurposeType,
        isEditableByClient,
        numberUpdates,
        eventStatusType,



        serviceNameSnapshot,
        servicePriceSnapshot,
        serviceDiscountSnapshot,
        serviceDurationSnapshot,
        serviceMaxParticipantsSnapshot,
       
   
        // ignora createdDate, updatedDate, relaciones extras…
    } = event;

    return {
        title,
        description,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        idUserPlatformFk,
        idWorkspaceFk,
        idCompanyFk,
        idServiceFk,
        commentClient,
        eventSourceType,
        eventPurposeType,
        isEditableByClient,
        numberUpdates,
        eventStatusType,
        serviceNameSnapshot,
        servicePriceSnapshot,
        serviceDiscountSnapshot,
        serviceDurationSnapshot,
        serviceMaxParticipantsSnapshot,
        // idRecurrenceRuleFk, // lo manejamos aparte
        // idServiceFk: service ? service.id : null, // lo manejamos aparte
        // idCalendarFk, // lo manejamos aparte

        // **nested connect** en lugar de FK raw:
        // calendar: {
        //     connect: { id: idCalendarFk }
        // }
    };
}
