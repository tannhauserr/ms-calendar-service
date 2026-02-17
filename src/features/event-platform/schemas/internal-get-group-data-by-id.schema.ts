import { z } from "zod";
import { idSchema } from "./common.schema";

export const internalGetGroupDataByIdBodySchema = z.looseObject({
        idGroup: idSchema,
        idWorkspace: idSchema,
    });
