import { Prisma, BusinessHour, WeekDayType } from "@prisma/client";
import prisma from "../../../../lib/prisma";
import CustomError from "../../../../models/custom-error/CustomError";
import { BusinessHoursType } from "../../../../models/interfaces";
import { BusinessHoursStrategy } from "../../../@redis/cache/strategies/businessHours/businessHours.strategy";
import moment from "moment";
import { TIME_SECONDS } from "../../../../constant/time";

export class BusinessHourService {
    constructor() { }

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

    async updateBusinessHour(item: BusinessHour): Promise<BusinessHour> {
        try {
            const { id, ...rest } = item as BusinessHour & { id: string };

            return await prisma.businessHour.update({
                where: { id: id },
                data: {
                    ...rest,
                    updatedDate: new Date(),
                },
            });
        } catch (error: any) {
            throw new CustomError('BusinessHourBusinessHour.updateBusinessHour', error);
        }
    }

    async deleteBusinessHour(idList: string[]): Promise<any> {
        try {
            console.log('idList', idList);
            let listAux = Array.isArray(idList) ? idList : [idList];

            // 🟢 Obtener registros antes de eliminar para saber qué workspaces invalidar
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

            // 🟢 Invalidar Redis para cada workspace único afectado
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

    toHHmm = (v: string): string => {
        const m = String(v).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
        if (!m) throw new Error(`Hora inválida: ${v}`);
        return `${m[1].padStart(2, '0')}:${m[2]}`;
    };

    async checkOverlappingBusinessHour(
        startTime: string,                 // <- string "HH:mm"
        endTime: string,                   // <- string "HH:mm"
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

    // async checkOverlappingBusinessHour(
    //     startTime: Date,
    //     endTime: Date,
    //     weekDayType: WeekDayType,
    //     idWorkspaceFk: string,
    //     id: any = undefined
    // ): Promise<boolean> {
    //     try {
    //         // Construir la cláusula where base para la búsqueda
    //         const whereClause: any = {
    //             weekDayType: weekDayType,
    //             idWorkspaceFk: idWorkspaceFk,
    //             AND: [
    //                 {
    //                     OR: [
    //                         {
    //                             // Verificar si el nuevo horario inicia dentro de un horario existente
    //                             startTime: {
    //                                 lt: endTime,  // Menor que el final del nuevo horario
    //                             },
    //                             endTime: {
    //                                 gt: startTime,  // Mayor que el inicio del nuevo horario
    //                             },
    //                         },
    //                     ],
    //                 },
    //                 {
    //                     closed: false, // Solo considerar horarios que no estén cerrados
    //                 },
    //             ],
    //         };

    //         // Si se proporciona un ID, excluir el registro actual de la búsqueda
    //         if (id !== undefined) {
    //             whereClause.id = { not: id };
    //         }

    //         // Buscar si existe algún horario que se solape con el rango de tiempo dado
    //         const overlappingHours = await prisma.businessHour.findFirst({
    //             where: whereClause,
    //         });

    //         // Retornar true si se encontró un horario solapado, false en caso contrario
    //         return !!overlappingHours;
    //     } catch (error) {
    //         console.error('Error checking overlapping business hours:', error);
    //         throw new Error('Could not check overlapping business hours');
    //     }
    // }



    /**
     * Devuelve los horarios de negocio de una empresa.
     * Intentará obtenerlos de Redis, y si no están allí, los obtendrá de la base de datos.
     * @param idCompany 
     * @returns 
     */
    getBusinessHoursFromRedis = async (idCompany: string, idWorkspace: string): Promise<BusinessHoursType> => {
        const businessHoursStrategy = new BusinessHoursStrategy();

        // Intentar obtener los horarios de negocio desde Redis
        let businessHours = await businessHoursStrategy.getBusinessHours(idWorkspace);

        if (businessHours) {
            // console.log("Horarios de negocio obtenidos de Redis");
            return businessHours;
        }

        console.log("mira que es idCompany y idWorkspace", idCompany, idWorkspace);

        // Si no están en Redis, obtenerlos de la base de datos
        const businessHoursRecords = await prisma.businessHour.findMany({
            where: {
                // idCompanyFk: idCompany,
                idWorkspaceFk: idWorkspace,
                deletedDate: null,
            },
        });

        // Estructurar los datos
        businessHours = {};

        for (const record of businessHoursRecords) {
            const weekDay = record.weekDayType; // e.g., 'MONDAY'
            if (record.closed) continue; // Omitir días cerrados

            // Convertir los tiempos a cadenas en formato 'HH:mm' usando moment
            // const startTime = moment.utc(record.startTime).format('HH:mm');
            // const endTime = moment.utc(record.endTime).format('HH:mm');


            const startTime = record.startTime as unknown as string;
            const endTime = record.endTime as unknown as string;



            // console.log("getBusinessHoursFromRedis startTime", weekDay, startTime);
            // console.log("getBusinessHoursFromRedis endTime", weekDay, endTime);

            // Asegurar que existe una entrada para el día de la semana
            if (!businessHours[weekDay]) {
                businessHours[weekDay] = [];
            }

            // Añadir el rango de tiempo al día correspondiente
            businessHours[weekDay].push([startTime, endTime]);
        }

        // Guardar en Redis para futuras consultas
        await businessHoursStrategy.saveBusinessHours(idWorkspace, businessHours, TIME_SECONDS.HOUR);

        console.log("Horarios de negocio guardados en Redis");

        return businessHours;
    }

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
