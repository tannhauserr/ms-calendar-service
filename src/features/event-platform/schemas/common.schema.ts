import { z } from "zod";

export const idSchema = z.string().trim().min(1);

export const dateOrStringSchema = z.union([
    z.string().trim().min(1),
    z.date(),
]);

export const paginationSchema = z.looseObject({
        page: z.coerce.number().int().positive().optional(),
        itemsPerPage: z.coerce.number().int().positive().optional(),
        orderBy: z.looseObject({
                field: z.string().trim().min(1),
                order: z.enum(["asc", "desc"]),
            })
            .nullable()
            .optional(),
        filters: z.record(z.string(), z.unknown()).optional(),
    });
