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
        idCalendarFk,
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
   
        // ignora createdDate, updatedDate, relaciones extras…
    } = event;

    return {
        title,
        description,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        idUserPlatformFk,
        commentClient,
        eventSourceType,
        eventPurposeType,
        isEditableByClient,
        numberUpdates,
        eventStatusType,

        // **nested connect** en lugar de FK raw:
        calendar: {
            connect: { id: idCalendarFk }
        }
    };
}
