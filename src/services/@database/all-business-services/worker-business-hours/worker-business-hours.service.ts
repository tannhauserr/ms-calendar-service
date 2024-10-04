import { Prisma, WorkerBusinessHour, WeekDayType, $Enums } from "@prisma/client";
import prisma from "../../../../lib/prisma";
import CustomError from "../../../../models/custom-error/CustomError";
import { Pagination } from "../../../../models/pagination";
import { getGeneric } from "../../../../utils/get-genetic/getGenetic";

export class WorkerBusinessHourService {
    constructor() { }

    async addWorkerBusinessHour(item: Prisma.WorkerBusinessHourCreateInput): Promise<WorkerBusinessHour> {
        try {
            return await prisma.workerBusinessHour.create({
                data: {
                    ...item,
                    createdDate: new Date(),
                    updatedDate: new Date(),
                },
            });
        } catch (error: any) {
            throw new CustomError('WorkerBusinessHourWorkerBusinessHour.addWorkerBusinessHour', error);
        }
    }

    async getWorkerBusinessHourById(id: number): Promise<WorkerBusinessHour | null> {
        try {
            return await prisma.workerBusinessHour.findUnique({
                where: { id: id },
                select: {
                    id: true,
                    idUserFk: true,
                    weekDayType: true,
                    startTime: true,
                    endTime: true,
                    closed: true,
                    idCompanyFk: true,


                    createdDate: true,
                    updatedDate: true,
                    deletedDate: true,
                }
            });
        } catch (error: any) {
            throw new CustomError('WorkerBusinessHourWorkerBusinessHour.getWorkerBusinessHourById', error);
        }
    }

    async getWorkerBusinessHourByWeekDay(weekDayType: WeekDayType): Promise<WorkerBusinessHour[]> {
        try {
            return await prisma.workerBusinessHour.findMany({
                where: { weekDayType: weekDayType },
                select: {
                    id: true,
                    idUserFk: true,
                    weekDayType: true,
                    idCompanyFk: true,
                    startTime: true,
                    endTime: true,
                    closed: true,
                    createdDate: true,
                    updatedDate: true,
                    deletedDate: true,
                },
                orderBy: { startTime: 'asc' },
            });
        } catch (error: any) {
            throw new CustomError('WorkerBusinessHourWorkerBusinessHour.getWorkerBusinessHourById', error);
        }
    }

    async getWorkerBusinessHourByWorker(idWorker: string): Promise<{
        id: number;
        idUserFk: string;
        weekDayType: $Enums.WeekDayType;
        closed: boolean;
        startTime: Date;
        endTime: Date;
    }[]> {
        try {
            return await prisma.workerBusinessHour.findMany({
                where: { idUserFk: idWorker },
                select: {
                    id: true,
                    idUserFk: true,
                    weekDayType: true,
                    closed: true,
                    startTime: true,
                    endTime: true,
                },
                orderBy: { startTime: 'asc' },
            });
        } catch (error: any) {
            throw new CustomError('WorkerBusinessHourWorkerBusinessHour.getWorkerBusinessHourById', error);
        }
    }

    async updateWorkerBusinessHour(item: WorkerBusinessHour): Promise<WorkerBusinessHour> {
        try {
            const id = item.id as number;
            delete item.id;

            return await prisma.workerBusinessHour.update({
                where: { id: id },
                data: {
                    ...item,
                    updatedDate: new Date(),
                },
            });
        } catch (error: any) {
            throw new CustomError('WorkerBusinessHourWorkerBusinessHour.updateWorkerBusinessHour', error);
        }
    }

    async deleteWorkerBusinessHour(idList: number[]): Promise<any> {
        try {
            const listAux = Array.isArray(idList) ? idList : [idList];
            return await prisma.workerBusinessHour.deleteMany({
                where: {
                    id: {
                        in: listAux,
                    },
                },
            });
        } catch (error: any) {
            throw new CustomError('WorkerBusinessHourWorkerBusinessHour.deleteWorkerBusinessHour', error);
        }
    }

    async getWorkerBusinessHours() {
        try {
            let select: Prisma.WorkerBusinessHourSelect = {
                id: true,
                weekDayType: true,
                idUserFk: true,
                startTime: true,
                endTime: true,
                closed: true,
            };

            const result = await prisma.workerBusinessHour.findMany({
                select: select,
                orderBy: { startTime: 'asc' },
            });
            return result;
        } catch (error: any) {
            throw new CustomError('BusinessHourBusinessHour.getBusinessHours', error);
        }
    }


    async deleteWorkerBusinessHourByWorker(weekDayType: WeekDayType, idWorker: string): Promise<any> {
        try {
            return await prisma.workerBusinessHour.deleteMany({
                where: { weekDayType: weekDayType, idUserFk: idWorker },
            });
        } catch (error: any) {
            throw new CustomError('WorkerBusinessHourWorkerBusinessHour.deleteWorkerBusinessHourByWorker', error);
        }
    }

    async deleteClosedRecordsByWorker(weekDayType: WeekDayType, idWorker: string): Promise<any> {
        try {
            return await prisma.workerBusinessHour.deleteMany({
                where: {
                    weekDayType: weekDayType,
                    idUserFk: idWorker,
                    closed: true
                }
            });
        } catch (error: any) {
            throw new CustomError('WorkerBusinessHourWorkerBusinessHour.deleteClosedRecordsByWorker', error);
        }
    }

    async checkOverlappingWorkerBusinessHour(startTime: Date, endTime: Date, weekDayType: WeekDayType, idUserFk: string): Promise<boolean> {
        try {
            // Buscar si hay horarios superpuestos para el trabajador en el mismo día de la semana
            const overlappingHours = await prisma.workerBusinessHour.findFirst({
                where: {
                    idUserFk: idUserFk,
                    weekDayType: weekDayType,
                    AND: [
                        {
                            OR: [
                                {
                                    startTime: {
                                        lte: endTime,  // Comienza antes o durante el nuevo horario
                                    },
                                    endTime: {
                                        gte: startTime,  // Termina después o durante el nuevo horario
                                    },
                                },
                            ],
                        },
                        {
                            closed: false, // Solo horarios que no estén cerrados
                        },
                    ],
                },
            });

            // Si se encuentra un horario superpuesto, devolver true
            return !!overlappingHours;
        } catch (error: any) {
            console.error('Error checking overlapping worker business hours:', error);
            throw new CustomError('WorkerBusinessHourWorkerBusinessHour.checkOverlappingWorkerBusinessHour', error);
        }
    }

}
