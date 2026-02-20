import { z } from "zod";
import { deadLetterMessagesQuerySchema, replayDeadLetterMessageParamsSchema } from "../schemas";

export type DeadLetterMessagesQueryDto = z.infer<typeof deadLetterMessagesQuerySchema>;
export type ReplayDeadLetterMessageParamsDto = z.infer<typeof replayDeadLetterMessageParamsSchema>;
