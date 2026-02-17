import { z } from "zod";

const idSchema = z.string().trim().min(1);
const dateSchema = z.union([z.string().trim().min(1), z.date()]);
const timeSchema = z.union([z.string().trim().min(1), z.date()]);

const temporaryBusinessHourBaseSchema = z.looseObject({
        id: idSchema.optional(),
        idCompanyFk: idSchema.optional(),
        idWorkspaceFk: idSchema.optional(),
        idUserFk: idSchema.optional(),
        idEventFk: idSchema.optional(),
        title: z.string().max(120).optional(),
        description: z.string().max(256).optional(),
        date: dateSchema.optional(),
        startTime: timeSchema.nullable().optional(),
        endTime: timeSchema.nullable().optional(),
        closed: z.boolean().optional(),
    });

export const addTemporaryBusinessHourSchema = temporaryBusinessHourBaseSchema.extend({
    idCompanyFk: idSchema,
    idWorkspaceFk: idSchema,
    date: dateSchema,
});

export const updateTemporaryBusinessHourSchema = temporaryBusinessHourBaseSchema;

export const getTemporaryBusinessHoursSchema = z.looseObject({
        pagination: z.any().optional(),
    });

export const temporaryBusinessHourIdParamsSchema = z.object({
    id: idSchema,
});

export const temporaryBusinessHourByDateSchema = z.looseObject({
        date: dateSchema,
    });

export const temporaryBusinessHourByDateQuerySchema = z.looseObject({
        date: z.string().trim().min(1),
    });

export const temporaryBusinessHourByWorkerAndDateSchema = z.looseObject({
        idWorker: idSchema,
        date: dateSchema,
    });

export const temporaryBusinessHourByWorkerAndDateQuerySchema = z.looseObject({
        idWorker: idSchema,
        date: z.string().trim().min(1),
    });

export const temporaryBusinessHourWorkerExceptionSchema = z.looseObject({
        idWorker: idSchema,
        minDate: dateSchema.optional(),
        maxDate: dateSchema.optional(),
    });

export const deleteTemporaryBusinessHourSchema = z.looseObject({
        idList: z.union([idSchema, z.array(idSchema).min(1)]),
        idWorkspace: idSchema,
    });

export const temporaryBusinessHourAutocompleteSchema = z.looseObject({
        idUser: idSchema.optional(),
    });

export const temporaryHoursRedisSchema = z.looseObject({
        idUserList: z.array(idSchema).min(1),
        idWorkspace: idSchema,
    });
