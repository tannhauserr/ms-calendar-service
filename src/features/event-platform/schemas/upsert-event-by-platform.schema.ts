import { z } from "zod";
import { dateOrStringSchema, idSchema } from "./common.schema";

export const upsertEventByPlatformBodySchema = z.looseObject({
        type: z.literal("event"),
        idCompany: idSchema,
        idWorkspace: idSchema,
        startDate: dateOrStringSchema,
        services: z.array(z.unknown()),
        clients: z.array(z.unknown()),
    });
