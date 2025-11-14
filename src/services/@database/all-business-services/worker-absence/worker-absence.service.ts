import { Prisma, WorkerAbsence } from "@prisma/client";
import prisma from "../../../../lib/prisma";
import CustomError from "../../../../models/custom-error/CustomError";
import { TIME_SECONDS } from "../../../../constant/time";
import moment from "moment";
import { Pagination } from "../../../../models/pagination";
import { getGeneric } from "../../../../utils/get-genetic/getGenetic";

export class WorkerAbsenceService {
    constructor() { }

    /**
     * Crear una nueva ausencia
     */
    // async addWorkerAbsence(item: Prisma.WorkerAbsenceCreateInput): Promise<WorkerAbsence> {
    //     try {
    //         return await prisma.workerAbsence.create({
    //             data: {
    //                 ...item,
    //                 createdDate: new Date(),
    //                 updatedDate: new Date(),
    //             },
    //         });
    //     } catch (error: any) {
    //         throw new CustomError("WorkerAbsenceService.addWorkerAbsence", error);
    //     }
    // }

    async getWorkerAbsences(pagination: Pagination): Promise<any> {

        try {
            const select: Prisma.WorkerAbsenceSelect = {
                id: true,
                // idCompanyFk: true,
                idWorkspaceFk: true,
                idUserFk: true,
                title: true,
                startDate: true,
                endDate: true,
                description: true,
                eventPurposeType: true,
            };

            const result = await getGeneric(pagination, "workerAbsence", select);

            return result;

        } catch (error: any) {
            throw new CustomError("WorkerAbsenceService.getWorkerAbsences", error);
        }
    }

    async addWorkerAbsence(item: Prisma.WorkerAbsenceCreateInput): Promise<{ absence: WorkerAbsence; event: any }> {
        try {
            const result = await prisma.$transaction(async (tx) => {
                // Buscar el calendario usando idCompanyFk e idWorkspaceFk
                if (!item.idWorkspaceFk) {
                    throw new Error("El idWorkspaceFk es requerido para obtener el calendario");
                }
             

                const startDate = moment(item.startDate).startOf("day").toDate();
                const endDate = moment(item.endDate).endOf("day").toDate();

                // Crear el evento asociado, usando el id del calendario obtenido
                const eventData: Prisma.EventCreateInput = {
                    title: item.title,
                    description: item.description,
                    startDate: startDate,
                    endDate: endDate,
                    idUserPlatformFk: item.idUserFk,
                    // calendar: { connect: { id: calendar.id } },
                    idWorkspaceFk: item.idWorkspaceFk!,
                    idCompanyFk: item.idCompanyFk!,
                    eventPurposeType: item.eventPurposeType,
                    allDay: true
                    // Otros campos que sean necesarios en tu lógica
                };
                const createdEvent = await tx.event.create({ data: eventData });

                // Crear la ausencia conectando el evento creado
                const createdAbsence = await tx.workerAbsence.create({
                    data: {
                        ...item,
                        event: { connect: { id: createdEvent.id } },
                        startDate: startDate,
                        endDate: endDate,
                        createdDate: new Date(),
                        updatedDate: new Date(),
                    },
                });

                return {
                    absence: createdAbsence,
                    event: createdEvent
                };
            });

            return result;
        } catch (error: any) {
            throw new CustomError("WorkerAbsenceService.addWorkerAbsence", error);
        }
    }



    /**
     * Obtener una ausencia por su ID
     */
    async getWorkerAbsenceById(id: string): Promise<WorkerAbsence | null> {
        try {
            return await prisma.workerAbsence.findUnique({
                where: { id },
                select: {
                    id: true,
                    title: true,
                    idUserFk: true,
                    idCompanyFk: true,
                    idWorkspaceFk: true,
                    eventPurposeType: true,
                    startDate: true,
                    endDate: true,
                    // type: true,
                    description: true,
                    idEventFk: true,
                    createdDate: true,
                    updatedDate: true,
                    deletedDate: true,
                },
            });
        } catch (error: any) {
            throw new CustomError("WorkerAbsenceService.getWorkerAbsenceById", error);
        }
    }

    /**
     * Obtener ausencias de un usuario específico
     */
    async getWorkerAbsencesByUser(idUserFk: string): Promise<WorkerAbsence[]> {
        try {
            return await prisma.workerAbsence.findMany({
                where: { idUserFk, deletedDate: null },
                orderBy: { startDate: "asc" },
            });
        } catch (error: any) {
            throw new CustomError("WorkerAbsenceService.getWorkerAbsencesByUser", error);
        }
    }

