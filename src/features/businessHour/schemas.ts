import { WeekDayType } from "@prisma/client";
import { z } from "zod";

const idSchema = z.string().trim().min(1);
const timeValueSchema = z.union([z.string().trim().min(1), z.date()]);

const businessHourBaseSchema = z.looseObject({
        id: idSchema.optional(),
        idCompanyFk: idSchema.optional(),
        idWorkspaceFk: idSchema.optional(),
        weekDayType: z.enum(WeekDayType).optional(),
        startTime: timeValueSchema.nullable().optional(),
        endTime: timeValueSchema.nullable().optional(),
        closed: z.boolean().optional(),
    });

export const addBusinessHourSchema = businessHourBaseSchema.extend({
    idWorkspaceFk: idSchema.optional(),
    idWorkspace: idSchema.optional(),
    weekDayType: z.enum(WeekDayType),
})
    .refine((data) => !!(data.idWorkspaceFk ?? data.idWorkspace), {
        message: "idWorkspaceFk o idWorkspace es requerido",
        path: ["idWorkspaceFk"],
    })
    .transform((data) => ({
        ...data,
        idWorkspaceFk: data.idWorkspaceFk ?? data.idWorkspace,
    }));

export const updateBusinessHourSchema = businessHourBaseSchema;

export const getBusinessHoursSchema = z.looseObject({
        idWorkspace: idSchema,
    });

export const getBusinessHoursQuerySchema = z.looseObject({
        idWorkspace: idSchema,
    });

export const businessHourIdParamsSchema = z.object({
    id: idSchema,
});

export const businessHourWeekDayParamsSchema = z.object({
    weekDayType: z.nativeEnum(WeekDayType),
});

export const deleteBusinessHourSchema = z.looseObject({
        idList: z.union([idSchema, z.array(idSchema).min(1)]),
    });

export const businessHoursRedisSchema = z.looseObject({
        idCompany: idSchema,
        idWorkspace: idSchema,
    });

export const businessHoursRedisQuerySchema = z.looseObject({
        idCompany: idSchema,
        idWorkspace: idSchema,
    });
