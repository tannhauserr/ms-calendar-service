import { $Enums, Event, EventStatusType, Prisma } from "@prisma/client";
import prisma from "../../../lib/prisma";
import CustomError from "../../../models/custom-error/CustomError";
import { Pagination } from "../../../models/pagination";
import { getGenericSpecialEvent2 } from "../../../utils/get-genetic/calendar-event/getGenericSpecialEvent2";



export interface EventForService {
    id: string,
    title: string,
    description: string,
    startDate: Date,
    endDate: Date,
    idClientFk: true,
    idClientWorkspaceFk: true,
    idUserPlatformFk: string,
    idGoogleEvent: string,
    calendar: {
        id: string,
        idGoogleCalendar: string,
    }
}


export interface EventV2 {
    event: {
        id?: string
        title: string
        description?: string | null
        startDate: Date | string
        endDate: Date | string
        idUserPlatformFk?: string | null
        commentClient?: string | null
        idRecurrenceRuleFk?: string | null
        eventSourceType?: $Enums.EventSourceType
        isEditableByClient?: boolean
        numberUpdates?: number | null
        eventStatusType?: $Enums.EventStatusType
    },
    // recurrenceRule?: Prisma.RecurrenceRuleCreateInput | null
    recurrenceRule?: {
        id?: string
        dtstart: Date | string
        until?: Date | string | null
        rrule: string
        tzid: string
        recurrenceStatusType?: $Enums.RecurrenceStatusType
    },
    eventParticipant?: {
        id?: string;
        idEventFk?: string;
        idClientWorkspaceFk?: string;
        idClientFk?: string;
    }
}


export class EventService {
    constructor() { }

    async addEvent(item: any): Promise<any> {
        try {
            delete item?.id;
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
                    // idClientWorkspaceFk: true,
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
                            idClientWorkspaceFk: true,
                        }
                    },
                    recurrenceRule: {}
                    // eventParticipant: {
                    //     select: {
                    //         id: true,
                    //         idClientFk: true,
                    //     }
                    // }
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


    async getEventById(id: string): Promise<any> {
        try {
            return await prisma.event.findUnique({
                where: {
                    id: id,
                    eventStatusType: {
                        // not: EventStatusType.CANCELLED
                        notIn: [EventStatusType.CANCELLED, EventStatusType.CANCELLED_BY_CLIENT_REMOVED]
                    }
                },
                select: {
                    id: true,
                    title: true,
                    description: true,
                    startDate: true,
                    endDate: true,
                    // idClientFk: true,
                    // idClientWorkspaceFk: true,
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
                            idClientWorkspaceFk: true,
                        }
                    }
                    // eventParticipant: {
                    //     select: {
                    //         id: true,
                    //         idClientFk: true,
                    //     }
                    // }
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
    //         const id = item.id as string;
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
            const id = item.id as string;
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
            // if (item.eventStatusType) {
            //     updateData.eventParticipant = {
            //         updateMany: {
            //             where: {
            //                 idEventFk: id,
            //             },
            //             data: {
            //                 eventStatusType: item.eventStatusType,
            //             },
            //         },
            //     };
            // }

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
                    // idClientWorkspaceFk: true,
                    // idClientFk: true,

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
                            idClientWorkspaceFk: true,
                        }
                    }

                    // eventParticipant: {
                    //     select: {
                    //         id: true,
                    //         idClientFk: true,
                    //         eventStatusType: true,
                    //     },
                    // },
                },
            });

        } catch (error: any) {
            throw new CustomError('EventService.updateEvent', error);
        }
    }


    async deleteEvent(id: string): Promise<Event> {
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
                // idClientWorkspaceFk: true,
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
                        idClientWorkspaceFk: true,

                    }
                }
                // eventParticipant: {
                //     select: {
                //         id: true,
                //         idClientFk: true,
                //     }
                // }
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
                    // not: EventStatusType.CANCELLED
                    notIn: [
                        EventStatusType.CANCELLED,
                        EventStatusType.CANCELLED_BY_CLIENT,
                        EventStatusType.CANCELLED_BY_CLIENT_REMOVED
                    ]
                },
                idUserPlatformFk: idUserPlatformFk,
                // AND: [
                //     {
                //         startDate: {
                //             lte: endDate, // El evento comienza antes o durante el final del rango
                //         }
                //     },
                //     {
                //         endDate: {
                //             gte: startDate, // El evento termina después o durante el comienzo del rango
                //         }
                //     }
                // ]
                AND: [
                    {
                        startDate: {
                            lt: endDate, // el evento comienza estrictamente antes del final del rango
                        }
                    },
                    {
                        endDate: {
                            gt: startDate, // el evento termina estrictamente después del inicio del rango
                        }
                    }
                ]
            }
        });
    }

    async changeEventStatus(id: string, status: EventStatusType) {

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
                        // eventParticipant: {
                        //     updateMany: {
                        //         where: {
                        //             idEventFk: id,
                        //         },
                        //         data: {
                        //             eventStatusType: status,
                        //         }

                        //     }
                        // }
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
