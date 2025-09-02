import { EventSourceType, EventStatusType } from "@prisma/client";
import moment from "moment";
import prisma from "../../../../../../../lib/prisma";
import { BusinessHourService } from "../../../../../../@database/all-business-services/business-hours/business-hours.service";
import { TemporaryBusinessHourService } from "../../../../../../@database/all-business-services/temporary-business-hour/temporary-business-hour.service";
import { WorkerBusinessHourService } from "../../../../../../@database/all-business-services/worker-business-hours/worker-business-hours.service";
import { EventService } from "../../../../../../@database/event/event.service";
import { checkWorkerAvailability } from "../utils/checkWorkerAvailabity";


export async function updateEventToCalendarHandler(
    payload: any,
    services: {
        eventService: EventService,
        businessHoursService: BusinessHourService,
        workerHoursService: WorkerBusinessHourService,
        temporaryHoursService: TemporaryBusinessHourService,
    }
): Promise<any> {
    const { eventService, businessHoursService, workerHoursService, temporaryHoursService } = services;

    // Se asume que en payload se envía el id del evento a actualizar (por ejemplo, idEvent)
    const {
        idEvent,
        idUserList = [],
        idClient,
        idCompany,
        idWorkspace,
        idService,
        eventStart,
        eventEnd,
        commentClient = ""
    } = payload;

    console.log('Updating event to calendar', payload);

    const startDate = moment(eventStart, 'YYYY-MM-DD HH:mm').toDate();
    const endDate = moment(eventEnd, 'YYYY-MM-DD HH:mm').toDate();

    // Obtener horarios de negocio, trabajadores y temporales
    const businessHours = await businessHoursService.getBusinessHoursFromRedis(idCompany, idWorkspace);
    const workerHoursMap = await workerHoursService.getWorkerHoursFromRedis(idUserList, idWorkspace);
    const temporaryHoursMap = await temporaryHoursService.getTemporaryHoursFromRedis(idUserList, idWorkspace);

    let selectedUser: string | null = null;

    // Verificar disponibilidad, excluyendo el evento que se está actualizando
    for (const idUser of idUserList) {
        console.log(" ");
        console.log("mira el idUser", idUser);
        const isAvailable = await checkWorkerAvailability(
            idUser,
            idCompany,
            idWorkspace,
            startDate,
            endDate,
            businessHours,
            workerHoursMap[idUser],
            temporaryHoursMap[idUser],
            Number(idEvent),
        );

        console.log("Es disponible?", isAvailable);

        if (isAvailable) {
            selectedUser = idUser;
            break;
        }
    }

    console.log("mira cual es el selectedUser", selectedUser);

    if (!selectedUser) {
        console.log('No available user for the requested time slot');
        return { status: EventStatusType.CANCELLED };
    }

    // Upsert del calendario
    const calendar = await prisma.calendar.upsert({
        where: {
            idCompanyFk_idWorkspaceFk: {
                idCompanyFk: idCompany,
                idWorkspaceFk: idWorkspace,
            },
        },
        update: {},
        create: {
            idCompanyFk: idCompany,
            idWorkspaceFk: idWorkspace,
        },
    });

    // Armar datos del evento a actualizar
    const eventData: any = {
        title: "Cita Bot",
        idUserPlatformFk: selectedUser,
        idClientFk: idClient,
        idClientWorkspaceFk: "MANDARLO_AL_CONSUMER",
        startDate,
        endDate,
        commentClient: commentClient.substring(0, 255),
        eventSourceType: EventSourceType.BOT,
        eventStatusType: EventStatusType.CONFIRMED,
        calendar: {
            connect: { id: calendar.id }
        },
    };

    if (idService && Number(idService)) {
        eventData.service = {
            connect: { id: Number(idService) }
        };
    }

    // Se asume que eventService cuenta con un método updateEvent que recibe el id y los nuevos datos
    const eventUpdated = await eventService.updateEvent({
        id: Number(idEvent),
        ...eventData,
    });
    console.log("Evento actualizado:", eventUpdated);
    // Si el evento no se encuentra, se puede manejar como un error o retornar un estado específico
    if (!eventUpdated) {
        console.log("Evento no encontrado para actualizar");
        return { status: EventStatusType.CANCELLED };
    };

    return { status: EventStatusType.CONFIRMED, event: eventUpdated };
}