    /**
     * Obtener ausencias por establecimiento
     */
    async getWorkerAbsencesByWorkspace(idWorkspaceFk: string): Promise<WorkerAbsence[]> {
        try {
            return await prisma.workerAbsence.findMany({
                where: {
                    idWorkspaceFk,
                    deletedDate: null
                },
                orderBy: { startDate: "asc" },
            });
        } catch (error: any) {
            throw new CustomError("WorkerAbsenceService.getWorkerAbsencesByWorkspace", error);
        }
    }

    /**
     * Actualizar una ausencia existente
     */
    // async updateWorkerAbsence(item: WorkerAbsence): Promise<WorkerAbsence> {
    //     try {
    //         const id = item.id as string;
    //         delete item.id;

    //         return await prisma.workerAbsence.update({
    //             where: { id },
    //             data: {
    //                 ...item,
    //                 updatedDate: new Date(),
    //             },
    //         });
    //     } catch (error: any) {
    //         throw new CustomError("WorkerAbsenceService.updateWorkerAbsence", error);
    //     }
    // }

    async updateWorkerAbsence(item: WorkerAbsence): Promise<{ absence: WorkerAbsence; event: any }> {
        try {
            const result = await prisma.$transaction(async (tx) => {
                let absenceId = item.id as string;
                let eventId: string;

                const startDate = moment(item.startDate).startOf("day").toDate();
                const endDate = moment(item.endDate).endOf("day").toDate();

                // Si viene idEventFk pero no id, buscar la ausencia por idEventFk
                if (!absenceId && item.idEventFk) {
                    const foundAbsence = await tx.workerAbsence.findFirst({
                        where: { idEventFk: item.idEventFk },
                        select: { id: true, idEventFk: true }
                    });

                    if (!foundAbsence) {
                        // No se encontró ausencia con ese idEventFk, no hacer nada
                        throw new Error("No se encontró ausencia asociada al evento especificado");
                    }

                    absenceId = foundAbsence.id;
                    eventId = foundAbsence.idEventFk!;
                } else if (absenceId) {
                    // Si viene id, obtener la ausencia actual para obtener el idEventFk
                    const currentAbsence = await tx.workerAbsence.findUnique({
                        where: { id: absenceId },
                        select: { idEventFk: true }
                    });

                    if (!currentAbsence?.idEventFk) {
                        throw new Error("No se encontró el evento asociado a la ausencia");
                    }

                    eventId = currentAbsence.idEventFk;
                } else {
                    throw new Error("Debe proporcionar id o idEventFk para actualizar la ausencia");
                }

                // 1️⃣ Actualizar PRIMERO el evento asociado a la ausencia
                const updatedEvent = await tx.event.update({
                    where: { id: eventId },
                    data: {
                        title: item.title,
                        description: item.description,
                        startDate: startDate,
                        endDate: endDate,
                        eventPurposeType: item.eventPurposeType,
                        updatedDate: new Date(),
                        // Mantener allDay como true para ausencias
                        allDay: true
                    },
                });

                // 2️⃣ Luego actualizar la ausencia
                const updatedAbsence = await tx.workerAbsence.update({
                    where: { id: absenceId },
                    data: {
                        ...item,
                        id: absenceId, // Asegurar que el id está presente
                        startDate: startDate,
                        endDate: endDate,
                        updatedDate: new Date(),
                    },
                });

                return {
                    absence: updatedAbsence,
                    event: updatedEvent
                };
            });

            return result;
        } catch (error: any) {
            throw new CustomError("WorkerAbsenceService.updateWorkerAbsence", error);
        }
    }


    /**
     * Eliminar una ausencia (soft delete)
     */
    // async deleteWorkerAbsence(idList: string[]): Promise<Prisma.BatchPayload> {
    //     try {
    //         return await prisma.workerAbsence.deleteMany({
    //             where: {
    //                 id: { in: idList }
    //             },
    //         });
    //     } catch (error: any) {
    //         throw new CustomError("WorkerAbsenceService.deleteWorkerAbsence", error);
    //     }
    // }

