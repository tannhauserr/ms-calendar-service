import { z } from "zod";
import { paginationSchema } from "./common.schema";

export const getEventsBodySchema = z.looseObject({
        pagination: paginationSchema,
    });
