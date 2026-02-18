import { z } from "zod";
import { idSchema } from "./common.schema";

export const getEventByIdParamsSchema = z.object({
    id: idSchema,
});
