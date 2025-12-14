import { Prisma, TemporaryBusinessHour, WeekDayType, $Enums } from "@prisma/client";
import prisma from "../../../../lib/prisma";
import CustomError from "../../../../models/custom-error/CustomError";
import { Pagination } from "../../../../models/pagination";
import { getGeneric } from "../../../../utils/get-genetic/getGenetic";
import moment from "moment";
import { TemporaryHoursMapType } from "../../../../models/interfaces/temporary-business-hours-type";
import { TemporaryHoursStrategy } from "../../../@redis/cache/strategies/temporaryHours/temporaryHours.strategy";
import { TIME_SECONDS } from "../../../../constant/time";
import { HoursRangeInput, normalizeRange, isWithin, listDaysInclusive } from "../interfaces";

export class TemporaryBusinessHourService {
    constructor() { }

    async addTemporaryBusinessHour(item: Prisma.TemporaryBusinessHourCreateInput): Promise<TemporaryBusinessHour> {
        try {
            // Elimina la propiedad 'id' si viene en el objeto
            const { id, ...dataWithoutId } = item as any;

            console.log("que voy a agregar?", dataWithoutId);

            return await prisma.temporaryBusinessHour.create({
                data: {
                    ...dataWithoutId,
                    createdDate: new Date(),
                    updatedDate: new Date(),
                },
            });
        } catch (error: any) {
            throw new CustomError('TemporaryBusinessHour.addTemporaryBusinessHour', error);
        }
    }

