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

export type AddWorkerBusinessHourDto = z.infer<typeof addWorkerBusinessHourSchema>;
export type UpdateWorkerBusinessHourDto = z.infer<typeof updateWorkerBusinessHourSchema>;
export type GetWorkerBusinessHoursDto = z.infer<typeof getWorkerBusinessHoursSchema>;
export type DeleteWorkerBusinessHourDto = z.infer<typeof deleteWorkerBusinessHourSchema>;
export type WorkerHoursRedisDto = z.infer<typeof workerHoursRedisSchema>;
export type WorkerBusinessHourIdParamsDto = z.infer<typeof workerBusinessHourIdParamsSchema>;
export type WorkerBusinessHourWeekDayParamsDto = z.infer<typeof workerBusinessHourWeekDayParamsSchema>;
export type WorkerBusinessHourByWorkerAndWorkspaceParamsDto = z.infer<typeof workerBusinessHourByWorkerAndWorkspaceParamsSchema>;
