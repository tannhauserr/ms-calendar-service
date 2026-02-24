import express from "express";

import { WorkerBusinessHourController } from "./controllers/worker-business-hour.controller";
import { BusinessHourMiddleware } from "../../middlewares/business-hour/business-hour.middleware";
import { OnlyAdminMiddleware } from "../../middlewares/only-admin.middleware";
import { JWTService } from "../../services/jwt/jwt.service";
import { validateBody, validateParams } from "../../middlewares/validate-zod.middleware";
import {
    addWorkerBusinessHourSchema,
    deleteWorkerBusinessHourSchema,
    getWorkerBusinessHoursSchema,
    updateWorkerBusinessHourSchema,
    workerBusinessHourByWorkerAndWorkspaceParamsSchema,
    workerBusinessHourIdParamsSchema,
    workerBusinessHourWeekDayParamsSchema,
    workerHoursRedisSchema,
} from "./schemas";

const router = express.Router();
const controller = new WorkerBusinessHourController();

router.post(
    "/worker-business-hours/add",
    [
        JWTService.authCookieOrBearer,
        OnlyAdminMiddleware.accessOnlyAdminOrManager,
        validateBody(addWorkerBusinessHourSchema),
        BusinessHourMiddleware.convertToISOTime_FirstPart,
        BusinessHourMiddleware.handleDeleteClosedRecords_SecondPart,
        BusinessHourMiddleware.preventOverlapping_ThirdPart,
    ],
    controller.add
);

router.post(
    "/worker-business-hours/search",
    JWTService.authCookieOrBearer,
    validateBody(getWorkerBusinessHoursSchema),
    controller.get
);

// router.get(
//     "/worker-business-hours/by-weekday/:weekDayType",
//     JWTService.authCookieOrBearer,
//     validateParams(workerBusinessHourWeekDayParamsSchema),
//     controller.getByWeekDay
// );
//
router.get(
    "/worker-business-hours/by-worker/:idWorker/workspace/:idWorkspace",
    JWTService.authCookieOrBearer,
    validateParams(workerBusinessHourByWorkerAndWorkspaceParamsSchema),
    controller.getByWorkerAndWorkspace
);

router.put(
    "/worker-business-hours/:id",
    [
        JWTService.authCookieOrBearer,
        OnlyAdminMiddleware.accessOnlyAdminOrManager,
        validateBody(updateWorkerBusinessHourSchema),
        BusinessHourMiddleware.convertToISOTime_FirstPart,
        BusinessHourMiddleware.handleDeleteClosedRecords_SecondPart,
        BusinessHourMiddleware.preventOverlapping_ThirdPart,
    ],
    controller.update
);

router.delete(
    "/worker-business-hours",
    [
        JWTService.authCookieOrBearer,
        OnlyAdminMiddleware.accessOnlyAdminOrManager,
        validateBody(deleteWorkerBusinessHourSchema),
        BusinessHourMiddleware.convertToISOTime_FirstPart,
        BusinessHourMiddleware.handleDeleteClosedRecords_SecondPart,
        BusinessHourMiddleware.preventOverlapping_ThirdPart,
    ],
    controller.delete
);

router.post(
    "/worker-business-hours/r-worker-business-hours",
    [
        JWTService.authCookieOrBearer,
        OnlyAdminMiddleware.accessOnlyAdminOrManagerOrUser,
        validateBody(workerHoursRedisSchema),
    ],
    controller.getWorkerHoursFromRedis
);
//
// router.get(
//     "/worker-business-hours/:id",
//     JWTService.authCookieOrBearer,
//     validateParams(workerBusinessHourIdParamsSchema),
//     controller.getById
// );

export default router;
