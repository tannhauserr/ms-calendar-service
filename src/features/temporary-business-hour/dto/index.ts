import { z } from "zod";
import {
    addTemporaryBusinessHourSchema,
    deleteTemporaryBusinessHourSchema,
    getTemporaryBusinessHoursSchema,
    temporaryBusinessHourAutocompleteSchema,
    temporaryBusinessHourByDateQuerySchema,
    temporaryBusinessHourByDateSchema,
    temporaryBusinessHourByWorkerAndDateQuerySchema,
    temporaryBusinessHourByWorkerAndDateSchema,
    temporaryBusinessHourIdParamsSchema,
    temporaryBusinessHourWorkerExceptionSchema,
    temporaryHoursRedisSchema,
    updateTemporaryBusinessHourSchema,
} from "../schemas";

export type AddTemporaryBusinessHourDto = z.infer<typeof addTemporaryBusinessHourSchema>;
export type UpdateTemporaryBusinessHourDto = z.infer<typeof updateTemporaryBusinessHourSchema>;
export type GetTemporaryBusinessHoursDto = z.infer<typeof getTemporaryBusinessHoursSchema>;
export type TemporaryBusinessHourByDateDto = z.infer<typeof temporaryBusinessHourByDateSchema>;
export type TemporaryBusinessHourByDateQueryDto = z.infer<typeof temporaryBusinessHourByDateQuerySchema>;
export type TemporaryBusinessHourByWorkerAndDateDto = z.infer<typeof temporaryBusinessHourByWorkerAndDateSchema>;
export type TemporaryBusinessHourByWorkerAndDateQueryDto = z.infer<typeof temporaryBusinessHourByWorkerAndDateQuerySchema>;
export type TemporaryBusinessHourWorkerExceptionDto = z.infer<typeof temporaryBusinessHourWorkerExceptionSchema>;
export type DeleteTemporaryBusinessHourDto = z.infer<typeof deleteTemporaryBusinessHourSchema>;
export type TemporaryBusinessHourAutocompleteDto = z.infer<typeof temporaryBusinessHourAutocompleteSchema>;
export type TemporaryHoursRedisDto = z.infer<typeof temporaryHoursRedisSchema>;
export type TemporaryBusinessHourIdParamsDto = z.infer<typeof temporaryBusinessHourIdParamsSchema>;
