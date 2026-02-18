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

export type AddWorkerAbsenceDto = z.infer<typeof addWorkerAbsenceSchema>;
export type UpdateWorkerAbsenceDto = z.infer<typeof updateWorkerAbsenceSchema>;
export type GetWorkerAbsenceListDto = z.infer<typeof getWorkerAbsenceListSchema>;
export type GetWorkerAbsenceByWorkspaceDto = z.infer<typeof getWorkerAbsenceByWorkspaceSchema>;
export type GetWorkerAbsenceByUserDto = z.infer<typeof getWorkerAbsenceByUserSchema>;
export type DeleteWorkerAbsenceDto = z.infer<typeof deleteWorkerAbsenceSchema>;
export type WorkerAbsenceIdParamsDto = z.infer<typeof workerAbsenceIdParamsSchema>;
