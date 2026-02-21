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

export interface AddTemporaryBusinessHourDto extends z.infer<typeof addTemporaryBusinessHourSchema> {}
export interface UpdateTemporaryBusinessHourDto extends z.infer<typeof updateTemporaryBusinessHourSchema> {}
export interface GetTemporaryBusinessHoursDto extends z.infer<typeof getTemporaryBusinessHoursSchema> {}
export interface TemporaryBusinessHourByDateDto extends z.infer<typeof temporaryBusinessHourByDateSchema> {}
export interface TemporaryBusinessHourByDateQueryDto extends z.infer<typeof temporaryBusinessHourByDateQuerySchema> {}
export interface TemporaryBusinessHourByWorkerAndDateDto extends z.infer<typeof temporaryBusinessHourByWorkerAndDateSchema> {}
export interface TemporaryBusinessHourByWorkerAndDateQueryDto
    extends z.infer<typeof temporaryBusinessHourByWorkerAndDateQuerySchema> {}
export interface TemporaryBusinessHourWorkerExceptionDto
    extends z.infer<typeof temporaryBusinessHourWorkerExceptionSchema> {}
export interface DeleteTemporaryBusinessHourDto extends z.infer<typeof deleteTemporaryBusinessHourSchema> {}
export interface TemporaryBusinessHourAutocompleteDto extends z.infer<typeof temporaryBusinessHourAutocompleteSchema> {}
export interface TemporaryHoursRedisDto extends z.infer<typeof temporaryHoursRedisSchema> {}
export interface TemporaryBusinessHourIdParamsDto extends z.infer<typeof temporaryBusinessHourIdParamsSchema> {}
