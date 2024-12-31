import { Prisma, BusinessHour, WeekDayType } from "@prisma/client";
import prisma from "../../../../lib/prisma";
import CustomError from "../../../../models/custom-error/CustomError";
import { BusinessHoursType } from "../../../../models/interfaces";
import { BusinessHoursStrategy } from "../../../@redis/cache/strategies/businessHours/businessHours.strategy";
import moment from "moment";
import { TIME_SECONDS } from "../../../../constant/time";

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
                    idEstablishmentFk: true,
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
                    idEstablishmentFk: true,
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

    async getBusinessHours(idEstablishment: string): Promise<BusinessHour[]> {
        try {

            console.log('idEstablishment', idEstablishment);
            console.log('idEstablishment', idEstablishment);
            console.log('idEstablishment', idEstablishment);
            console.log('idEstablishment', idEstablishment);


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
                where: {
                    idEstablishmentFk: idEstablishment || 'aa00bc',
                    deletedDate: null,
                },
            });



            return result;
        } catch (error: any) {
            throw new CustomError('BusinessHourBusinessHour.getBusinessHours', error);
        }
    }

    async deleteBusinessHourByWeekDay(weekDayType: WeekDayType, idEstablishment: string): Promise<any> {
        try {
            return await prisma.businessHour.deleteMany({
                where: {
                    weekDayType: weekDayType,
                    idEstablishmentFk: idEstablishment
                },
            });
        } catch (error: any) {
            throw new CustomError('BusinessHourBusinessHour.deleteBusinessHourByWeekDay', error);
        }
    }

    async deleteClosedRecordsByWeekDay(weekDayType: WeekDayType, idEstablishment: string): Promise<any> {
        try {
            return await prisma.businessHour.deleteMany({
                where: {
                    weekDayType: weekDayType,
                    idEstablishmentFk: idEstablishment,
                    closed: true
                }
            });
        } catch (error: any) {
            throw new CustomError('BusinessHourBusinessHour.deleteClosedRecordsByWeekDay', error);
        }
    }



    async checkOverlappingBusinessHour(startTime: Date, endTime: Date, weekDayType: WeekDayType, idEstablishmentFk: string): Promise<boolean> {
        try {
            // Obtener todos los horarios del día de la semana especificado
            const overlappingHours = await prisma.businessHour.findFirst({
                where: {
                    weekDayType: weekDayType,
                    idEstablishmentFk: idEstablishmentFk,
                    AND: [
                        {
                            OR: [
                                // Verificar si el horario a insertar empieza dentro de un horario existente
                                {
                                    startTime: {
                                        // lte: endTime,  // menor o igual al final del nuevo horario, cuenta el mismo horario
                                        lt: endTime,  // menor o igual al final del nuevo horario

                                    },
                                    endTime: {
                                        // gte: startTime,  // mayor o igual al inicio del nuevo horario, cuenta el mismo horario
                                        gt: startTime,  // mayor o igual al inicio del nuevo horario

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


    /**
     * Devuelve los horarios de negocio de una empresa.
     * Intentará obtenerlos de Redis, y si no están allí, los obtendrá de la base de datos.
     * @param idCompany 
     * @returns 
     */
    getBusinessHoursFromRedis = async (idCompany: string, idEstablishment: string): Promise<BusinessHoursType> => {
        const businessHoursStrategy = new BusinessHoursStrategy();

        // Intentar obtener los horarios de negocio desde Redis
        let businessHours = await businessHoursStrategy.getBusinessHours(idEstablishment);

        // if (businessHours) {
        //     console.log("Horarios de negocio obtenidos de Redis");
        //     return businessHours;
        // }

        // Si no están en Redis, obtenerlos de la base de datos
        const businessHoursRecords = await prisma.businessHour.findMany({
            where: {
                idCompanyFk: idCompany,
                idEstablishmentFk: idEstablishment,
                deletedDate: null,
            },
        });

        // Estructurar los datos
        businessHours = {};

        for (const record of businessHoursRecords) {
            const weekDay = record.weekDayType; // e.g., 'MONDAY'
            if (record.closed) continue; // Omitir días cerrados

            // Convertir los tiempos a cadenas en formato 'HH:mm' usando moment
            const startTime = moment(record.startTime).format('HH:mm');
            const endTime = moment(record.endTime).format('HH:mm');

            // Asegurar que existe una entrada para el día de la semana
            if (!businessHours[weekDay]) {
                businessHours[weekDay] = [];
            }

            // Añadir el rango de tiempo al día correspondiente
            businessHours[weekDay].push([startTime, endTime]);
        }

        // Guardar en Redis para futuras consultas
        await businessHoursStrategy.saveBusinessHours(idEstablishment, businessHours, TIME_SECONDS.SECOND);

        console.log("Horarios de negocio guardados en Redis");

        return businessHours;
    }
}
