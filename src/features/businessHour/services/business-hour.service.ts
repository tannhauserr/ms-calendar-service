import { Prisma, BusinessHour, WeekDayType } from "@prisma/client";
import prisma from "../../../lib/prisma";
import CustomError from "../../../models/custom-error/CustomError";
import { BusinessHoursType } from "../../../models/interfaces";
import { BusinessHoursStrategy } from "../../../services/@redis/cache/strategies/businessHours/businessHours.strategy";
import moment from "moment";
import { TIME_SECONDS } from "../../../constant/time";

export class BusinessHourService {
    /** Creates a service instance. */
    constructor() { }

    /** Normalizes business-hours input for internal schedule creation. */
    private normalizeInternalBusinessHours = (
        businessHours?: Array<{
            weekDayType: WeekDayType;
            startTime?: string | null;
            endTime?: string | null;
            closed?: boolean;
        }>
    ): Array<{
        weekDayType: WeekDayType;
        startTime: string | null;
        endTime: string | null;
        closed: boolean;
    }> | null => {
        if (!Array.isArray(businessHours) || businessHours.length === 0) {
            return null;
        }

        const allowedWeekDays = new Set(Object.values(WeekDayType));
        const normalized = businessHours.map((item) => {
            if (!item?.weekDayType || !allowedWeekDays.has(item.weekDayType)) {
                throw new Error(`weekDayType inválido: ${item?.weekDayType}`);
            }

            const isClosed = !!item.closed;
            if (isClosed) {
                return {
                    weekDayType: item.weekDayType,
                    startTime: null,
                    endTime: null,
                    closed: true,
                };
            }

            const rawStart = item.startTime ?? null;
            const rawEnd = item.endTime ?? null;

            if (!rawStart || !rawEnd) {
                throw new Error(`startTime y endTime son obligatorios para ${item.weekDayType}`);
            }

            const startTime = this.toHHmm(rawStart);
            const endTime = this.toHHmm(rawEnd);

            if (startTime >= endTime) {
                throw new Error(`Rango inválido para ${item.weekDayType}: startTime debe ser menor que endTime`);
            }

            return {
                weekDayType: item.weekDayType,
                startTime,
                endTime,
                closed: false,
            };
        });

        const closedDays = new Set(
            normalized.filter((x) => x.closed).map((x) => x.weekDayType)
        );
        for (const weekDayType of closedDays) {
            const hasOpenOnSameDay = normalized.some(
                (x) => x.weekDayType === weekDayType && !x.closed
            );
            if (hasOpenOnSameDay) {
                throw new Error(`No se puede mezclar closed=true con franjas horarias en ${weekDayType}`);
            }
        }

        return normalized;
    }

    /** Creates one business-hour record. */
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

