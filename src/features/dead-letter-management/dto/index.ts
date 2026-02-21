import { z } from "zod";
import { deadLetterMessagesQuerySchema, replayDeadLetterMessageParamsSchema } from "../schemas";

export interface DeadLetterMessagesQueryDto extends z.infer<typeof deadLetterMessagesQuerySchema> {}
export interface ReplayDeadLetterMessageParamsDto extends z.infer<typeof replayDeadLetterMessageParamsSchema> {}
