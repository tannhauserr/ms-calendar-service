import { Event, EventPurposeType, Prisma, TemporaryBusinessHour } from "@prisma/client";
import prisma from "../../../lib/prisma";
import CustomError from "../../../models/custom-error/CustomError";
import { ErrorCatalogByDomain } from "../../../models/error-codes";
import { Pagination } from "../../../models/pagination";
import { getGeneric } from "../../../utils/get-genetic/getGenetic";
import moment from "moment";
import { TemporaryHoursMapType } from "../../../models/interfaces/temporary-business-hours-type";
import { TemporaryHoursStrategy } from "../../../services/@redis/cache/strategies/temporaryHours/temporaryHours.strategy";
import { TIME_SECONDS } from "../../../constant/time";
import { HoursRangeInput, normalizeRange, isWithin, listDaysInclusive } from "../interfaces";

const withCatalogMessage = (message: string, detail: string): string => `${message} ${detail}`;

export class TemporaryBusinessHourService {
    /** Creates a service instance. */
    constructor() { }

    /** Resolves a date/time value into a Date instance. */
    private resolveEventDateTime(baseDate: Date | string, value: unknown): Date | null {
        if (!value) {
            return null;
        }
        if (value instanceof Date) {
            return value;
        }

        const raw = String(value).trim();
        if (!raw) {
            return null;
        }

        if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
            const parsed = new Date(raw);
            return isNaN(parsed.getTime()) ? null : parsed;
        }

        const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
        if (!match) {
            return null;
        }

