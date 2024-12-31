import { Prisma, Event, EventStatusType } from "@prisma/client";
import prisma from "../../../lib/prisma";
import CustomError from "../../../models/custom-error/CustomError";
import { Pagination } from "../../../models/pagination";
import { getGeneric } from "../../../utils/get-genetic/getGenetic";
import { UtilGeneral } from "../../../utils/util-general";
import { getGenericSpecial } from "../../../utils/get-genetic/calendar-event/getGenericSpecial";
import { getGenericSpecialEvent2 } from "../../../utils/get-genetic/calendar-event/getGenericSpecialEvent2";



export interface EventForService {
    id: number,
    title: string,
    description: string,
    startDate: Date,
    endDate: Date,
    idClientFk: number,
    idUserPlatformFk: string,
    idGoogleEvent: string,
    calendar: {
        id: number,
        idGoogleCalendar: string,
    }
}



export class EventService {
    constructor() { }

    async addEvent(item: any): Promise<any> {
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
                    // idClientFk: true,
                    idUserPlatformFk: true,
                    idServiceFk: true,
                    eventPurposeType: true,
                    eventSourceType: true,
                    eventStatusType: true,

                    service: {
                        select: {
                            id: true,
                            name: true,
                            description: true,
                        }
                    },
                    eventParticipant: {
                        select: {
                            id: true,
                            idClientFk: true,
                        }
                    }
                    // idGoogleEvent: true,
                    // calendar: {
                    //     select: {
                    //         id: true,
                    //         idGoogleCalendar: true,
                    //     }
                    // }
                }
            });
        } catch (error: any) {
            throw new CustomError('EventService.addEvent', error);
        }
    }


    async getEventById(id: number): Promise<any> {
        try {
            return await prisma.event.findUnique({
                where: {
                    id: id,
                    eventStatusType: {
                        not: EventStatusType.CANCELLED
                    }
                },
                select: {
                    id: true,
                    title: true,
                    description: true,
                    startDate: true,
                    endDate: true,
                    // idClientFk: true,
                    idUserPlatformFk: true,
                    idServiceFk: true,
                    eventPurposeType: true,
                    eventSourceType: true,
                    eventStatusType: true,

                    service: {
                        select: {
                            id: true,
                            name: true,
                            description: true,
                        }
                    },
                    eventParticipant: {
                        select: {
                            id: true,
                            idClientFk: true,
                        }
                    }
                    // calendar: {
                    //     select: {
                    //         id: true,
                    //         idGoogleCalendar: true,
                    //     }
                    // }


                },
            });
        } catch (error: any) {
            throw new CustomError('EventService.getEventById', error);
        }
    }
    // async updateEvent(item: Partial<Event>): Promise<any> {
    //     try {
    //         const id = item.id as number;
    //         delete item.id;

    //         // Construimos el objeto de datos a actualizar dinámicamente
    //         const updateData: any = {
    //             ...item,
    //             updatedDate: new Date(),
    //         };

    //         // Solo agrega startDate si está definido
    //         if (item.startDate) {
    //             updateData.startDate = item.startDate;
    //         }

    //         // Solo agrega endDate si está definido
    //         if (item.endDate) {
    //             updateData.endDate = item.endDate;
    //         }

    //         return await prisma.event.update({
    //             where: { id: id },
    //             data: updateData,
    //             select: {
    //                 id: true,
    //                 title: true,
    //                 description: true,
    //                 startDate: true,
    //                 endDate: true,
    //                 // idClientFk: true,
    //                 idUserPlatformFk: true,
    //                 idServiceFk: true,
    //                 eventPurposeType: true,
    //                 eventSourceType: true,
    //                 eventStatusType: true,

    //                 service: {
    //                     select: {
    //                         id: true,
    //                         name: true,
    //                         description: true,
    //                     }
    //                 },

    //                 eventParticipant: {
    //                     select: {
    //                         id: true,
    //                         idClientFk: true,
    //                     }
    //                 }

    //                 // calendar: {
    //                 //     select: {
    //                 //         id: true,
    //                 //         idGoogleCalendar: true,
    //                 //     }
    //                 // }
    //             }
    //         });
    //     } catch (error: any) {
    //         throw new CustomError('EventService.updateEvent', error);
    //     }
    // }

    async updateEvent(item: Partial<Event>): Promise<any> {
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

            // Incluye la lógica para actualizar el estado de los participantes
            if (item.eventStatusType) {
                updateData.eventParticipant = {
                    updateMany: {
                        where: {
                            idEventFk: id,
                        },
                        data: {
                            eventStatusType: item.eventStatusType,
                        },
                    },
                };
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
                    idUserPlatformFk: true,
                    idServiceFk: true,
                    eventPurposeType: true,
                    eventSourceType: true,
                    eventStatusType: true,

                    service: {
                        select: {
                            id: true,
                            name: true,
                            description: true,
                        },
                    },

                    eventParticipant: {
                        select: {
                            id: true,
                            idClientFk: true,
                            eventStatusType: true,
                        },
                    },
                },
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

    async getEvents(pagination: Pagination, notCancelled: boolean = true): Promise<any> {
        try {
            let select: Prisma.EventSelect = {
                id: true,
                title: true,
                description: true,
                startDate: true,
                endDate: true,
                // idClientFk: true,
                idUserPlatformFk: true,
                eventStatusType: true,
                eventPurposeType: true,
                eventSourceType: true,

                service: {
                    select: {
                        id: true,
                        name: true,
                        description: true,
                    }
                },
                eventParticipant: {
                    select: {
                        id: true,
                        idClientFk: true,
                    }
                }
                // Calendar: {
                //     select: {
                //         id: true,
                //     }
                // }
            };

            if (notCancelled) {

                pagination = pagination || {
                    page: 1,
                    itemsPerPage: 10000,
                };

                // const result = await getGenericSpecial(pagination, "event", select, notCancelled);
                // const result = await getGeneric(pagination, "event", select);
                const result = await getGenericSpecialEvent2(pagination, "event", select, notCancelled);

                return result;
            } else {

                pagination = pagination || {
                    page: 1,
                    itemsPerPage: 10,
                };

                if (!pagination?.orderBy) {
                    pagination.orderBy = {
                        field: 'startDate',
                        order: 'desc' as 'asc' | 'desc',
                    }
                }
                const result = await getGenericSpecialEvent2(pagination, "event", select);

                console.log("mira que es result", result)
                return result;
            }


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
   * @returns Lista de eventos conflictivos.
   */
    async findConflictingEvents(
        idUserPlatformFk: string,
        idCalendarFk: number,
        startDate: Date,
        endDate: Date,
    ) {
        return prisma.event.findMany({
            select: {
                id: true,
                title: true,
                startDate: true,
                endDate: true,
                idUserPlatformFk: true,
            },
            where: {
                eventStatusType: {
                    not: EventStatusType.CANCELLED
                },
                idUserPlatformFk: idUserPlatformFk,
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

    async changeEventStatus(id: number, status: EventStatusType) {

        try {

            const currentEvent = await prisma.event.findUnique({
                where: { id: id },
                select: {
                    eventStatusType: true,
                }
            });

            if (currentEvent?.eventStatusType === EventStatusType.CANCELLED) {
                // Mandar petición log de que se está intentando modificar un evento cancelado
                return undefined;
            }

            if (currentEvent?.eventStatusType === EventStatusType.PENDING
                || (currentEvent.eventStatusType === EventStatusType.CONFIRMED && status !== EventStatusType.PENDING)) {
                const eventUpdated = await prisma.event.update({
                    where: { id: id },
                    data: {
                        eventStatusType: status,

                        // TODO: Lo de eventParticipant se hizo nuevo el 27 de diciembre del 2024
                        eventParticipant: {
                            updateMany: {
                                where: {
                                    idEventFk: id,
                                },
                                data: {
                                    eventStatusType: status,
                                }

                            }
                        }
                    },
                });

                // await prisma.eventParticipant.updateMany({
                //     where: {
                //         idEventFk: id,
                //     },
                //     data: {
                //         eventStatusType: status,
                //     }
                // })

                return eventUpdated;
            } else {
                // Mandar petición log de que se está intentando modificar un evento confirmado
                return undefined;
            }


        } catch (error: any) {
            throw new CustomError('EventService.changeEventStatus', error);
        }
    }
}
