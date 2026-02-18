import { z } from "zod";
import { idSchema, paginationSchema } from "./common.schema";

export const getEventsListBodySchema = z.looseObject({
        pagination: paginationSchema,
        idCompany: idSchema.optional(),
        idWorkspace: idSchema.optional(),
    });