        const hours = match[1].padStart(2, "0");
        const minutes = match[2];
        const dateStr = moment(baseDate).format("YYYY-MM-DD");
        const dateTime = moment(`${dateStr}T${hours}:${minutes}`, "YYYY-MM-DDTHH:mm", true);
        return dateTime.isValid() ? dateTime.toDate() : null;
    }

    /** Builds the event range and all-day flag for a temporary block. */
    private buildTemporaryBlockEventRange(record: {
        date: Date | string;
        startTime?: unknown;
        endTime?: unknown;
        closed?: boolean;
    }): { startDate: Date; endDate: Date; allDay: boolean } {
        const startDate = this.resolveEventDateTime(record.date, record.startTime);
        const endDate = this.resolveEventDateTime(record.date, record.endTime);
        const isAllDay = !!record.closed || !startDate || !endDate || endDate <= startDate;

        if (isAllDay) {
            return {
                startDate: moment(record.date).startOf("day").toDate(),
                endDate: moment(record.date).endOf("day").toDate(),
                allDay: true,
            };
        }

        return {
            startDate,
            endDate,
            allDay: false,
        };
    }

    /** Creates the event/group records linked to a temporary block. */
    private async createTemporaryBlockEvent(
        record: {
            title?: string | null;
            description?: string | null;
            idCompanyFk: string;
            idWorkspaceFk: string;
            idUserFk?: string | null;
            date: Date | string;
            startTime?: unknown;
            endTime?: unknown;
            closed?: boolean;
        },
        tx: Prisma.TransactionClient
    ): Promise<Event> {
        if (!record.idCompanyFk || !record.idWorkspaceFk) {
            throw new Error(
                withCatalogMessage(
                    ErrorCatalogByDomain.controller.validation.VALIDATION_REQUIRED_FIELD.message,
                    "idCompanyFk e idWorkspaceFk son obligatorios para crear el evento"
                )
            );
        }
        const { startDate, endDate, allDay } = this.buildTemporaryBlockEventRange(record);
        const title = record?.title ?? "Bloqueo temporal";
        const description = record.description ?? "";

        const group = await tx.groupEvents.create({
            data: {
                title,
                description,
                idCompanyFk: record.idCompanyFk,
                idWorkspaceFk: record.idWorkspaceFk,
                startDate,
                endDate,

                eventStatusType: "ACCEPTED"
            },
        });

        const event = await tx.event.create({
            data: {
                idGroup: group.id,
                title,
                description,
                startDate,
                endDate,
                idUserPlatformFk: record.idUserFk ?? null,
                eventPurposeType: EventPurposeType.TEMPORARY_BLOCK,
                allDay,
                idCompanyFk: record.idCompanyFk,

                
            },
        });

        return event;
    }

    /** Updates the event/group records linked to a temporary block. */
    private async updateTemporaryBlockEvent(
        eventId: string,
        record: {
            title?: string | null;
            description?: string | null;
            idUserFk?: string | null;
            date: Date | string;
            startTime?: unknown;
            endTime?: unknown;
            closed?: boolean;
        },
        tx: Prisma.TransactionClient
    ): Promise<Event> {
        const { startDate, endDate, allDay } = this.buildTemporaryBlockEventRange(record);

        const event = await tx.event.update({
            where: { id: eventId },
            data: {
                title: record?.title ?? "Bloqueo temporal",
                description: record.description ?? "",
                startDate,
                endDate,
                idUserPlatformFk: record.idUserFk ?? null,
                eventPurposeType: EventPurposeType.TEMPORARY_BLOCK,
                allDay,
            },
        });

        await tx.groupEvents.update({
            where: { id: event.idGroup },
            data: {
                title: record?.title ?? "Bloqueo temporal",
                startDate,
                endDate,
            },
        });

        return event;
    }

    /** Deletes event/group records linked to temporary rows. */
    private async deleteTemporaryBlockEvents(records: TemporaryBusinessHour[], tx: Prisma.TransactionClient): Promise<void> {
        const eventIds = Array.from(new Set(records.map((record) => record.idEventFk).filter(Boolean)));
        if (eventIds.length === 0) {
            return;
        }

        const events = await tx.event.findMany({
            where: { id: { in: eventIds } },
            select: { id: true, idGroup: true },
        });

        const groupIds = Array.from(new Set(events.map((event) => event.idGroup)));

        await tx.event.deleteMany({
            where: { id: { in: eventIds } },
        });

        if (groupIds.length > 0) {
            await tx.groupEvents.deleteMany({
                where: {
                    id: { in: groupIds },
                    events: { none: {} },
                },
            });
        }
    }

    /** Creates a temporary business-hour exception and linked event. */
    async addTemporaryBusinessHour(item: TemporaryBusinessHour): Promise<{ temporary: TemporaryBusinessHour; event: Event }> {
        try {
            const { id, idEventFk, event, createdDate, updatedDate, deletedDate, ...dataWithoutId } = item as any;

            return await prisma.$transaction(async (tx) => {
                const event = await this.createTemporaryBlockEvent(dataWithoutId, tx);

                const temporary = await tx.temporaryBusinessHour.create({
                    data: {
                        ...dataWithoutId,
                        event: { connect: { id: event.id } },
                        createdDate: new Date(),
                        updatedDate: new Date(),
                    },
                });

                return { temporary, event };
            });
        } catch (error: any) {
            throw new CustomError('TemporaryBusinessHour.addTemporaryBusinessHour', error);
        }
    }

    /** Returns one temporary business-hour exception by id. */
    async getTemporaryBusinessHourById(id: string): Promise<Partial<TemporaryBusinessHour> | null> {
        try {
            return await prisma.temporaryBusinessHour.findUnique({
                where: { id: id },
                select: {
                    id: true,
                    title: true,
                    description: true,
                    date: true,
                    startTime: true,
                    endTime: true,
                    closed: true,
                    idUserFk: true,
                    idWorkspaceFk: true,
                    idCompanyFk: true,
                    idEventFk: true,

                }
            });
        } catch (error: any) {
            throw new CustomError('TemporaryBusinessHour.getTemporaryBusinessHourById', error);
        }
    }

    /** Returns temporary business-hour exceptions for a date. */
    async getTemporaryBusinessHourByDate(date: Date): Promise<Partial<TemporaryBusinessHour>[]> {
        try {
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
                    title: true,
                    description: true,
                    date: true,
                    idWorkspaceFk: true,
                    idCompanyFk: true,
                    startTime: true,
                    endTime: true,
                    closed: true,
                    idUserFk: true,
                    createdDate: true,
                    updatedDate: true,
                    deletedDate: true,
                    idEventFk: true,
                },
                orderBy: { startTime: 'asc' },
            });
        } catch (error: any) {
            throw new CustomError('TemporaryBusinessHour.getTemporaryBusinessHourById', error);
        }
    }

    /** Returns temporary business-hour exceptions for one worker and date. */
    async getTemporaryBusinessHourByWorkerAndDate(idWorker: string, date: Date): Promise<{
        id: string;
        idUserFk: string;
        date: Date;
        closed: boolean;
        startTime: string;
        endTime: string;
    }[]> {
        try {
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


    
    /** Returns distinct dates with exceptions for one worker. */
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
            return result.map((item) => item.date);
        } catch (error: any) {
            throw new CustomError('TemporaryBusinessHour.getDistinctDatesWithExceptionsByWorker', error);
        }
    }


    /** Updates a temporary business-hour exception and linked event. */
    async updateTemporaryBusinessHour(item: TemporaryBusinessHour): Promise<{ temporary: TemporaryBusinessHour; event: Event }> {
        try {
            return await prisma.$transaction(async (tx) => {
                const incomingEventId = item.idEventFk ? String(item.idEventFk) : undefined;

                if (!incomingEventId) {
                    throw new Error(
                        withCatalogMessage(
                            ErrorCatalogByDomain.controller.validation.VALIDATION_REQUIRED_FIELD.message,
                            "Debe proporcionar idEventFk para actualizar el registro"
                        )
                    );
                }

                const currentRecord = await tx.temporaryBusinessHour.findFirst({
                    where: { idEventFk: incomingEventId },
                });

                if (!currentRecord) {
                    throw new Error(
                        withCatalogMessage(
                            ErrorCatalogByDomain.controller.resource.RESOURCE_NOT_FOUND.message,
                            "No se encontró el registro a actualizar"
                        )
                    );
                }

                const effectiveRecord = {
                    ...currentRecord,
                    ...item,
                    idCompanyFk: item.idCompanyFk === undefined ? currentRecord.idCompanyFk : item.idCompanyFk,
                    idWorkspaceFk: item.idWorkspaceFk === undefined ? currentRecord.idWorkspaceFk : item.idWorkspaceFk,
                    idUserFk: item.idUserFk === undefined ? currentRecord.idUserFk : item.idUserFk,
                    date: item.date === undefined ? currentRecord.date : item.date,
                    startTime: item.startTime === undefined ? currentRecord.startTime : item.startTime,
                    endTime: item.endTime === undefined ? currentRecord.endTime : item.endTime,
                    closed: item.closed === undefined ? currentRecord.closed : item.closed,
                    title: item.title === undefined ? currentRecord.title : item.title,
                    description: item.description === undefined ? currentRecord.description : item.description,
                };

                const eventId = currentRecord.idEventFk;
                const updatedEvent = await this.updateTemporaryBlockEvent(eventId, effectiveRecord, tx);

                const { id, idEventFk, event: eventPayload, createdDate, updatedDate, deletedDate, ...dataWithoutId } = item as any;

                const temporary = await tx.temporaryBusinessHour.update({
                    where: { id: currentRecord.id },
                    data: {
                        ...dataWithoutId,
                        idEventFk: eventId,
                        updatedDate: new Date(),
                    },
                });

                return { temporary, event: updatedEvent };
            });
        } catch (error: any) {
            throw new CustomError('TemporaryBusinessHour.updateTemporaryBusinessHour', error);
        }
    }

    /** Deletes temporary business-hour exceptions and linked events by ids. */
    async deleteTemporaryBusinessHour(idList: string[]): Promise<any> {
        try {
            const listAux = Array.isArray(idList) ? idList : [idList];

            return await prisma.$transaction(async (tx) => {
                const recordsToDelete = await tx.temporaryBusinessHour.findMany({
                    where: {
                        id: { in: listAux },
                    },
                });

                const result = await tx.temporaryBusinessHour.deleteMany({
                    where: {
                        id: {
                            in: listAux,
                        },
                    },
                });

                await this.deleteTemporaryBlockEvents(recordsToDelete, tx);

                return result;
            });
        } catch (error: any) {
            throw new CustomError('TemporaryBusinessHour.deleteTemporaryBusinessHour', error);
        }
    }

    /** Returns temporary business-hour records with generic pagination. */
    async getTemporaryBusinessHours(pagination: Pagination, isUserTemporaryTemporaryBusinessHours = true) {
        try {
            let select: Prisma.TemporaryBusinessHourSelect = {
                id: true,
                date: true,
                startTime: true,
                endTime: true,
                closed: true,
                idUserFk: true,
                idWorkspaceFk: true,
            };

            const result = await getGeneric(pagination, "temporaryBusinessHour", select);
            return result;
        } catch (error: any) {
            throw new CustomError('TemporaryBusinessHour.getTemporaryTemporaryBusinessHours', error);
        }
    }


    /** Returns grouped temporary business-hour records with pagination. */
    async getTemporaryBusinessHours2(pagination?: Pagination): Promise<any> {
        try {
            const pageRaw = Number(pagination?.page ?? 1);
            const itemsPerPageRaw = Number(pagination?.itemsPerPage ?? 20);
            const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
            const itemsPerPage = Number.isFinite(itemsPerPageRaw) && itemsPerPageRaw > 0 ? itemsPerPageRaw : 20;
            const skip = (page - 1) * itemsPerPage;
            const take = itemsPerPage;

            const idUserFilter = pagination?.filters?.idUserFk as any;
            const idWorkspaceFilter = pagination?.filters?.idWorkspaceFk as any;
            const idUserFk = idUserFilter?.value ?? idUserFilter;
            const idWorkspaceFk = idWorkspaceFilter?.value ?? idWorkspaceFilter;

            let groups: any[] = [];
            let countResult: any;

            if (idUserFk) {
                groups = await prisma.$queryRaw`
      SELECT
        MIN("id") AS "id",
        "idUserFk",
        DATE("date") AS "day",
        bool_or("closed") AS closed,
        json_agg(
          json_build_object(
            'id', "id",
            'startTime',
              CASE 
                WHEN coalesce(trim("startTime"), '') <> '' 
                THEN to_char("startTime"::time, 'HH24:MI')
                ELSE NULL
              END,
            'endTime',
              CASE 
                WHEN coalesce(trim("endTime"), '') <> '' 
                THEN to_char("endTime"::time, 'HH24:MI')
                ELSE NULL
              END,
            'closed', "closed"
          ) ORDER BY ("startTime")::time
        ) AS times
      FROM "temporaryBusinessHours"
      WHERE "idUserFk" = ${idUserFk}
      ${idWorkspaceFk ? Prisma.sql`AND "idWorkspaceFk" = ${idWorkspaceFk}` : Prisma.empty}
      GROUP BY "idUserFk", DATE("date")
      ORDER BY DATE("date") DESC
      LIMIT ${take} OFFSET ${skip}
    `;

                countResult = await prisma.$queryRaw`
      SELECT COUNT(*) AS count FROM (
        SELECT "idUserFk", DATE("date") AS "day"
        FROM "temporaryBusinessHours"
        WHERE "idUserFk" = ${idUserFk}
        ${idWorkspaceFk ? Prisma.sql`AND "idWorkspaceFk" = ${idWorkspaceFk}` : Prisma.empty}
        GROUP BY "idUserFk", DATE("date")
      ) AS sub
    `;
            } else {
                groups = await prisma.$queryRaw`
      SELECT
        MIN("id") AS "id",
        "idUserFk",
        "idWorkspaceFk",
        DATE("date") AS "day",
        bool_or("closed") AS closed,
        json_agg(
          json_build_object(
            'id', "id",
            'startTime',
              CASE 
                WHEN coalesce(trim("startTime"), '') <> '' 
                THEN to_char("startTime"::time, 'HH24:MI')
                ELSE NULL
              END,
            'endTime',
              CASE 
                WHEN coalesce(trim("endTime"), '') <> '' 
                THEN to_char("endTime"::time, 'HH24:MI')
                ELSE NULL
              END,
            'closed', "closed"
          ) ORDER BY ("startTime")::time
        ) AS times
      FROM "temporaryBusinessHours"
      GROUP BY "idUserFk", DATE("date"), "idWorkspaceFk"
      ORDER BY DATE("date") DESC
      LIMIT ${take} OFFSET ${skip}
    `;

                countResult = await prisma.$queryRaw`
      SELECT COUNT(*) AS count FROM (
        SELECT "idUserFk", DATE("date") AS "day", "idWorkspaceFk"
        FROM "temporaryBusinessHours"
        GROUP BY "idUserFk", DATE("date"), "idWorkspaceFk"
      ) AS sub
    `;
            }

            const totalGroups = parseInt(countResult[0].count, 10);

            return {
                rows: groups,
                pagination: {
                    totalItems: totalGroups,
                    totalPages: Math.ceil(totalGroups / itemsPerPage),
                },
            };
        } catch (error: any) {
            throw new CustomError('TemporaryBusinessHour.getTemporaryBusinessHoursGrouped', error);
        }
    }


    /** Deletes temporary exceptions for one worker on one date. */
    async deleteTemporaryBusinessHourByWorkerAndDate(idWorker: string, date: Date): Promise<any> {
        try {
            const startDate = moment(date).startOf('day').toDate();
            const endDate = moment(date).endOf('day').toDate();

            return await prisma.temporaryBusinessHour.deleteMany({
                where: {
                    idUserFk: idWorker,
                    date: {
                        gte: startDate,
                        lt: endDate
                    }
                },
            });
        } catch (error: any) {
            throw new CustomError('TemporaryBusinessHour.deleteTemporaryBusinessHourByWorkerAndDate', error);
        }
    }


    /** Deletes closed temporary exceptions for one worker on one date. */
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



    /** Checks whether a temporary range overlaps existing rows. */
    async checkOverlappingTemporaryBusinessHour(startTime: Date, endTime: Date, idUserFk: string, idWorkspaceFk: string, date: Date, id: any = undefined): Promise<boolean> {
        try {
            const startDate = moment(date).startOf('day').toDate();
            const endDate = moment(date).endOf('day').toDate();

            const whereClause: any = {
                idUserFk,
                idWorkspaceFk,
                date,
                AND: [
                    {
                        OR: [
                            {
                                startTime: { lte: endTime },
                                endTime: { gte: startTime },
                            },
                        ],
                    },
                    {
                        closed: false,
                    },
                ],
            };

            if (id !== undefined) {
                whereClause.id = { not: id };
            }
            const overlappingHours = await prisma.temporaryBusinessHour.findFirst({
                where: whereClause,
            });
            return !!overlappingHours;
        } catch (error: any) {
            console.error('Error checking overlapping temporary business hours:', error);
            throw new CustomError('TemporaryBusinessHour.checkOverlappingTemporaryBusinessHour', error);
        }
    }


    /** Returns temporary hours from cache and backfills missing dates from database. */
    getTemporaryHoursFromRedis = async (
        userIds: string[],
        idWorkspace: string,
        range?: HoursRangeInput
    ): Promise<TemporaryHoursMapType> => {
        try {
            const temporaryHoursMap: TemporaryHoursMapType = {};
            const temporaryHoursStrategy = new TemporaryHoursStrategy();

            const { start, end } = normalizeRange(range, true);


            const wantedDays = listDaysInclusive(start, end);
            const startDate = moment(start, "YYYY-MM-DD").toDate();
            const endDate = moment(end, "YYYY-MM-DD").toDate();

            for (const userId of userIds) {
                const cached =
                    (await temporaryHoursStrategy.getTemporaryHours(idWorkspace, userId)) || {};
                const covered = new Set(Object.keys(cached));
                const missingDays = wantedDays.filter((d) => !covered.has(d));
                const merged: { [date: string]: string[][] | null } = { ...cached };

                if (missingDays.length > 0) {
                    let records: any[] = [];
                    const THRESHOLD_IN = 6;
                    if (missingDays.length <= THRESHOLD_IN) {
                        records = await prisma.temporaryBusinessHour.findMany({
                            where: {
                                idWorkspaceFk: idWorkspace,
                                idUserFk: userId,
                                deletedDate: null,
                                date: { in: missingDays.map((d) => new Date(d)) },
                            },
                        });
                    } else {
                        records = await prisma.temporaryBusinessHour.findMany({
                            where: {
                                idWorkspaceFk: idWorkspace,
                                idUserFk: userId,
                                deletedDate: null,
                                date: { gte: startDate, lte: endDate },
                            },
                        });
                    }
                    const patch: { [date: string]: string[][] | null } = {};
                    for (const record of records) {
                        const dateStr = moment(record.date).format("YYYY-MM-DD");
                        if (!isWithin(dateStr, start, end)) continue;

                        if (record?.closed) {
                            patch[dateStr] = null;
                            continue;
                        }
                        if (!record.startTime || !record.endTime) continue;

                        const startTime = record.startTime as unknown as string;
                        const endTime = record.endTime as unknown as string;

                        if (!patch[dateStr]) patch[dateStr] = [];
                        (patch[dateStr] as string[][]).push([startTime, endTime]);
                    }
                    if (Object.keys(patch).length > 0) {
                        for (const [k, v] of Object.entries(patch)) {
                            merged[k] = v;
                        }

                        await temporaryHoursStrategy.saveTemporaryHours(
                            idWorkspace,
                            userId,
                            merged,
                            TIME_SECONDS.HOUR
                        );
                    }
                }
                const filtered: { [date: string]: string[][] | null } = {};
                for (const d of wantedDays) {
                    if (d in merged) filtered[d] = merged[d];
                }

                temporaryHoursMap[userId] = filtered;
            }

            return temporaryHoursMap;
        } catch (error: any) {
            throw new CustomError('TemporaryBusinessHour.getTemporaryHoursFromRedis', error);
        }
    };


    /** Returns all temporary rows that belong to deletion scope. */
    public async getTemporaryBusinessHoursForDeletion(idList: string[], idWorkspace: string): Promise<TemporaryBusinessHour[]> {
        try {
            const listAux = Array.isArray(idList) ? idList : [idList];
            const baseRecords = await prisma.temporaryBusinessHour.findMany({
                where: {
                    id: { in: listAux },
                    idWorkspaceFk: idWorkspace,
                },
                select: {
                    idUserFk: true,
                    idWorkspaceFk: true,
                    date: true,
                },
            });
            const orConditions = [];
            for (const r of baseRecords) {
                const dayStart = moment(r.date).startOf('day').toDate();
                const dayEnd = moment(dayStart).add(1, 'day').toDate();

                orConditions.push({
                    idUserFk: r.idUserFk,
                    idWorkspaceFk: r.idWorkspaceFk,
                    dateRangeStart: dayStart,
                    dateRangeEnd: dayEnd,
                });
            }

            if (orConditions.length === 0) {
                return [];
            }
            return await prisma.temporaryBusinessHour.findMany({
                where: {
                    OR: orConditions.map((c) => ({
                        idUserFk: c.idUserFk,
                        idWorkspaceFk: c.idWorkspaceFk,
                        date: {
                            gte: c.dateRangeStart,
                            lt: c.dateRangeEnd,
                        },
                    })),
                },
            });
        } catch (error: any) {
            throw new CustomError('TemporaryBusinessHour.getTemporaryBusinessHoursForDeletion', error);
        }
    }

    /** Deletes scoped temporary rows and invalidates related cache keys. */
    public async deleteTemporaryBusinessHourFromRedis(idList: string[], idWorkspace: string): Promise<any> {
        try {
            const temporaryHoursStrategy = new TemporaryHoursStrategy();
            const allRecordsToDelete = await this.getTemporaryBusinessHoursForDeletion(idList, idWorkspace);
            const allIds = allRecordsToDelete.map((r) => r.id);
            const redisPairs = new Set<string>();
            for (const r of allRecordsToDelete) {
                redisPairs.add(`${r.idUserFk}__${r.idWorkspaceFk}`);
            }
            for (const pair of redisPairs) {
                const [idUser, idWorkspace] = pair.split('__');
                await temporaryHoursStrategy.deleteTemporaryHours(idWorkspace, idUser);
            }
            return await prisma.$transaction(async (tx) => {
                let result = { count: 0 };
                if (allIds.length > 0) {
                    result = await tx.temporaryBusinessHour.deleteMany({
                        where: {
                            id: { in: allIds },
                        },
                    });
                }

                await this.deleteTemporaryBlockEvents(allRecordsToDelete, tx);

                return result;
            });
        } catch (error: any) {
            throw new CustomError('TemporaryBusinessHour.deleteTemporaryBusinessHourFromRedis', error);
        }
    }

}