    async getTemporaryBusinessHourById(id: string): Promise<TemporaryBusinessHour | null> {
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
                    idWorkspaceFk: true,
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
                    idWorkspaceFk: true,
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
        id: string;
        idUserFk: string;
        date: Date;
        closed: boolean;
        startTime: string;
        endTime: string;
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

            console.log("el item entrante en updateTemporaryBusinessHour", item);
            // Convertimos el ID a string para usarlo en el where
            const id = String(item.id);
            delete item.id;

            return await prisma.temporaryBusinessHour.update({
                where: { id },
                data: {
                    ...item,
                    updatedDate: new Date(),
                },
            });
        } catch (error: any) {
            throw new CustomError('TemporaryBusinessHour.updateTemporaryBusinessHour', error);
        }
    }

    async deleteTemporaryBusinessHour(idList: string[]): Promise<any> {
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
                idWorkspaceFk: true,
            };

            const result = await getGeneric(pagination, "temporaryBusinessHour", select);
            return result;
        } catch (error: any) {
            throw new CustomError('TemporaryBusinessHour.getTemporaryTemporaryBusinessHours', error);
        }
    }





    // async getTemporaryBusinessHours2(pagination: Pagination): Promise<any> {
    //     try {
    //         const skip = (pagination.page - 1) * pagination.itemsPerPage;
    //         const take = pagination.itemsPerPage;
    //         const idUserFk = pagination.filters?.idUserFk?.value;
    //         const idWorkspaceFk = pagination.filters?.idWorkspaceFk?.value;

    //         let groups: any[] = [];
    //         let countResult: any;

    //         if (idUserFk) {
    //             groups = await prisma.$queryRaw`
    //     SELECT
    //       MIN("id") AS "id",
    //       "idUserFk",
    //       DATE("date") AS "day",
    //       bool_or("closed") AS closed,
    //       json_agg(
    //         json_build_object(
    //           'id', "id",
    //           'startTime',
    //             CASE 
    //               WHEN coalesce(trim("startTime"), '') <> '' 
    //               THEN to_char("date", 'YYYY-MM-DD') || 'T' || "startTime"
    //               ELSE NULL
    //             END,
    //           'endTime',
    //             CASE 
    //               WHEN coalesce(trim("endTime"), '') <> '' 
    //               THEN to_char("date", 'YYYY-MM-DD') || 'T' || "endTime"
    //               ELSE NULL
    //             END,
    //           'closed', "closed"
    //         ) ORDER BY "startTime"
    //       ) AS times
    //     FROM "temporaryBusinessHours"
    //     WHERE "idUserFk" = ${idUserFk}
    //     ${idWorkspaceFk ? Prisma.sql`AND "idWorkspaceFk" = ${idWorkspaceFk}` : Prisma.empty}
    //     GROUP BY "idUserFk", DATE("date")
    //     ORDER BY DATE("date") DESC
    //     LIMIT ${take} OFFSET ${skip}
    //   `;

    //             countResult = await prisma.$queryRaw`
    //     SELECT COUNT(*) AS count FROM (
    //       SELECT "idUserFk", DATE("date") AS "day"
    //       FROM "temporaryBusinessHours"
    //       WHERE "idUserFk" = ${idUserFk}
    //       ${idWorkspaceFk ? Prisma.sql`AND "idWorkspaceFk" = ${idWorkspaceFk}` : Prisma.empty}
    //       GROUP BY "idUserFk", DATE("date")
    //     ) AS sub
    //   `;
    //         } else {
    //             groups = await prisma.$queryRaw`
    //     SELECT
    //       MIN("id") AS "id",
    //       "idUserFk",
    //       "idWorkspaceFk",
    //       DATE("date") AS "day",
    //       bool_or("closed") AS closed,
    //       json_agg(
    //         json_build_object(
    //           'id', "id",
    //           'startTime',
    //             CASE 
    //               WHEN coalesce(trim("startTime"), '') <> '' 
    //               THEN to_char("date", 'YYYY-MM-DD') || 'T' || "startTime"
    //               ELSE NULL
    //             END,
    //           'endTime',
    //             CASE 
    //               WHEN coalesce(trim("endTime"), '') <> '' 
    //               THEN to_char("date", 'YYYY-MM-DD') || 'T' || "endTime"
    //               ELSE NULL
    //             END,
    //           'closed', "closed"
    //         ) ORDER BY "startTime"
    //       ) AS times
    //     FROM "temporaryBusinessHours"
    //     GROUP BY "idUserFk", DATE("date"), "idWorkspaceFk"
    //     ORDER BY DATE("date") DESC
    //     LIMIT ${take} OFFSET ${skip}
    //   `;

    //             countResult = await prisma.$queryRaw`
    //     SELECT COUNT(*) AS count FROM (
    //       SELECT "idUserFk", DATE("date") AS "day", "idWorkspaceFk"
    //       FROM "temporaryBusinessHours"
    //       GROUP BY "idUserFk", DATE("date"), "idWorkspaceFk"
    //     ) AS sub
    //   `;
    //         }

    //         const totalGroups = parseInt(countResult[0].count, 10);

    //         return {
    //             rows: groups,
    //             pagination: {
    //                 totalItems: totalGroups,
    //                 totalPages: Math.ceil(totalGroups / pagination.itemsPerPage),
    //             },
    //         };
    //     } catch (error: any) {
    //         throw new CustomError('TemporaryBusinessHour.getTemporaryBusinessHoursGrouped', error);
    //     }
    // }


    async getTemporaryBusinessHours2(pagination: Pagination): Promise<any> {
        try {
            const skip = (pagination.page - 1) * pagination.itemsPerPage;
            const take = pagination.itemsPerPage;
            const idUserFk = pagination.filters?.idUserFk?.value;
            const idWorkspaceFk = pagination.filters?.idWorkspaceFk?.value;

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
                    totalPages: Math.ceil(totalGroups / pagination.itemsPerPage),
                },
            };
        } catch (error: any) {
            throw new CustomError('TemporaryBusinessHour.getTemporaryBusinessHoursGrouped', error);
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



    async checkOverlappingTemporaryBusinessHour(startTime: Date, endTime: Date, idUserFk: string, idWorkspaceFk: string, date: Date, id: any = undefined): Promise<boolean> {
        try {
            // Obtener el inicio y fin del día para la fecha proporcionada
            const startDate = moment(date).startOf('day').toDate();
            const endDate = moment(date).endOf('day').toDate();

            // console.log("entro a overlapping start", startTime);
            // console.log("entro a overlapping end", endTime);

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

            // Buscar si hay horarios temporales superpuestos para el trabajador en la misma fecha
            const overlappingHours = await prisma.temporaryBusinessHour.findFirst({
                where: whereClause,
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
     * @param idWorkspace 
     * @returns 
     */
    // getTemporaryHoursFromRedis = async (
    //     userIds: string[],
    //     idWorkspace: string
    // ): Promise<TemporaryHoursMapType> => {
    //     const temporaryHoursMap: TemporaryHoursMapType = {};
    //     const temporaryHoursStrategy = new TemporaryHoursStrategy();

    //     for (const userId of userIds) {
    //         // 1) Redis
    //         let temporaryHours = await temporaryHoursStrategy.getTemporaryHours(idWorkspace, userId);

    //         if (temporaryHours) {
    //             // console.log(`Horarios temporales del usuario ${userId} obtenidos de Redis`);
    //             temporaryHoursMap[userId] = temporaryHours;
    //             continue;
    //         }

    //         // 2) DB
    //         const records = await prisma.temporaryBusinessHour.findMany({
    //             where: {
    //                 idWorkspaceFk: idWorkspace,
    //                 idUserFk: userId,
    //                 deletedDate: null,
    //             },
    //         });
    //         // console.log("id workspace y userId", idWorkspace, userId);
    //         // console.log("mira records", records);

    //         // ⚡ Inicializar vacío siempre
    //         const userTemporaryHours: { [date: string]: string[][] | null } = {};

    //         for (const record of records) {
    //             const dateStr = moment(record.date).format("YYYY-MM-DD");

    //             if (record?.closed) {
    //                 userTemporaryHours[dateStr] = null;
    //                 continue;
    //             }

    //             if (!record.startTime || !record.endTime) continue;

    //             const startTime = record.startTime as unknown as string;
    //             const endTime = record.endTime as unknown as string;

    //             if (!userTemporaryHours[dateStr]) {
    //                 userTemporaryHours[dateStr] = [];
    //             }

    //             (userTemporaryHours[dateStr] as string[][]).push([startTime, endTime]);
    //         }

    //         // ⚡ Si no había nada en DB → guardar al menos {}
    //         temporaryHoursMap[userId] = userTemporaryHours;

    //         // Guardar en Redis aunque esté vacío
    //         await temporaryHoursStrategy.saveTemporaryHours(
    //             idWorkspace,
    //             userId,
    //             userTemporaryHours,
    //             TIME_SECONDS.HOUR
    //         );
    //     }

    //     return temporaryHoursMap;
    // };


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
                // 1) Leer cache maestra
                const cached =
                    (await temporaryHoursStrategy.getTemporaryHours(idWorkspace, userId)) || {};
                const covered = new Set(Object.keys(cached));
                const missingDays = wantedDays.filter((d) => !covered.has(d));

                // ⭐  Muta en lugar de copiar, para menos GC
                const merged: { [date: string]: string[][] | null } = { ...cached };

                if (missingDays.length > 0) {
                    // 2) DB SOLO lo que falta
                    let records: any[] = [];

                    // ⭐ cambio: según nº de días faltantes decides BETWEEN vs IN
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

                    // 3) Construir patch
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

                    // 4) MERGE solo si hay cambios
                    if (Object.keys(patch).length > 0) {   // ⭐ evitar save innecesario
                        for (const [k, v] of Object.entries(patch)) {
                            merged[k] = v; // muta directamente
                        }

                        await temporaryHoursStrategy.saveTemporaryHours(
                            idWorkspace,
                            userId,
                            merged,
                            TIME_SECONDS.HOUR
                        );
                    }
                }

                // 5) Devolver SOLO el rango
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




    /**
     * Elimina registros de TemporaryBusinessHour y, antes de ello,
     * limpia la información en Redis para cada par (idWorkspace, idUser).
     */
    // public async deleteTemporaryBusinessHourFromRedis(idList: string[]): Promise<any> {
    //     try {
    //         const temporaryHoursStrategy = new TemporaryHoursStrategy();

    //         // Aseguramos que sea un array
    //         const listAux = Array.isArray(idList) ? idList : [idList];

    //         // 1) Buscar en la BD los idUserFk, idWorkspaceFk de esos IDs
    //         const records = await prisma.temporaryBusinessHour.findMany({
    //             where: {
    //                 id: { in: listAux },
    //             },
    //             select: {
    //                 idUserFk: true,
    //                 idWorkspaceFk: true,
    //             },
    //         });

    //         // 2) Construir un set de pares únicos (idUserFk, idWorkspaceFk)
    //         const uniquePairs = new Set<string>();
    //         for (const r of records) {
    //             // Creamos una "clave" para no duplicar pares
    //             const key = `${r.idUserFk}__${r.idWorkspaceFk}`;
    //             uniquePairs.add(key);
    //         }

    //         // 3) Por cada par, llamamos a la estrategia que borra en Redis
    //         for (const key of uniquePairs) {
    //             const [idUser, idWorkspace] = key.split('__');
    //             await temporaryHoursStrategy.deleteTemporaryHours(idWorkspace, idUser);
    //         }

    //         // 4) Finalmente, borramos los registros en la BD
    //         return await prisma.temporaryBusinessHour.deleteMany({
    //             where: {
    //                 id: { in: listAux },
    //             },
    //         });
    //     } catch (error: any) {
    //         throw new CustomError('TemporaryBusinessHour.deleteTemporaryBusinessHour', error);
    //     }
    // }


    /**
     * Elimina de Redis y de la BD todos los registros que tengan el mismo día y usuario
     * que alguno de los IDs indicados en `idList`.
     */
    public async deleteTemporaryBusinessHourFromRedis(idList: string[], idWorkspace: string): Promise<any> {
        try {
            const temporaryHoursStrategy = new TemporaryHoursStrategy();
            const listAux = Array.isArray(idList) ? idList : [idList];

            // 1) Buscar en la BD los (idUserFk, idWorkspaceFk, date) de cada ID
            const baseRecords = await prisma.temporaryBusinessHour.findMany({
                where: {
                    id: { in: listAux },
                    idWorkspaceFk: idWorkspace,
                },
                select: {
                    idUserFk: true,
                    idWorkspaceFk: true,
                    date: true, // Ojo: si es un DateTime con hora distinta de 00:00
                },
            });

            // 2) Construir un array de condiciones "OR" con rango de fechas
            //    para que coincida con todos los registros del mismo día
            const orConditions = [];
            for (const r of baseRecords) {
                // Tomamos la "medianoche" de la fecha, ignorando la hora
                // Ojo a la zona horaria: si quieres UTC puro, usa .utc()
                const dayStart = moment(r.date).startOf('day').toDate();
                const dayEnd = moment(dayStart).add(1, 'day').toDate();

                orConditions.push({
                    idUserFk: r.idUserFk,
                    idWorkspace: r.idWorkspaceFk,
                    dateRangeStart: dayStart,
                    dateRangeEnd: dayEnd,
                });
            }

            // 3) Buscar TODOS los registros que coincidan en ese día (rango)
            let allRecordsToDelete = [];
            if (orConditions.length > 0) {
                // Construimos un OR de rangos
                allRecordsToDelete = await prisma.temporaryBusinessHour.findMany({
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
                    select: {
                        id: true,
                        idUserFk: true,
                        idWorkspaceFk: true,
                    },
                });
            }

            // IDs definitivos a eliminar
            const allIds = allRecordsToDelete.map((r) => r.id);

            // 4) Armar set de (idUserFk, idWorkspaceFk) para Redis
            const redisPairs = new Set<string>();
            for (const r of allRecordsToDelete) {
                redisPairs.add(`${r.idUserFk}__${r.idWorkspaceFk}`);
            }

            // 5) Eliminar en Redis
            for (const pair of redisPairs) {
                const [idUser, idWorkspace] = pair.split('__');
                await temporaryHoursStrategy.deleteTemporaryHours(idWorkspace, idUser);
            }

            // 6) Borrar en la BD
            if (allIds.length > 0) {
                return await prisma.temporaryBusinessHour.deleteMany({
                    where: {
                        id: { in: allIds },
                    },
                });
            } else {
                return { count: 0 };
            }
        } catch (error: any) {
            throw new CustomError('TemporaryBusinessHour.deleteTemporaryBusinessHourFromRedis', error);
        }
    }

}
