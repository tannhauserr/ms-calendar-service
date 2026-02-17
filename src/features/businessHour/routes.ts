import express from "express";

import { BusinessHourController } from "./controllers/business-hour.controller";
import { BusinessHourMiddleware } from "../../middlewares/business-hour/business-hour.middleware";
import { OnlyAdminMiddleware } from "../../middlewares/only-admin.middleware";
import { JWTService } from "../../services/jwt/jwt.service";
import { validateBody, validateParams } from "../../middlewares/validate-zod.middleware";
import {
    addBusinessHourSchema,
    businessHourIdParamsSchema,
    businessHourWeekDayParamsSchema,
    businessHoursRedisSchema,
    deleteBusinessHourSchema,
    getBusinessHoursSchema,
    updateBusinessHourSchema,
} from "./schemas";

const router = express.Router();
const controller = new BusinessHourController();

router.post(
    "/business-hours/add",
    [
        JWTService.authCookieOrBearer,
        OnlyAdminMiddleware.accessOnlyAdminOrManager,
        validateBody(addBusinessHourSchema),
        BusinessHourMiddleware.convertToISOTime_FirstPart,
        BusinessHourMiddleware.handleDeleteClosedRecords_SecondPart,
        BusinessHourMiddleware.preventOverlapping_ThirdPart,
    ],
    controller.add
);

router.post(
    "/business-hours/search",
    JWTService.authCookieOrBearer,
    validateBody(getBusinessHoursSchema),
    controller.get
);

router.get(
    "/business-hours/by-weekday/:weekDayType",
    JWTService.authCookieOrBearer,
    validateParams(businessHourWeekDayParamsSchema),
    controller.getByWeekDay
);

router.put(
    "/business-hours/:id",
    [
        JWTService.authCookieOrBearer,
        OnlyAdminMiddleware.accessOnlyAdminOrManager,
        validateBody(updateBusinessHourSchema),
        BusinessHourMiddleware.convertToISOTime_FirstPart,
        BusinessHourMiddleware.handleDeleteClosedRecords_SecondPart,
        BusinessHourMiddleware.preventOverlapping_ThirdPart,
    ],
    controller.update
);

router.delete(
    "/business-hours",
    [
        JWTService.authCookieOrBearer,
        OnlyAdminMiddleware.accessOnlyAdminOrManager,
        validateBody(deleteBusinessHourSchema),
        BusinessHourMiddleware.convertToISOTime_FirstPart,
        BusinessHourMiddleware.handleDeleteClosedRecords_SecondPart,
        BusinessHourMiddleware.preventOverlapping_ThirdPart,
    ],
    controller.delete
);

router.post(
    "/business-hours/r-business-hours",
    JWTService.authCookieOrBearer,
    validateBody(businessHoursRedisSchema),
    controller.getBusinessHoursFromRedis
);

router.get(
    "/business-hours/:id",
    JWTService.authCookieOrBearer,
    validateParams(businessHourIdParamsSchema),
    controller.getById
);

export default router;
