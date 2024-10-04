import { Prisma, BusinessHour, WeekDayType } from "@prisma/client";
import prisma from "../../../../lib/prisma";
import CustomError from "../../../../models/custom-error/CustomError";
import { Pagination } from "../../../../models/pagination";
import { getGeneric } from "../../../../utils/get-genetic/getGenetic";
import { UtilGeneral } from "../../../../utils/util-general";
import { isArray } from "util";

export class BusinessHourService {
    constructor() { }

    async addBusinessHour(item: Prisma.BusinessHourCreateInput): Promise<BusinessHour> {
        try {
            return await prisma.businessHour.create({
                data: {
                    ...item,
                    createdDate: new Date(),
                    updatedDate: new Date(),
                },
            });
        } catch (error: any) {
            throw new CustomError('BusinessHourBusinessHour.addBusinessHour', error);
        }
    }

    async getBusinessHourById(id: number): Promise<BusinessHour | null> {
        try {
            return await prisma.businessHour.findUnique({
                where: { id: id },
                select: {
                    id: true,
                    weekDayType: true,
                    idCompanyFk: true,
                    startTime: true,
                    endTime: true,
                    closed: true,
                    createdDate: true,
                    updatedDate: true,
                    deletedDate: true,
                }
            });
        } catch (error: any) {
            throw new CustomError('BusinessHourBusinessHour.getBusinessHourById', error);
        }
    }

    async getBusinessHourByWeekDay(weekDayType: WeekDayType): Promise<BusinessHour[]> {
        try {
            return await prisma.businessHour.findMany({
                where: { weekDayType: weekDayType },
                select: {
                    id: true,
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
            throw new CustomError('BusinessHourBusinessHour.getBusinessHourById', error);
        }
    }

    async updateBusinessHour(item: BusinessHour): Promise<BusinessHour> {
        try {
            const id = item.id as number;
            delete item.id;

            return await prisma.businessHour.update({
                where: { id: id },
                data: {
                    ...item,
                    updatedDate: new Date(),
                },
            });
        } catch (error: any) {
            throw new CustomError('BusinessHourBusinessHour.updateBusinessHour', error);
        }
    }

    async deleteBusinessHour(idList: number[]): Promise<any> {
        try {
            console.log('idList', idList);
            let listAux = Array.isArray(idList) ? idList : [idList];
            return await prisma.businessHour.deleteMany({
                where: {
                    id: {
                        in: listAux,
                    },
                },
            });
        } catch (error: any) {
            throw new CustomError('BusinessHourBusinessHour.deleteBusinessHour', error);
        }
    }

    async getBusinessHours() {
        try {
            let select: Prisma.BusinessHourSelect = {
                id: true,
                weekDayType: true,
                startTime: true,
                endTime: true,
                closed: true,
            };

            const result = await prisma.businessHour.findMany({
                select: select,
                orderBy: { startTime: 'asc' },
            });
            return result;
        } catch (error: any) {
            throw new CustomError('BusinessHourBusinessHour.getBusinessHours', error);
        }
    }

    async deleteBusinessHourByWeekDay(weekDayType: WeekDayType): Promise<any> {
        try {
            return await prisma.businessHour.deleteMany({
                where: { weekDayType: weekDayType },
            });
        } catch (error: any) {
            throw new CustomError('BusinessHourBusinessHour.deleteBusinessHourByWeekDay', error);
        }
    }

    async deleteClosedRecordsByWeekDay(weekDayType: WeekDayType): Promise<any> {
        try {
            return await prisma.businessHour.deleteMany({
                where: {
                    weekDayType: weekDayType,
                    closed: true
                }
            });
        } catch (error: any) {
            throw new CustomError('BusinessHourBusinessHour.deleteClosedRecordsByWeekDay', error);
        }
    }



     async checkOverlappingBusinessHour(startTime: Date, endTime: Date, weekDayType: WeekDayType): Promise<boolean> {
        try {
            // Obtener todos los horarios del día de la semana especificado
            const overlappingHours = await prisma.businessHour.findFirst({
                where: {
                    weekDayType: weekDayType,
                    AND: [
                        {
                            OR: [
                                // Verificar si el horario a insertar empieza dentro de un horario existente
                                {
                                    startTime: {
                                        lte: endTime,  // menor o igual al final del nuevo horario
                                    },
                                    endTime: {
                                        gte: startTime,  // mayor o igual al inicio del nuevo horario
                                    },
                                },
                            ],
                        },
                        {
                            closed: false, // Solo buscar horarios que no estén cerrados
                        },
                    ],
                },
            });

            // Si se encuentra un horario que se solape, devolver true
            return !!overlappingHours;
        } catch (error) {
            console.error('Error checking overlapping business hours:', error);
            throw new Error('Could not check overlapping business hours');
        }
    }

}
