import { Prisma, Event, EventType } from "@prisma/client";
import prisma from "../../../lib/prisma";
import CustomError from "../../../models/custom-error/CustomError";
import { Pagination } from "../../../models/pagination";
import { getGeneric } from "../../../utils/get-genetic/getGenetic";
import { UtilGeneral } from "../../../utils/util-general";
import { getGenericSpecial } from "../../../utils/get-genetic/calendar-event/getGenericSpecial";



export interface EventForService {
    id: number,
    title: string,
    description: string,
    startDate: Date,
    endDate: Date,
    idUserBotFk: number,
    idUserPlatformFk: string,
    idGoogleEvent: string,
    eventType: EventType,
    calendar: {
        id: number,
        idGoogleCalendar: string,
    }
}



export class EventService {
    constructor() { }

    async addEvent(item: any): Promise<EventForService> {
        try {
            return await prisma.event.create({
                data: {
                    ...item,
                    createdDate: new Date(),
                    updatedDate: new Date(),
                },
                select: {
                    id: true,
                    title: true,
                    description: true,
                    startDate: true,
                    endDate: true,
                    idUserBotFk: true,
                    idUserPlatformFk: true,
                    idServiceFk: true,
                    eventType: true,
                    idGoogleEvent: true,
                    calendar: {
                        select: {
                            id: true,
                            idGoogleCalendar: true,
                        }
                    }
                }
            });
        } catch (error: any) {
            throw new CustomError('EventService.addEvent', error);
        }
    }


    async getEventById(id: number): Promise<EventForService> {
        try {
            return await prisma.event.findUnique({
                where: { id: id },
                select: {
                    id: true,
                    title: true,
                    description: true,
                    startDate: true,
                    endDate: true,
                    idUserBotFk: true,
                    idUserPlatformFk: true,
                    idServiceFk: true,
                    idGoogleEvent: true,
                    eventType: true,
                    calendar: {
                        select: {
                            id: true,
                            idGoogleCalendar: true,
                        }
                    }
                },
            });
        } catch (error: any) {
            throw new CustomError('EventService.getEventById', error);
        }
    }
    async updateEvent(item: Partial<Event>): Promise<EventForService> {
        try {
            const id = item.id as number;
            delete item.id;

            // Construimos el objeto de datos a actualizar dinámicamente
            const updateData: any = {
                ...item,
                updatedDate: new Date(),
            };

            // Solo agrega startDate si está definido
            if (item.startDate) {
                updateData.startDate = item.startDate;
            }

            // Solo agrega endDate si está definido
            if (item.endDate) {
                updateData.endDate = item.endDate;
            }

            return await prisma.event.update({
                where: { id: id },
                data: updateData,
                select: {
                    id: true,
                    title: true,
                    description: true,
                    startDate: true,
                    endDate: true,
                    idUserBotFk: true,
                    idUserPlatformFk: true,
                    idServiceFk: true,
                    idGoogleEvent: true,
                    eventType: true,
                    calendar: {
                        select: {
                            id: true,
                            idGoogleCalendar: true,
                        }
                    }
                }
            });
        } catch (error: any) {
            throw new CustomError('EventService.updateEvent', error);
        }
    }


    async deleteEvent(id: number): Promise<Event> {
        try {
            return await prisma.event.delete({
                where: { id: id },
            });
        } catch (error: any) {
            throw new CustomError('EventService.deleteEvent', error);
        }
    }

    async getEvents(pagination: Pagination) {
        try {
            let select: Prisma.EventSelect = {
                id: true,
                title: true,
                description: true,
                startDate: true,
                endDate: true,
                idUserBotFk: true,
                idUserPlatformFk: true,
                eventType: true,

                service: {
                    select: {
                        id: true,
                        name: true,
                    }
                }

                // Calendar: {
                //     select: {
                //         id: true,
                //     }
                // }
            };

            pagination = pagination || {
                page: 1,
                itemsPerPage: 10000,
            };

            const result = await getGenericSpecial(pagination, "event", select);
            return result;
        } catch (error: any) {
            throw new CustomError('EventService.getEvents', error);
        }
    }

    getEventByIdGoogleEvent(idGoogleEvent: string) {
        try {
            return prisma.event.findFirst({
                where: {
                    idGoogleEvent: idGoogleEvent
                }
            });
        } catch (error: any) {
            throw new CustomError('EventService.getEventByIdGoogleEvent', error);
        }
    }



    /**
   * Busca eventos conflictivos en el rango de fechas dado.
   * @param idUserPlatformFk - ID del usuario de la plataforma.
   * @param idCalendarFk - ID del calendario.
   * @param startDate - Fecha de inicio del rango.
   * @param endDate - Fecha de fin del rango.
   * @param eventTypes - Array de tipos de eventos a buscar (ej. VACATION, HOLIDAY, LEAVE).
   * @returns Lista de eventos conflictivos.
   */
    async findConflictingEvents(
        idUserPlatformFk: string,
        idCalendarFk: number,
        startDate: Date,
        endDate: Date,
        eventTypes: EventType[]
    ) {
        return prisma.event.findMany({
            select: {
                id: true,
                title: true,
                startDate: true,
                endDate: true,
                eventType: true,
                idUserPlatformFk: true,
            },
            where: {
                idUserPlatformFk: idUserPlatformFk,
                idCalendarFk: idCalendarFk,
                eventType: {
                    in: eventTypes
                },
                AND: [
                    {
                        startDate: {
                            lte: endDate, // El evento comienza antes o durante el final del rango
                        }
                    },
                    {
                        endDate: {
                            gte: startDate, // El evento termina después o durante el comienzo del rango
                        }
                    }
                ]
            }
        });
    }
}
