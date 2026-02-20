import express from "express";

import { TemporaryBusinessHourController } from "./controllers/temporary-business-hour.controller";
import { OnlyAdminMiddleware } from "../../middlewares/only-admin.middleware";
import { JWTService } from "../../services/jwt/jwt.service";
import { validateBody, validateParams } from "../../middlewares/validate-zod.middleware";
import {
    addTemporaryBusinessHourSchema,
    deleteTemporaryBusinessHourSchema,
    getTemporaryBusinessHoursSchema,
    temporaryBusinessHourAutocompleteSchema,
    temporaryBusinessHourByDateSchema,
    temporaryBusinessHourByWorkerAndDateSchema,
    temporaryBusinessHourIdParamsSchema,
    temporaryBusinessHourWorkerExceptionSchema,
    temporaryHoursRedisSchema,
    updateTemporaryBusinessHourSchema,
} from "./schemas";

const router = express.Router();
const controller = new TemporaryBusinessHourController();

router.post(
    "/temporary-business-hours/add",
    [
        JWTService.authCookieOrBearer,
        OnlyAdminMiddleware.accessOnlyAdminOrManager,
        validateBody(addTemporaryBusinessHourSchema),
    ],
    controller.add
);

router.post(
    "/temporary-business-hours/search",
    JWTService.authCookieOrBearer,
    validateBody(getTemporaryBusinessHoursSchema),
    controller.get
);

// Fuera de alcance (scope schedules actual):
// router.post(
//     "/temporary-business-hours/by-date",
//     JWTService.authCookieOrBearer,
//     validateBody(temporaryBusinessHourByDateSchema),
//     controller.getByDate
// );
//
// router.post(
//     "/temporary-business-hours/by-worker-and-date",
//     JWTService.authCookieOrBearer,
//     validateBody(temporaryBusinessHourByWorkerAndDateSchema),
//     controller.getByWorkerAndDate
// );
//
// router.post(
//     "/temporary-business-hours/exception/by-worker-and-date-exception",
//     JWTService.authCookieOrBearer,
//     validateBody(temporaryBusinessHourWorkerExceptionSchema),
//     controller.getDistinctDatesWithExceptionsByWorker
// );
//
// router.post(
//     "/temporary-business-hours/r-temporary-business",
//     JWTService.authCookieOrBearer,
//     validateBody(temporaryHoursRedisSchema),
//     controller.getTemporaryHoursFromRedis
// );

router.put(
    "/temporary-business-hours/:id",
    [
        JWTService.authCookieOrBearer,
        OnlyAdminMiddleware.accessOnlyAdminOrManager,
        validateBody(updateTemporaryBusinessHourSchema),
    ],
    controller.update
);

router.delete(
    "/temporary-business-hours",
    [
        JWTService.authCookieOrBearer,
        OnlyAdminMiddleware.accessOnlyAdminOrManager,
        validateBody(deleteTemporaryBusinessHourSchema),
    ],
    controller.delete
);

// Fuera de alcance (scope schedules actual):
// router.post(
//     "/temporary-business-hours/autocomplete",
//     JWTService.authCookieOrBearer,
//     validateBody(temporaryBusinessHourAutocompleteSchema),
//     controller.autocomplete
// );
//
// router.post(
//     "/temporary-business-hours/r-temporary-business-hours",
//     [
//         JWTService.authCookieOrBearer,
//         OnlyAdminMiddleware.accessOnlyAdminOrManagerOrUser,
//         validateBody(temporaryHoursRedisSchema),
//     ],
//     controller.getTemporaryHoursFromRedis
// );
//
// router.get(
//     "/temporary-business-hours/:id",
//     JWTService.authCookieOrBearer,
//     validateParams(temporaryBusinessHourIdParamsSchema),
//     controller.getById
// );

export default router;