    async deleteWorkerAbsence(idList: string[]): Promise<Prisma.BatchPayload> {
        try {
            const result = await prisma.$transaction(async (tx) => {
                // Obtener las ausencias para extraer los IDs de los eventos asociados
                const absences = await tx.workerAbsence.findMany({
                    where: { id: { in: idList } },
                });
                const eventIds = absences.map(a => a.idEventFk).filter(e => e != null);

                // Primero eliminar las ausencias para remover la referencia a los eventos
                const deleteAbsenceResult = await tx.workerAbsence.deleteMany({
                    where: { id: { in: idList } },
                });

                // Luego eliminar los eventos asociados
                await tx.event.deleteMany({
                    where: { id: { in: eventIds } },
                });

                return deleteAbsenceResult;
            });

            return result;
        } catch (error: any) {
            throw new CustomError("WorkerAbsenceService.deleteWorkerAbsence", error);
        }
    }



    /**
     * Verificar si hay un solapamiento con otras ausencias
     */
    async checkOverlappingAbsences(
        idUserFk: string,
        startDate: Date,
        endDate: Date
    ): Promise<boolean> {
        try {
            const overlappingAbsence = await prisma.workerAbsence.findFirst({
                where: {
                    idUserFk,
                    deletedDate: null,
                    AND: [
                        {
                            startDate: {
                                lte: endDate, // Empieza antes o al mismo tiempo que el final del nuevo periodo
                            },
                        },
                        {
                            endDate: {
                                gte: startDate, // Termina después o al mismo tiempo que el inicio del nuevo periodo
                            },
                        },
                    ],
                },
            });

            return !!overlappingAbsence;
        } catch (error: any) {
            throw new CustomError("WorkerAbsenceService.checkOverlappingAbsences", error);
        }
    }

    /**
     * Obtener todas las ausencias de una empresa
     */
    async getCompanyAbsences(idCompanyFk: string): Promise<WorkerAbsence[]> {
        try {
            return await prisma.workerAbsence.findMany({
                where: { idCompanyFk, deletedDate: null },
                orderBy: {
                    startDate: "asc"

                },
            });
        } catch (error: any) {
            throw new CustomError("WorkerAbsenceService.getCompanyAbsences", error);
        }
    }





    /**
     * Usado para obtener las ausencias de los trabajadores desde Redis.
     * Si no están disponibles en Redis, las obtiene de la base de datos y las guarda en Redis para futuras consultas.
     * 
     * @param userIds Lista de IDs de usuarios
     * @param idCompany ID de la empresa
     * @returns Mapa de ausencias de los trabajadores
     */
    // getWorkerAbsencesFromRedis = async (
    //     userIds: string[],
    //     idCompany: string
    // ): Promise<Record<string, WorkerAbsence[]>> => {
    //     const workerAbsencesMap: Record<string, WorkerAbsence[]> = {};
    //     const workerAbsenceStrategy = new WorkerAbsenceStrategy();

    //     for (const userId of userIds) {
    //         // Intentar obtener las ausencias del trabajador desde Redis
    //         let workerAbsences = await workerAbsenceStrategy.getWorkerAbsences(idCompany, userId);

    //         if (workerAbsences) {
    //             console.log(`Ausencias del trabajador ${userId} obtenidas de Redis`);
    //             workerAbsencesMap[userId] = workerAbsences;
    //             continue;
    //         }

    //         // Si no están en Redis, obtenerlas de la base de datos
    //         const workerAbsenceRecords = await prisma.workerAbsence.findMany({
    //             where: {
    //                 idUserFk: userId,
    //                 idCompanyFk: idCompany,
    //                 deletedDate: null,
    //             },
    //             orderBy: { startDate: "asc" },
    //         });

    //         // Estructurar los datos para Redis
    //         workerAbsences = workerAbsenceRecords.map((record) => ({
    //             id: record.id,
    //             idUserFk: record.idUserFk,
    //             idCompanyFk: record.idCompanyFk,
    //             idWorkspaceFk: record.idWorkspaceFk,
    //             startDate: moment(record.startDate).format("YYYY-MM-DD"),
    //             endDate: moment(record.endDate).format("YYYY-MM-DD"),
    //             type: record.type,
    //             description: record.description,
    //         }));

    //         // Guardar en Redis para futuras consultas
    //         await workerAbsenceStrategy.saveWorkerAbsences(
    //             idCompany,
    //             userId,
    //             workerAbsences,
    //             TIME_SECONDS.DAY
    //         );

    //         console.log(`Ausencias del trabajador ${userId} guardadas en Redis`);

    //         workerAbsencesMap[userId] = workerAbsences;
    //     }

    //     return workerAbsencesMap;
    // };
}
