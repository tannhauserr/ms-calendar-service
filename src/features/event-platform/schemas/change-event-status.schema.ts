import { EventStatusType } from "@prisma/client";
import { z } from "zod";
import { idSchema } from "./common.schema";

export const changeEventStatusBodySchema = z.looseObject({
        id: idSchema,
        status: z.nativeEnum(EventStatusType),
        allGroup: z.boolean().optional(),
    });
