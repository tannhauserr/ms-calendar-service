import { z } from "zod";

export const idSchema = z.string().trim().min(1);

export const dateOrStringSchema = z.union([
    z.string().trim().min(1),
    z.date(),
]);

const clampInt = (value: number, min: number, max: number): number => {
    return Math.min(max, Math.max(min, Math.trunc(value)));
};

const clampedPaginationNumberSchema = (min: number, max: number) =>
    z.coerce.number().transform((value) => clampInt(value, min, max)).optional();

export const paginationSchema = z.looseObject({
        page: clampedPaginationNumberSchema(1, 999),
        itemsPerPage: clampedPaginationNumberSchema(1, 1000),
        orderBy: z.looseObject({
                field: z.string().trim().min(1),
                order: z.enum(["asc", "desc"]),
            })
            .nullable()
            .optional(),
        filters: z.record(z.string(), z.unknown()).optional(),
    });
