import { EventStatusType } from "@prisma/client";
import { EventService } from "../../../../../../@database/event/event.service";

export async function deleteEventToCalendarHandler(
    payload: any,
    services: { eventService: EventService }
): Promise<any> {
    const { eventService } = services;
    // Se espera que payload contenga el id del evento a eliminar, por ejemplo: { idEvent }
    const { idEvent, commentClient } = payload;

    console.log('Deleting event with id', idEvent);

    // Se asume que eventService.deleteEvent elimina el registro (físicamente o marca como eliminado)
    await eventService.updateEvent({
        id: String(idEvent),
        commentClient: "-",
        eventStatusType: EventStatusType.CANCELLED_BY_CLIENT,
        deletedDate: new Date()
    });

    return { status: EventStatusType.CANCELLED_BY_CLIENT, event: { id: idEvent } };
}