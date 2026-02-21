import { z } from "zod";
import {
    addWorkerAbsenceSchema,
    deleteWorkerAbsenceSchema,
    getWorkerAbsenceByUserSchema,
    getWorkerAbsenceByWorkspaceSchema,
    getWorkerAbsenceListSchema,
    updateWorkerAbsenceSchema,
    workerAbsenceIdParamsSchema,
} from "../schemas";

export interface AddWorkerAbsenceDto extends z.infer<typeof addWorkerAbsenceSchema> {}
export interface UpdateWorkerAbsenceDto extends z.infer<typeof updateWorkerAbsenceSchema> {}
export interface GetWorkerAbsenceListDto extends z.infer<typeof getWorkerAbsenceListSchema> {}
export interface GetWorkerAbsenceByWorkspaceDto extends z.infer<typeof getWorkerAbsenceByWorkspaceSchema> {}
export interface GetWorkerAbsenceByUserDto extends z.infer<typeof getWorkerAbsenceByUserSchema> {}
export interface DeleteWorkerAbsenceDto extends z.infer<typeof deleteWorkerAbsenceSchema> {}
export interface WorkerAbsenceIdParamsDto extends z.infer<typeof workerAbsenceIdParamsSchema> {}
