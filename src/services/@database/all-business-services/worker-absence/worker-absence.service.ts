import { Prisma, WorkerAbsence } from "@prisma/client";
import prisma from "../../../../lib/prisma";
import CustomError from "../../../../models/custom-error/CustomError";
import { TIME_SECONDS } from "../../../../constant/time";
import moment from "moment";

export class WorkerAbsenceService {
    constructor() { }

    /**
     * Crear una nueva ausencia
     */
    async addWorkerAbsence(item: Prisma.WorkerAbsenceCreateInput): Promise<WorkerAbsence> {
        try {
            return await prisma.workerAbsence.create({
                data: {
                    ...item,
                    createdDate: new Date(),
                    updatedDate: new Date(),
                },
            });
        } catch (error: any) {
            throw new CustomError("WorkerAbsenceService.addWorkerAbsence", error);
        }
    }

    /**
     * Obtener una ausencia por su ID
     */
    async getWorkerAbsenceById(id: number): Promise<WorkerAbsence | null> {
        try {
            return await prisma.workerAbsence.findUnique({
                where: { id },
                select: {
                    id: true,
                    idUserFk: true,
                    idCompanyFk: true,
                    idEstablishmentFk: true,
                    startDate: true,
                    endDate: true,
                    // type: true,
                    description: true,
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
    async getWorkerAbsencesByEstablishment(idEstablishmentFk: string): Promise<WorkerAbsence[]> {
        try {
            return await prisma.workerAbsence.findMany({
                where: {
                    idEstablishmentFk,
                    deletedDate: null
                },
                orderBy: { startDate: "asc" },
            });
        } catch (error: any) {
            throw new CustomError("WorkerAbsenceService.getWorkerAbsencesByEstablishment", error);
        }
    }

    /**
     * Actualizar una ausencia existente
     */
    async updateWorkerAbsence(item: WorkerAbsence): Promise<WorkerAbsence> {
        try {
            const id = item.id as number;
            delete item.id;

            return await prisma.workerAbsence.update({
                where: { id },
                data: {
                    ...item,
                    updatedDate: new Date(),
                },
            });
        } catch (error: any) {
            throw new CustomError("WorkerAbsenceService.updateWorkerAbsence", error);
        }
    }

    /**
     * Eliminar una ausencia (soft delete)
     */
    async deleteWorkerAbsence(idList: number[]): Promise<Prisma.BatchPayload> {
        try {
            return await prisma.workerAbsence.deleteMany({
                where: {
                    id: { in: idList }
                },
            });
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
                orderBy: { startDate: "asc" },
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
    //             idEstablishmentFk: record.idEstablishmentFk,
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
