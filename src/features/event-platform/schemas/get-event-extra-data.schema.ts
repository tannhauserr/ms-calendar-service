import { z } from "zod";
import { idSchema } from "./common.schema";

export const getEventExtraDataBodySchema = z.looseObject({
        idList: z.array(idSchema).min(1),
    });

export const getEventExtraDataParamsSchema = z.object({
    idCompany: idSchema,
    idWorkspace: idSchema,
});
