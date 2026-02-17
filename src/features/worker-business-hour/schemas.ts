import { WeekDayType } from "@prisma/client";
import { z } from "zod";

const idSchema = z.string().trim().min(1);
const timeValueSchema = z.union([z.string().trim().min(1), z.date()]);

const workerBusinessHourBaseSchema = z.looseObject({
        id: idSchema.optional(),
        idUserFk: idSchema.optional(),
        idCompanyFk: idSchema.optional(),
        idWorkspaceFk: idSchema.optional(),
        weekDayType: z.nativeEnum(WeekDayType).optional(),
        startTime: timeValueSchema.nullable().optional(),
        endTime: timeValueSchema.nullable().optional(),
        closed: z.boolean().optional(),
    });

export const addWorkerBusinessHourSchema = workerBusinessHourBaseSchema.extend({
    idUserFk: idSchema,
    idCompanyFk: idSchema,
    idWorkspaceFk: idSchema,
    weekDayType: z.nativeEnum(WeekDayType),
});

export const updateWorkerBusinessHourSchema = workerBusinessHourBaseSchema;

export const getWorkerBusinessHoursSchema = z.looseObject({
        pagination: z.any().optional(),
    });

export const workerBusinessHourIdParamsSchema = z.object({
    id: idSchema,
});

export const workerBusinessHourWeekDayParamsSchema = z.object({
    weekDayType: z.nativeEnum(WeekDayType),
});

export const workerBusinessHourByWorkerAndWorkspaceParamsSchema = z.object({
    idWorker: idSchema,
    idWorkspace: idSchema,
});

export const deleteWorkerBusinessHourSchema = z.looseObject({
        idList: z.union([idSchema, z.array(idSchema).min(1)]),
    });

export const workerHoursRedisSchema = z.looseObject({
        idUserList: z.array(idSchema).min(1),
        idWorkspace: idSchema,
    });
