import { z } from "zod";

export const deadLetterMessagesQuerySchema = z.object({
    page: z.coerce.number().int().positive().max(500).optional(),
    itemsPerPage: z.coerce.number().int().positive().max(100).optional(),
    status: z.enum(["PENDING", "REPLAYED", "REPLAY_FAILED"]).optional(),
    consumerName: z.string().trim().min(1).max(120).optional(),
});
