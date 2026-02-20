import { z } from "zod";
import {
    MANAGE_EVENT_START_SLOTS,
    MANAGE_EVENT_STATUS_OPTIONS,
    MANAGE_EVENT_WORKERS,
} from "../utils/manage-event-options.util";

export const manageEventOptionsQuerySchema = z.object({
    worker: z.enum(Object.keys(MANAGE_EVENT_WORKERS) as [string, ...string[]]).optional(),
    startSlot: z.enum(MANAGE_EVENT_START_SLOTS as [string, ...string[]]).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    eventStatusType: z.enum(MANAGE_EVENT_STATUS_OPTIONS as [string, ...string[]]).optional(),
});
