import { z } from "zod";
import { idSchema } from "./common.schema";

export const markCommentAsReadBodySchema = z.looseObject({
        idEvent: idSchema,
        idWorkspace: idSchema,
    });
