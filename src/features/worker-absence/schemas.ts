import { EventPurposeType } from "@prisma/client";
import { z } from "zod";

const idSchema = z.string().trim().min(1);
const dateSchema = z.union([z.string().trim().min(1), z.date()]);

const workerAbsenceBaseSchema = z.looseObject({
        id: idSchema.optional(),
        idEventFk: idSchema.optional(),
        idUserFk: idSchema.optional(),
        idCompanyFk: idSchema.optional(),
        idWorkspaceFk: idSchema.optional(),
        title: z.string().max(120).optional(),
        description: z.string().max(256).optional(),
        startDate: dateSchema.optional(),
        endDate: dateSchema.optional(),
        eventPurposeType: z.nativeEnum(EventPurposeType).optional(),
    });

export const addWorkerAbsenceSchema = workerAbsenceBaseSchema.extend({
    idUserFk: idSchema,
    idCompanyFk: idSchema,
    idWorkspaceFk: idSchema,
    startDate: dateSchema,
    endDate: dateSchema,
});

export const updateWorkerAbsenceSchema = workerAbsenceBaseSchema
    .extend({
        idUserFk: idSchema,
        startDate: dateSchema,
        endDate: dateSchema,
    })
    .refine((value) => Boolean(value.id || value.idEventFk), {
        message: "Debe enviar id o idEventFk",
        path: ["id"],
    });

export const getWorkerAbsenceListSchema = z.looseObject({
        pagination: z.any().optional(),
    });

export const workerAbsenceIdParamsSchema = z.object({
    id: idSchema,
});

export const getWorkerAbsenceByWorkspaceSchema = z.looseObject({
        idWorkspace: idSchema,
    });

export const getWorkerAbsenceByUserSchema = z.looseObject({
        idUser: idSchema,
    });

export const deleteWorkerAbsenceSchema = z.looseObject({
        idList: z.union([idSchema, z.array(idSchema).min(1)]),
    });
