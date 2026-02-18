import { z } from "zod";
import { idSchema } from "./common.schema";

const idListSchema = z
    .union([idSchema, z.array(idSchema).min(1)])
    .transform((value) => (Array.isArray(value) ? value : [value]));

export const deleteEventBodySchema = z.looseObject({
        idList: idListSchema,
    });