    /** Returns one business-hour record by id. */
    async getBusinessHourById(id: string): Promise<BusinessHour | null> {
        try {
            return await prisma.businessHour.findUnique({
                where: { id: id },
                select: {
                    id: true,
                    weekDayType: true,
                    idCompanyFk: true,
                    idWorkspaceFk: true,
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

    /** Returns business-hour records by weekday. */
    async getBusinessHourByWeekDay(weekDayType: WeekDayType): Promise<BusinessHour[]> {
        try {
            return await prisma.businessHour.findMany({
                where: { weekDayType: weekDayType },
                select: {
                    id: true,
                    weekDayType: true,
                    idCompanyFk: true,
                    idWorkspaceFk: true,
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

    /** Updates one business-hour record. */
    async updateBusinessHour(item: BusinessHour): Promise<BusinessHour> {
        try {
            const id = item.id as string;
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

    /** Deletes one or many business-hour records and invalidates cache. */
    async deleteBusinessHour(idList: string[]): Promise<any> {
        try {
            console.log('idList', idList);
            let listAux = Array.isArray(idList) ? idList : [idList];
            const records = await prisma.businessHour.findMany({
                where: { id: { in: listAux } },
                select: { idWorkspaceFk: true }
            });

            const result = await prisma.businessHour.deleteMany({
                where: {
                    id: {
                        in: listAux,
                    },
                },
            });
            const businessHoursStrategy = new BusinessHoursStrategy();
            const uniqueWorkspaces = new Set(records.map(r => r.idWorkspaceFk));

            for (const workspaceId of uniqueWorkspaces) {
                await businessHoursStrategy.deleteBusinessHours(workspaceId);
            }

            return result;
        } catch (error: any) {
            throw new CustomError('BusinessHourBusinessHour.deleteBusinessHour', error);
        }
    }

    /** Returns active business hours for a workspace. */
    async getBusinessHours(idWorkspace: string): Promise<BusinessHour[]> {
        try {

            console.log('idWorkspace', idWorkspace);
            console.log('idWorkspace', idWorkspace);
            console.log('idWorkspace', idWorkspace);
            console.log('idWorkspace', idWorkspace);


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
                    idWorkspaceFk: idWorkspace || 'aa00bc',
                    deletedDate: null,
                },
            });


            console.log('result be', result);

            return result;
        } catch (error: any) {
            throw new CustomError('BusinessHourBusinessHour.getBusinessHours', error);
        }
    }

    /** Deletes all records for a weekday in a workspace. */
    async deleteBusinessHourByWeekDay(weekDayType: WeekDayType, idWorkspace: string): Promise<any> {
        try {
            return await prisma.businessHour.deleteMany({
                where: {
                    weekDayType: weekDayType,
                    idWorkspaceFk: idWorkspace
                },
            });
        } catch (error: any) {
            throw new CustomError('BusinessHourBusinessHour.deleteBusinessHourByWeekDay', error);
        }
    }

    /** Deletes only closed records for a weekday in a workspace. */
    async deleteClosedRecordsByWeekDay(weekDayType: WeekDayType, idWorkspace: string): Promise<any> {
        try {
            return await prisma.businessHour.deleteMany({
                where: {
                    weekDayType: weekDayType,
                    idWorkspaceFk: idWorkspace,
                    closed: true
                }
            });
        } catch (error: any) {
            throw new CustomError('BusinessHourBusinessHour.deleteClosedRecordsByWeekDay', error);
        }
    }

    /** Converts a time value to HH:mm format. */
    toHHmm = (v: string): string => {
        const m = String(v).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
        if (!m) throw new Error(`Hora inválida: ${v}`);
        return `${m[1].padStart(2, '0')}:${m[2]}`;
    };

    /** Checks whether a business-hour range overlaps with existing rows. */
    async checkOverlappingBusinessHour(
        startTime: string,
        endTime: string,
        weekDayType: WeekDayType,
        idWorkspaceFk: string,
        id?: string
    ): Promise<boolean> {
        const s = this.toHHmm(startTime);
        const e = this.toHHmm(endTime);

        const overlapping = await prisma.businessHour.findFirst({
            where: {
                weekDayType,
                idWorkspaceFk,
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



    /** Returns business hours from cache or loads them from database. */
    getBusinessHoursFromRedis = async (idCompany: string, idWorkspace: string): Promise<BusinessHoursType> => {
        const businessHoursStrategy = new BusinessHoursStrategy();
        let businessHours = await businessHoursStrategy.getBusinessHours(idWorkspace);

        if (businessHours) {
            return businessHours;
        }

        console.log("mira que es idCompany y idWorkspace", idCompany, idWorkspace);
        const businessHoursRecords = await prisma.businessHour.findMany({
            where: {
                idWorkspaceFk: idWorkspace,
                deletedDate: null,
            },
        });
        businessHours = {};

        for (const record of businessHoursRecords) {
            const weekDay = record.weekDayType;
            if (record.closed) continue;


            const startTime = record.startTime as unknown as string;
            const endTime = record.endTime as unknown as string;
            if (!businessHours[weekDay]) {
                businessHours[weekDay] = [];
            }
            businessHours[weekDay].push([startTime, endTime]);
        }
        await businessHoursStrategy.saveBusinessHours(idWorkspace, businessHours, TIME_SECONDS.HOUR);

        console.log("Horarios de negocio guardados en Redis");

        return businessHours;
    }

    /** Generates default business hours for a workspace when none exist. */
    internalGenerateWorkspaceBusinessHours = async (
        idCompany: string,
        idWorkspace: string,
        businessHours?: Array<{
            weekDayType: WeekDayType;
            startTime?: string | null;
            endTime?: string | null;
            closed?: boolean;
        }>
    ): Promise<{ created: boolean; businessHours: BusinessHour[] }> => {
        try {
            if (!idCompany || !idWorkspace) {
                throw new Error('idCompany e idWorkspace son obligatorios');
            }

            const result = await prisma.$transaction(async (tx) => {
                const existingBusinessHours = await tx.businessHour.findMany({
                    where: {
                        idWorkspaceFk: idWorkspace,
                        deletedDate: null,
                    },
                    orderBy: [{ weekDayType: 'asc' }, { startTime: 'asc' }],
                });

                if (existingBusinessHours.length > 0) {
                    return { created: false, businessHours: existingBusinessHours };
                }

                const normalizedIncomingBusinessHours = this.normalizeInternalBusinessHours(businessHours);
                const baseSchedule: Array<{
                    weekDayType: WeekDayType;
                    startTime: string | null;
                    endTime: string | null;
                    closed: boolean;
                }> = [
                    { weekDayType: WeekDayType.MONDAY, startTime: "09:00", endTime: "13:00", closed: false },
                    { weekDayType: WeekDayType.MONDAY, startTime: "15:00", endTime: "20:00", closed: false },
                    { weekDayType: WeekDayType.TUESDAY, startTime: "09:00", endTime: "13:00", closed: false },
                    { weekDayType: WeekDayType.TUESDAY, startTime: "15:00", endTime: "20:00", closed: false },
                    { weekDayType: WeekDayType.WEDNESDAY, startTime: "09:00", endTime: "13:00", closed: false },
                    { weekDayType: WeekDayType.WEDNESDAY, startTime: "15:00", endTime: "20:00", closed: false },
                    { weekDayType: WeekDayType.THURSDAY, startTime: "09:00", endTime: "13:00", closed: false },
                    { weekDayType: WeekDayType.THURSDAY, startTime: "15:00", endTime: "20:00", closed: false },
                    { weekDayType: WeekDayType.FRIDAY, startTime: "09:00", endTime: "13:00", closed: false },
                    { weekDayType: WeekDayType.FRIDAY, startTime: "15:00", endTime: "20:00", closed: false },
                    { weekDayType: WeekDayType.SATURDAY, startTime: "10:00", endTime: "14:00", closed: false },
                    { weekDayType: WeekDayType.SUNDAY, startTime: null, endTime: null, closed: true },
                ];

                await tx.businessHour.createMany({
                    data: (normalizedIncomingBusinessHours ?? baseSchedule).map((hour) => ({
                        idCompanyFk: idCompany,
                        idWorkspaceFk: idWorkspace,
                        weekDayType: hour.weekDayType,
                        startTime: hour.startTime,
                        endTime: hour.endTime,
                        closed: hour.closed,
                        createdDate: new Date(),
                        updatedDate: new Date(),
                    })),
                });

                const createdBusinessHours = await tx.businessHour.findMany({
                    where: {
                        idWorkspaceFk: idWorkspace,
                        deletedDate: null,
                    },
                    orderBy: [{ weekDayType: 'asc' }, { startTime: 'asc' }],
                });

                return { created: true, businessHours: createdBusinessHours };
            });

            const businessHoursStrategy = new BusinessHoursStrategy();
            await businessHoursStrategy.deleteBusinessHours(idWorkspace);

            return result;
        } catch (error: any) {
            throw new CustomError('BusinessHourBusinessHour.internalGenerateWorkspaceBusinessHours', error);
        }
    }
}
