import express from "express";

import { WorkerAbsenceController } from "./controllers/worker-absence.controller";
import { OnlyAdminMiddleware } from "../../middlewares/only-admin.middleware";
import { WorkerAbsenceMiddleware } from "../../middlewares/worker-absence/worker-absence.middleware";
import { JWTService } from "../../services/jwt/jwt.service";
import { validateBody, validateParams } from "../../middlewares/validate-zod.middleware";
import {
    addWorkerAbsenceSchema,
    deleteWorkerAbsenceSchema,
    getWorkerAbsenceByUserSchema,
    getWorkerAbsenceByWorkspaceSchema,
    getWorkerAbsenceListSchema,
    updateWorkerAbsenceSchema,
    workerAbsenceIdParamsSchema,
} from "./schemas";

const router = express.Router();
const controller = new WorkerAbsenceController();

router.post(
    "/worker-absences",
    JWTService.authCookieOrBearer,
    OnlyAdminMiddleware.allowRoles(["ROLE_OWNER", "ROLE_ADMIN", "ROLE_MANAGER"]),
    OnlyAdminMiddleware.accessAuthorized,
    validateBody(getWorkerAbsenceListSchema),
    controller.get
);

router.post(
    "/worker-absences/add",
    [
        JWTService.authCookieOrBearer,
        OnlyAdminMiddleware.accessOnlyAdminOrManager,
        validateBody(addWorkerAbsenceSchema),
        WorkerAbsenceMiddleware.cleanExceptionDate,
    ],
    controller.add
);

router.get(
    "/worker-absences-:id",
    [
        JWTService.authCookieOrBearer,
        OnlyAdminMiddleware.accessOnlyAdminOrManager,
        validateParams(workerAbsenceIdParamsSchema),
    ],
    controller.getById
);

router.post(
    "/worker-absences/by-workspace",
    JWTService.authCookieOrBearer,
    OnlyAdminMiddleware.accessOnlyAdminOrManager,
    validateBody(getWorkerAbsenceByWorkspaceSchema),
    controller.getByWorkspace
);

router.post(
    "/worker-absences/by-user",
    [
        JWTService.authCookieOrBearer,
        OnlyAdminMiddleware.accessOnlyAdminOrManager,
        validateBody(getWorkerAbsenceByUserSchema),
    ],
    controller.getByUser
);

router.post(
    "/worker-absences/update-:id",
    [
        JWTService.authCookieOrBearer,
        OnlyAdminMiddleware.accessOnlyAdminOrManager,
        validateBody(updateWorkerAbsenceSchema),
        WorkerAbsenceMiddleware.cleanExceptionDate,
    ],
    controller.update
);

router.post(
    "/worker-absences/delete-definitive",
    [
        JWTService.authCookieOrBearer,
        OnlyAdminMiddleware.accessOnlyAdminOrManager,
        validateBody(deleteWorkerAbsenceSchema),
    ],
    controller.delete
);

export default router;
