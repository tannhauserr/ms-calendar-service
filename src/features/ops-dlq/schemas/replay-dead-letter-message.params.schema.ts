import { z } from "zod";

export const replayDeadLetterMessageParamsSchema = z.object({
    id: z.string().trim().min(1),
});
