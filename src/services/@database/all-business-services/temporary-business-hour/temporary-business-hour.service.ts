import { Prisma, TemporaryBusinessHour, WeekDayType, $Enums } from "@prisma/client";
import prisma from "../../../../lib/prisma";
import CustomError from "../../../../models/custom-error/CustomError";
import { Pagination } from "../../../../models/pagination";
import { getGeneric } from "../../../../utils/get-genetic/getGenetic";
import moment from "moment";
import { TemporaryHoursMapType } from "../../../../models/interfaces/temporary-business-hours-type";
import { TemporaryHoursStrategy } from "../../../@redis/cache/strategies/temporaryHours/temporaryHours.strategy";

export class TemporaryBusinessHourService {
    constructor() { }

    async addTemporaryBusinessHour(item: Prisma.TemporaryBusinessHourCreateInput): Promise<TemporaryBusinessHour> {
        try {

            console.log("que voy a agregar?", item)


            return await prisma.temporaryBusinessHour.create({
                data: {
                    ...item,
                    createdDate: new Date(),
                    updatedDate: new Date(),
                },
            });
        } catch (error: any) {
            throw new CustomError('TemporaryBusinessHour.addTemporaryBusinessHour', error);
        }
    }

    async getTemporaryBusinessHourById(id: number): Promise<TemporaryBusinessHour | null> {
        try {
            return await prisma.temporaryBusinessHour.findUnique({
                where: { id: id },
                select: {
                    id: true,
                    date: true,
                    startTime: true,
                    endTime: true,
                    closed: true,
                    idUserFk: true,
                    idCompanyFk: true,
                    deletedDate: true,
                    createdDate: true,
                    updatedDate: true,
                }
            });
        } catch (error: any) {
            throw new CustomError('TemporaryBusinessHour.getTemporaryBusinessHourById', error);
        }
    }

    async getTemporaryBusinessHourByDate(date: Date): Promise<TemporaryBusinessHour[]> {
        try {
            // Obtener el inicio y fin del día
            const startDate = moment(date).startOf('day').toDate();
            const endDate = moment(date).endOf('day').toDate();

            return await prisma.temporaryBusinessHour.findMany({
                where: {
                    date: {
                        gte: startDate,  // Mayor o igual al inicio del día
                        lt: endDate      // Menor que el inicio del día siguiente
                    }
                },
                select: {
                    id: true,
                    date: true,
                    idCompanyFk: true,
                    startTime: true,
                    endTime: true,
                    closed: true,
                    idUserFk: true,
                    createdDate: true,
                    updatedDate: true,
                    deletedDate: true,
                },
                orderBy: { startTime: 'asc' },
            });
        } catch (error: any) {
            throw new CustomError('TemporaryBusinessHour.getTemporaryBusinessHourById', error);
        }
    }

    async getTemporaryBusinessHourByWorkerAndDate(idWorker: string, date: Date): Promise<{
        id: number;
        idUserFk: string;
        date: Date;
        closed: boolean;
        startTime: Date;
        endTime: Date;
    }[]> {
        try {
            // Obtener el inicio y fin del día
            const startDate = moment(date).startOf('day').toDate();
            const endDate = moment(date).endOf('day').toDate();

            return await prisma.temporaryBusinessHour.findMany({
                where: {
                    idUserFk: idWorker,
                    date: {
                        gte: startDate,  // Mayor o igual al inicio del día
                        lt: endDate      // Menor que el inicio del día siguiente
                    }
                },
                select: {
                    id: true,
                    date: true,
                    startTime: true,
                    endTime: true,
                    closed: true,
                    idUserFk: true,
                },
                orderBy: { startTime: 'asc' },
            });
        } catch (error: any) {
            throw new CustomError('TemporaryBusinessHour.getTemporaryBusinessHourById', error);
        }
    }


