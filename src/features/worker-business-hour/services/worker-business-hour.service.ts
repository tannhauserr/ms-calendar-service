import { Prisma, WorkerBusinessHour, WeekDayType, $Enums } from "@prisma/client";
import prisma from "../../../lib/prisma";
import CustomError from "../../../models/custom-error/CustomError";
import { ErrorCatalogByDomain, withCatalogMessage } from "../../../models/error-codes";
import { Pagination } from "../../../models/pagination";
import { getGeneric } from "../../../utils/get-genetic/getGenetic";
import { WorkerHoursMapType } from "../../../models/interfaces";
import { WorkerHoursStrategy } from "../../../services/@redis/cache/strategies/workerHours/workerHours.strategy";
import moment from "moment";
import { TIME_SECONDS } from "../../../constant/time";

export class WorkerBusinessHourService {
    /** Creates a service instance. */
    constructor() { }

    /** Creates one worker business-hour record. */
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

    // Fuera de alcance (scope schedules actual):
    // /** Returns one worker business-hour record by id. */
    // async getWorkerBusinessHourById(id: string): Promise<WorkerBusinessHour | null> {
    //     try {
    //         return await prisma.workerBusinessHour.findUnique({
    //             where: { id: id },
    //             select: {
    //                 id: true,
    //                 idUserFk: true,
    //                 weekDayType: true,
    //                 startTime: true,
    //                 endTime: true,
    //                 closed: true,
    //                 idWorkspaceFk: true,
    //                 idCompanyFk: true,
    //
    //
    //
    //                 createdDate: true,
    //                 updatedDate: true,
    //                 deletedDate: true,
    //             }
    //         });
    //     } catch (error: any) {
    //         throw new CustomError('WorkerBusinessHourWorkerBusinessHour.getWorkerBusinessHourById', error);
    //     }
    // }
    //
    // /** Returns worker business-hour records by weekday. */
    // async getWorkerBusinessHourByWeekDay(weekDayType: WeekDayType): Promise<WorkerBusinessHour[]> {
    //     try {
    //         return await prisma.workerBusinessHour.findMany({
    //             where: { weekDayType: weekDayType },
    //             select: {
    //                 id: true,
    //                 idUserFk: true,
    //                 weekDayType: true,
    //                 idWorkspaceFk: true,
    //                 idCompanyFk: true,
    //                 startTime: true,
    //                 endTime: true,
    //                 closed: true,
    //                 createdDate: true,
    //                 updatedDate: true,
    //                 deletedDate: true,
    //             },
    //             orderBy: { startTime: 'asc' },
    //         });
    //     } catch (error: any) {
    //         throw new CustomError('WorkerBusinessHourWorkerBusinessHour.getWorkerBusinessHourById', error);
    //     }
    // }
    //
    /** Returns worker business-hour records by worker and workspace. */
    async getWorkerBusinessHourByWorkerAndWorkspace(idWorker: string, idWorkspace: string): Promise<{
        id: string;
        idUserFk: string;
        weekDayType: $Enums.WeekDayType;
        closed: boolean;
        startTime: String;
        endTime: String;
    }[]> {
        try {
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

    /** Updates an existing worker business-hour record. */
    async updateWorkerBusinessHour(item: WorkerBusinessHour): Promise<WorkerBusinessHour> {
        try {
            const { id, weekDayType, idUserFk, closed, ...rest } = item;
            const existingCount = await prisma.workerBusinessHour.count({
                where: {
                    weekDayType,
                    idUserFk,
                },
            });
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
            if (!id) {
                throw new CustomError(
                    'WorkerBusinessHourWorkerBusinessHour.updateWorkerBusinessHour',
                    new Error(
                        withCatalogMessage(
                            ErrorCatalogByDomain.controller.validation.VALIDATION_REQUIRED_FIELD.message,
                            'Falta el campo "id" para la actualización'
                        )
                    )
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


    /** Deletes one or many worker business-hour records. */
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

    // Fuera de alcance (scope schedules actual):
    // /** Returns all worker business-hour records. */
    // async getWorkerBusinessHours() {
    //     try {
    //         let select: Prisma.WorkerBusinessHourSelect = {
    //             id: true,
    //             weekDayType: true,
    //             idUserFk: true,
    //             startTime: true,
    //             endTime: true,
    //             closed: true,
    //         };
    //
    //         const result = await prisma.workerBusinessHour.findMany({
    //             select: select,
    //             orderBy: { startTime: 'asc' },
    //         });
    //         return result;
    //     } catch (error: any) {
    //         throw new CustomError('BusinessHourBusinessHour.getBusinessHours', error);
    //     }
    // }


    /** Deletes worker business-hour records for one weekday. */
    async deleteWorkerBusinessHourByWorker(weekDayType: WeekDayType, idWorker: string): Promise<any> {
        try {
            const record = await prisma.workerBusinessHour.findFirst({
                where: { weekDayType: weekDayType, idUserFk: idWorker },
                select: { idWorkspaceFk: true }
            });

            const result = await prisma.workerBusinessHour.deleteMany({
                where: { weekDayType: weekDayType, idUserFk: idWorker },
            });
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

    /** Deletes closed worker business-hour records for one weekday. */
    async deleteClosedRecordsByWorker(weekDayType: WeekDayType, idWorker: string): Promise<any> {
        try {
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

    /** Converts a time value to HH:mm format. */
    toHHmm = (v: string): string => {
        const m = String(v).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
        if (!m) {
            throw new Error(
                withCatalogMessage(
                    ErrorCatalogByDomain.middleware.businessHour.BUSINESS_HOUR_INVALID_TIME_FORMAT.message,
                    `Hora inválida: ${v}`
                )
            );
        }
        return `${m[1].padStart(2, '0')}:${m[2]}`;
    };

    /** Checks whether a worker-hour range overlaps existing rows. */
    async checkOverlappingWorkerBusinessHour(
        startTime: string,
        endTime: string,
        weekDayType: WeekDayType,
        idUserFk: string,
        id?: string
    ): Promise<boolean> {
        const s = this.toHHmm(startTime);
        const e = this.toHHmm(endTime);
        const overlapping = await prisma.workerBusinessHour.findFirst({
            where: {
                idUserFk,
                weekDayType,
                closed: false,
                ...(id ? { id: { not: id } } : {}),
                AND: [
                    { startTime: { lt: e } },
                    { endTime: { gt: s } },
                ],
            },
            select: { id: true },
        });

        return !!overlapping;
    }

    /** Returns worker hours from cache and backfills missing users from database. */
    getWorkerHoursFromRedis = async (userIds: string[], idWorkspace: string): Promise<WorkerHoursMapType> => {
        const workerHoursMap: WorkerHoursMapType = {};
        const workerHoursStrategy = new WorkerHoursStrategy();
        for (const userId of userIds) {
            const workerHours = await workerHoursStrategy.getWorkerHours(idWorkspace, userId);
            if (workerHours) {
                workerHoursMap[userId] = workerHours;
            }
        }
        const missing = userIds.filter((u) => !workerHoursMap[u]);

        if (missing.length > 0) {
            const records = await prisma.workerBusinessHour.findMany({
                where: {
                    idWorkspaceFk: idWorkspace,
                    idUserFk: { in: missing },
                    deletedDate: null,
                },
            });
            for (const uid of missing) {
                workerHoursMap[uid] = {};
            }

            for (const r of records) {
                const weekDay = r.weekDayType;
                const start = r.startTime as unknown as string;
                const end = r.endTime as unknown as string;

                if (!workerHoursMap[r.idUserFk]) workerHoursMap[r.idUserFk] = {};
                if (!workerHoursMap[r.idUserFk]![weekDay]) workerHoursMap[r.idUserFk]![weekDay] = [];

                if (r.closed) {
                    workerHoursMap[r.idUserFk]![weekDay] = null as any;
                } else if (workerHoursMap[r.idUserFk]![weekDay] !== null) {
                    workerHoursMap[r.idUserFk]![weekDay]!.push([start, end]);
                }
            }
            for (const uid of missing) {
                await workerHoursStrategy.saveWorkerHours(idWorkspace, uid, workerHoursMap[uid], TIME_SECONDS.HOUR);
            }
        }

        return workerHoursMap;
    }

}
