import { z } from "zod";
import {
    addWorkerBusinessHourSchema,
    deleteWorkerBusinessHourSchema,
    getWorkerBusinessHoursSchema,
    updateWorkerBusinessHourSchema,
    workerBusinessHourByWorkerAndWorkspaceParamsSchema,
    workerBusinessHourIdParamsSchema,
    workerBusinessHourWeekDayParamsSchema,
    workerHoursRedisSchema,
} from "../schemas";

export interface AddWorkerBusinessHourDto extends z.infer<typeof addWorkerBusinessHourSchema> {}
export interface UpdateWorkerBusinessHourDto extends z.infer<typeof updateWorkerBusinessHourSchema> {}
export interface GetWorkerBusinessHoursDto extends z.infer<typeof getWorkerBusinessHoursSchema> {}
export interface DeleteWorkerBusinessHourDto extends z.infer<typeof deleteWorkerBusinessHourSchema> {}
export interface WorkerHoursRedisDto extends z.infer<typeof workerHoursRedisSchema> {}
export interface WorkerBusinessHourIdParamsDto extends z.infer<typeof workerBusinessHourIdParamsSchema> {}
export interface WorkerBusinessHourWeekDayParamsDto extends z.infer<typeof workerBusinessHourWeekDayParamsSchema> {}
export interface WorkerBusinessHourByWorkerAndWorkspaceParamsDto
    extends z.infer<typeof workerBusinessHourByWorkerAndWorkspaceParamsSchema> {}