    /**
     * Solo devuelve las fechas disponibles del usuario
     * @param idUserFk 
     * @param minDate 
     * @param maxDate 
     * @returns 
     */
    async getDistinctDatesWithExceptionsByWorker(idUserFk: string, minDate?: Date, maxDate?: Date): Promise<Date[]> {
        try {
            let whereCondition: any = {
                idUserFk: idUserFk,
            };

            if (minDate) {
                const formattedMinDate = moment(minDate).toISOString(); // Aseguramos que es ISO-8601
                whereCondition.date = {
                    gte: formattedMinDate,
                };
            }

            // Si se proporciona maxDate, lo agregamos al filtro
            if (maxDate) {
                const formattedMaxDate = moment(maxDate).toISOString(); // Aseguramos que es ISO-8601
                whereCondition.date = {
                    ...(whereCondition.date || {}), // Nos aseguramos de no sobreescribir si ya existe gte
                    lte: formattedMaxDate,
                };
            }

            console.log("maxDate", maxDate);
            console.log("minDate", minDate);

            console.log("whereCondition", whereCondition);
            // Obtener todos los registros con excepciones (no importa si es closed o tiene horarios)
            const result = await prisma.temporaryBusinessHour.findMany({
                where: whereCondition,
                select: {
                    date: true,
                },
                distinct: ['date'], // Solo fechas únicas
                orderBy: {
                    date: 'asc',
                },
            });

            // Devolver solo las fechas como un array
            return result.map((item) => item.date);
        } catch (error: any) {
            throw new CustomError('TemporaryBusinessHour.getDistinctDatesWithExceptionsByWorker', error);
        }
    }


    async updateTemporaryBusinessHour(item: TemporaryBusinessHour): Promise<TemporaryBusinessHour> {
        try {
            const id = item.id as number;
            delete item.id;

            return await prisma.temporaryBusinessHour.update({
                where: { id: id },
                data: {
                    ...item,
                    updatedDate: new Date(),
                },
            });
        } catch (error: any) {
            throw new CustomError('TemporaryBusinessHour.updateTemporaryBusinessHour', error);
        }
    }

    async deleteTemporaryBusinessHour(idList: number[]): Promise<any> {
        try {
            const listAux = Array.isArray(idList) ? idList : [idList];
            return await prisma.temporaryBusinessHour.deleteMany({
                where: {
                    id: {
                        in: listAux,
                    },
                },
            });
        } catch (error: any) {
            throw new CustomError('TemporaryBusinessHour.deleteTemporaryBusinessHour', error);
        }
    }

    async getTemporaryBusinessHours(pagination: Pagination, isUserTemporaryTemporaryBusinessHours = true) {
        try {
            let select: Prisma.TemporaryBusinessHourSelect = {
                id: true,
                date: true,
                startTime: true,
                endTime: true,
                closed: true,
                idUserFk: true,

            };

            const result = await getGeneric(pagination, "temporaryBusinessHour", select);
            return result;
        } catch (error: any) {
            throw new CustomError('TemporaryBusinessHour.getTemporaryTemporaryBusinessHours', error);
        }
    }

    async deleteTemporaryBusinessHourByWorkerAndDate(idWorker: string, date: Date): Promise<any> {
        try {
            // Obtener el inicio y fin del día
            const startDate = moment(date).startOf('day').toDate();
            const endDate = moment(date).endOf('day').toDate();

            return await prisma.temporaryBusinessHour.deleteMany({
                where: {
                    idUserFk: idWorker,
                    date: {
                        gte: startDate,  // Mayor o igual al inicio del día
                        lt: endDate      // Menor que el inicio del día siguiente
                    }
                },
            });
        } catch (error: any) {
            throw new CustomError('TemporaryBusinessHour.deleteTemporaryBusinessHourByWorkerAndDate', error);
        }
    }


    async deleteClosedRecordsByWorkerAndDate(idWorker: string, date: Date): Promise<any> {
        try {
            const startDate = moment(date).startOf('day').toDate();
            const endDate = moment(date).endOf('day').toDate();


            console.log("entro a eliminar?", startDate, endDate);

            return await prisma.temporaryBusinessHour.deleteMany({
                where: {
                    idUserFk: idWorker,
                    date: {
                        gte: startDate,
                        lt: endDate
                    },
                    closed: true
                }
            });
        } catch (error: any) {
            throw new CustomError('TemporaryBusinessHour.deleteClosedRecordsByWorkerAndDate', error);
        }
    }



