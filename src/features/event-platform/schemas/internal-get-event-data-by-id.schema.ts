import { z } from "zod";
import { idSchema } from "./common.schema";

export const internalGetEventDataByIdBodySchema = z.looseObject({
        id: idSchema,
        idWorkspace: idSchema,
    });
