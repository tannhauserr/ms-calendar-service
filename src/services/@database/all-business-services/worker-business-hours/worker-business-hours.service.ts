import { Prisma, WorkerBusinessHour, WeekDayType, $Enums } from "@prisma/client";
import prisma from "../../../../lib/prisma";
import CustomError from "../../../../models/custom-error/CustomError";
import { Pagination } from "../../../../models/pagination";
import { getGeneric } from "../../../../utils/get-genetic/getGenetic";
import { WorkerHoursMapType } from "../../../../models/interfaces";
import { WorkerHoursStrategy } from "../../../@redis/cache/strategies/workerHours/workerHours.strategy";
import moment from "moment";
import { TIME_SECONDS } from "../../../../constant/time";

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

    async getWorkerBusinessHourById(id: string): Promise<WorkerBusinessHour | null> {
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
                    idWorkspaceFk: true,
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
                    idWorkspaceFk: true,
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

    async getWorkerBusinessHourByWorkerAndWorkspace(idWorker: string, idWorkspace: string): Promise<{
        id: string;
        idUserFk: string;
        weekDayType: $Enums.WeekDayType;
        closed: boolean;
        startTime: string | null;
        endTime: string | null;
    }[]> {
        try {
            // Obtener el id de la empresa del trabajador
            return await prisma.workerBusinessHour.findMany({
                where: { idUserFk: idWorker, idWorkspaceFk: idWorkspace },
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

    // async updateWorkerBusinessHour(item: WorkerBusinessHour): Promise<WorkerBusinessHour> {
    //     try {
    //         const id = item.id;
    //         delete item.id;
    //         console.log("llego aqui????", id, item)
    //         return await prisma.workerBusinessHour.update({
    //             where: { id: id },
    //             data: {
    //                 ...item,
    //                 updatedDate: new Date(),
    //             },
    //         });
    //     } catch (error: any) {
    //         throw new CustomError('WorkerBusinessHourWorkerBusinessHour.updateWorkerBusinessHour', error);
    //     }
    // }

    async updateWorkerBusinessHour(item: WorkerBusinessHour): Promise<WorkerBusinessHour> {
        try {
            const { id, weekDayType, idUserFk, closed, ...rest } = item;

            // 1) Comprobar si existe al menos un registro para este trabajador y día
            const existingCount = await prisma.workerBusinessHour.count({
                where: {
                    weekDayType,
                    idUserFk,
                },
            });

            // 2) Si no existe ningún registro y el item entrante tiene closed = true,
            //    creamos uno nuevo usando el mismo id
            if (existingCount === 0) {
                return await prisma.workerBusinessHour.create({
                    data: {
                        id,              // usamos el mismo id, dado que no es autoincremental
                        weekDayType,
                        idUserFk,
                        closed,
                        ...rest,
                        createdDate: new Date(),
                        updatedDate: new Date(),
                    },
                });
            }

            // 3) En cualquier otro caso, actualizamos el registro existente (por id)
            if (!id) {
                throw new CustomError(
                    'WorkerBusinessHourWorkerBusinessHour.updateWorkerBusinessHour',
                    new Error('Falta el campo "id" para la actualización')
                );
            }

            return await prisma.workerBusinessHour.update({
                where: { id },
                data: {
                    weekDayType,
                    idUserFk,
                    closed,
                    ...rest,
                    updatedDate: new Date(),
                },
            });
        } catch (error: any) {
            throw new CustomError(
                'WorkerBusinessHourWorkerBusinessHour.updateWorkerBusinessHour',
                error
            );
        }
    }


    async deleteWorkerBusinessHour(idList: string[]): Promise<any> {
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
            // Obtener idWorkspace antes de eliminar para invalidar Redis
            const record = await prisma.workerBusinessHour.findFirst({
                where: { weekDayType: weekDayType, idUserFk: idWorker },
                select: { idWorkspaceFk: true }
            });

            const result = await prisma.workerBusinessHour.deleteMany({
                where: { weekDayType: weekDayType, idUserFk: idWorker },
            });

            // Invalidar Redis
            if (record) {
                const workerHoursStrategy = new WorkerHoursStrategy();
                await workerHoursStrategy.deleteWorkerHours(
                    record.idWorkspaceFk,
                    idWorker
                );
            }

            return result;
        } catch (error: any) {
            throw new CustomError('WorkerBusinessHourWorkerBusinessHour.deleteWorkerBusinessHourByWorker', error);
        }
    }

    async deleteClosedRecordsByWorker(weekDayType: WeekDayType, idWorker: string): Promise<any> {
        try {
            // Obtener idWorkspace antes de eliminar para invalidar Redis
            const record = await prisma.workerBusinessHour.findFirst({
                where: {
                    weekDayType: weekDayType,
                    idUserFk: idWorker,
                    closed: true
                },
                select: { idWorkspaceFk: true }
            });

            const result = await prisma.workerBusinessHour.deleteMany({
                where: {
                    weekDayType: weekDayType,
                    idUserFk: idWorker,
                    closed: true
                }
            });

            // Invalidar Redis
            if (record) {
                const workerHoursStrategy = new WorkerHoursStrategy();
                await workerHoursStrategy.deleteWorkerHours(
                    record.idWorkspaceFk,
                    idWorker
                );
            }

            return result;
        } catch (error: any) {
            throw new CustomError('WorkerBusinessHourWorkerBusinessHour.deleteClosedRecordsByWorker', error);
        }
    }

    toHHmm = (v: string): string => {
        const m = String(v).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
        if (!m) throw new Error(`Hora inválida: ${v}`);
        return `${m[1].padStart(2, '0')}:${m[2]}`;
    };

    async checkOverlappingWorkerBusinessHour(
        startTime: string,                 // <- string "HH:mm"
        endTime: string,                   // <- string "HH:mm"
        weekDayType: WeekDayType,
        idUserFk: string,
        id?: string
    ): Promise<boolean> {
        const s = this.toHHmm(startTime);
        const e = this.toHHmm(endTime);

        // [exist.start < newEnd] AND [newStart < exist.end]
        const overlapping = await prisma.workerBusinessHour.findFirst({
            where: {
                idUserFk,
                weekDayType,
                closed: false,
                ...(id ? { id: { not: id } } : {}),
                AND: [
                    { startTime: { lt: e } },  // exist.start < newEnd
                    { endTime: { gt: s } },  // exist.end   > newStart
                ],
            },
            select: { id: true },
        });

        return !!overlapping;
    }

    // async checkOverlappingWorkerBusinessHour(
    //     startTime: Date,
    //     endTime: Date,
    //     weekDayType: WeekDayType,
    //     idUserFk: string,
    //     id: any = undefined
    // ): Promise<boolean> {
    //     try {
    //         // Construir la cláusula where base
    //         const whereClause: any = {
    //             idUserFk: idUserFk,
    //             weekDayType: weekDayType,
    //             AND: [
    //                 {
    //                     OR: [
    //                         {
    //                             startTime: {
    //                                 lte: endTime,  // Comienza antes o durante el nuevo horario
    //                             },
    //                             endTime: {
    //                                 gte: startTime,  // Termina después o durante el nuevo horario
    //                             },
    //                         },
    //                     ],
    //                 },
    //                 {
    //                     closed: false, // Solo horarios que no estén cerrados
    //                 },
    //             ],
    //         };

    //         // Si se proporciona un ID, excluir el registro actual de la búsqueda
    //         if (id !== undefined) {
    //             whereClause.id = { not: id };
    //         }

    //         // Buscar si hay algún horario que se solape
    //         const overlappingHours = await prisma.workerBusinessHour.findFirst({
    //             where: whereClause,
    //         });

    //         // Devuelve true si se encuentra un horario superpuesto
    //         return !!overlappingHours;
    //     } catch (error: any) {
    //         console.error('Error checking overlapping worker business hours:', error);

    //     }
    // }





    /**
     * Usado para obtener los horarios de los trabajadores de una empresa.
     *  Se intenta obtener los horarios de los trabajadores desde Redis, si no están disponibles se obtienen de la base de datos.
     * 
     * 
     * @param userIds 
     * @param idWorkspace 
     * @returns 
     */
    // getWorkerHoursFromRedis = async (userIds: string[], idWorkspace: string): Promise<WorkerHoursMapType> => {
    //     const workerHoursMap: WorkerHoursMapType = {};
    //     const workerHoursStrategy = new WorkerHoursStrategy();

    //     for (const userId of userIds) {
    //         // Intentar obtener los horarios del trabajador desde Redis
    //         let workerHours = await workerHoursStrategy.getWorkerHours(idWorkspace, userId);


    //         if (workerHours) {
    //             console.log(`Horarios del trabajador ${userId} obtenidos de Redis`);
    //             workerHoursMap[userId] = workerHours;
    //             continue;
    //         }

    //         // Si no están en Redis, obtenerlos de la base de datos
    //         const workerHoursRecords = await prisma.workerBusinessHour.findMany({
    //             where: {
    //                 idUserFk: userId,
    //                 idWorkspaceFk: idWorkspace,
    //                 deletedDate: null,
    //             },
    //         });

    //         console.log(`Horarios del trabajador ${userId} obtenidos de la base de datos ${idWorkspace}`);
    //         console.log(workerHoursRecords);

    //         // Estructurar los datos
    //         workerHours = {};

    //         for (const record of workerHoursRecords) {
    //             const weekDay = record.weekDayType; // e.g., 'MONDAY'

    //             // TODO: En el caso de los workerHours no debería ser necesario omitir los días cerrados
    //             // if (record.closed) continue; // Omitir días cerrados
    //             if (!workerHours[weekDay]) {
    //                 workerHours[weekDay] = [];
    //             }

    //             if (record.closed) {
    //                 workerHours[weekDay] = null;
    //                 continue;
    //             }

    //             if (workerHours[weekDay] === null) {
    //                 continue;
    //             }

    //             // Convertir los tiempos a cadenas en formato 'HH:mm' usando moment
    //             // const startTime = moment.utc(record.startTime).format('HH:mm');
    //             // const endTime = moment.utc(record.endTime).format('HH:mm');


    //             // Sin UTC
    //             // const formatUtcTime = (d: Date) => d.toISOString().substring(11, 16); // "HH:mm"

    //             // const startTime = formatUtcTime(record.startTime);
    //             // const endTime = formatUtcTime(record.endTime);

    //             const startTime = record.startTime as unknown as string;
    //             const endTime = record.endTime as unknown as string;


    //             // Asegurar que existe una entrada para el día de la semana
    //             // if (!workerHours[weekDay]) {
    //             //     workerHours[weekDay] = [];
    //             // }

    //             // Añadir el rango de tiempo al día correspondiente
    //             workerHours[weekDay].push([startTime, endTime]);



    //         }

    //         // Guardar en Redis para futuras consultas
    //         await workerHoursStrategy.saveWorkerHours(idWorkspace, userId, workerHours, TIME_SECONDS.HOUR);

    //         console.log(`-------- Horarios del trabajador ${userId} guardados en Redis`);

    //         workerHoursMap[userId] = workerHours;
    //     }



    //     return workerHoursMap;
    // }

    getWorkerHoursFromRedis = async (userIds: string[], idWorkspace: string): Promise<WorkerHoursMapType> => {
        const workerHoursMap: WorkerHoursMapType = {};
        const workerHoursStrategy = new WorkerHoursStrategy();

        // Intentar Redis en bulk primero
        for (const userId of userIds) {
            const workerHours = await workerHoursStrategy.getWorkerHours(idWorkspace, userId);
            if (workerHours) {
                workerHoursMap[userId] = workerHours;
            }
        }

        // Identificar cuáles faltan
        const missing = userIds.filter(u => !workerHoursMap[u]);

        if (missing.length > 0) {
            const records = await prisma.workerBusinessHour.findMany({
                where: {
                    idWorkspaceFk: idWorkspace,
                    idUserFk: { in: missing },
                    deletedDate: null,
                },
            });
            // console.log("establecimiento", idWorkspace)
            // console.log("viendo los records de worker hours", missing, records);

            // Inicializar todos con array vacío
            for (const uid of missing) {
                workerHoursMap[uid] = {};
            }

            for (const r of records) {
                const weekDay = r.weekDayType; // MONDAY...
                const start = (r.startTime as unknown as string);
                const end = (r.endTime as unknown as string);

                if (!workerHoursMap[r.idUserFk]) workerHoursMap[r.idUserFk] = {};
                if (!workerHoursMap[r.idUserFk]![weekDay]) workerHoursMap[r.idUserFk]![weekDay] = [];

                if (r.closed) {
                    workerHoursMap[r.idUserFk]![weekDay] = null;
                } else if (workerHoursMap[r.idUserFk]![weekDay] !== null) {
                    workerHoursMap[r.idUserFk]![weekDay]!.push([start, end]);
                }
            }

            // Guardar en Redis (aunque estén vacíos)
            for (const uid of missing) {
                await workerHoursStrategy.saveWorkerHours(idWorkspace, uid, workerHoursMap[uid], TIME_SECONDS.HOUR);
            }
        }

        return workerHoursMap;
    }

}