    async checkOverlappingTemporaryBusinessHour(startTime: Date, endTime: Date, idUserFk: string, date: Date): Promise<boolean> {
        try {
            // Obtener el inicio y fin del día para la fecha proporcionada
            const startDate = moment(date).startOf('day').toDate();
            const endDate = moment(date).endOf('day').toDate();

            // console.log("entro a overlapping start", startTime);
            // console.log("entro a overlapping end", endTime);



            // Buscar si hay horarios temporales superpuestos para el trabajador en la misma fecha
            const overlappingHours = await prisma.temporaryBusinessHour.findFirst({
                where: {
                    idUserFk: idUserFk,
                    date,
                    AND: [
                        {
                            OR: [
                                {
                                    // Caso 1: El nuevo horario empieza dentro de un horario existente
                                    startTime: {
                                        lte: endTime,  // Empieza antes o durante el nuevo horario
                                    },
                                    endTime: {
                                        gte: startTime,  // Termina después o durante el nuevo horario
                                    },
                                },
                            ]
                        },
                        {
                            closed: false, // Solo horarios que no estén marcados como cerrados
                        },
                    ],
                },
            });

            // Si se encuentra un horario que se superpone, devolver true
            return !!overlappingHours;
        } catch (error: any) {
            console.error('Error checking overlapping temporary business hours:', error);
            throw new CustomError('TemporaryBusinessHour.checkOverlappingTemporaryBusinessHour', error);
        }
    }


    /**
     * Devuelve los horarios temporales de los trabajadores en un rango de fechas.
     * Intenta obtener los horarios temporales desde Redis, si no los encuentra, los obtiene de la base de datos.
     * @param userIds 
     * @param idCompany 
     * @returns 
     */
    getTemporaryHoursFromRedis = async (userIds: string[], idCompany: string): Promise<TemporaryHoursMapType> => {
        const temporaryHoursMap: TemporaryHoursMapType = {};
        const temporaryHoursStrategy = new TemporaryHoursStrategy();

        for (const userId of userIds) {
            // Intentar obtener los horarios temporales desde Redis
            let temporaryHours = await temporaryHoursStrategy.getTemporaryHours(idCompany, userId);

            if (temporaryHours) {
                console.log(`Horarios temporales del usuario ${userId} obtenidos de Redis ${JSON.stringify(temporaryHours)}`);
                temporaryHoursMap[userId] = temporaryHours;
                continue;
            }

            // Obtenemos los registros de horarios temporales de la base de datos
            const temporaryHoursRecords = await prisma.temporaryBusinessHour.findMany({
                where: {
                    idCompanyFk: idCompany,
                    idUserFk: userId,
                    deletedDate: null,
                },
            });

            // Inicializamos el mapa de horarios temporales para el usuario
            const userTemporaryHours: { [date: string]: string[][] | null } = {};

            for (const record of temporaryHoursRecords) {
                const dateStr = moment(record.date).format('YYYY-MM-DD'); // Fecha en formato 'YYYY-MM-DD'

                if (record.closed) {
                    // Registrar que el trabajador está cerrado en esta fecha
                    userTemporaryHours[dateStr] = null;
                    continue; // Pasar al siguiente registro
                }

                // Si startTime o endTime son nulos, omitimos este registro
                if (!record.startTime || !record.endTime) continue;

                // Convertir los tiempos a cadenas en formato 'HH:mm'
                const startTime = moment(record.startTime).format('HH:mm');
                const endTime = moment(record.endTime).format('HH:mm');

                // Asegurar que existe una entrada para la fecha
                if (!userTemporaryHours[dateStr]) {
                    userTemporaryHours[dateStr] = [];
                }

                // Añadir el rango de tiempo a la fecha correspondiente
                (userTemporaryHours[dateStr] as string[][]).push([startTime, endTime]);
            }

            // Guardamos los horarios temporales del usuario en el mapa principal
            temporaryHoursMap[userId] = userTemporaryHours;
        }

        return temporaryHoursMap;
    }
}
