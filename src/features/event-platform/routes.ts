import express from "express";
import { EventPlatformController } from "./controllers/event-platform.controller";
import { OnlyAdminMiddleware } from "../../middlewares/only-admin.middleware";
import { JWTService } from "../../services/jwt/jwt.service";
import { RequestIdempotencyMiddleware } from "../../middlewares/request-idempotency.middleware";
import { validateBody, validateParams } from "../../middlewares/validate-zod.middleware";
import {
    changeEventStatusBodySchema,
    deleteEventBodySchema,
    getEventByIdParamsSchema,
    getEventExtraDataBodySchema,
    getEventExtraDataParamsSchema,
    getEventsBodySchema,
    getEventsListBodySchema,
    markCommentAsReadBodySchema,
    updateByIdBodySchema,
    updateByIdParamsSchema,
    upsertEventByPlatformBodySchema,
} from "./schemas";

const router = express.Router();
const controller = new EventPlatformController();
const preventDuplicateClicks = RequestIdempotencyMiddleware.preventDuplicateClicks({
    ttlSeconds: 5,
    methods: ["POST", "PUT", "PATCH", "DELETE"],
});

router.post("/events", JWTService.authCookieOrBearer, validateBody(getEventsBodySchema), controller.get);
router.post("/events-list", JWTService.authCookieOrBearer, validateBody(getEventsListBodySchema), controller.getList);

router.post(
    "/events/company/:idCompany/workspace/:idWorkspace/get-event-extra-data",
    JWTService.authCookieOrBearer,
    validateParams(getEventExtraDataParamsSchema),
    validateBody(getEventExtraDataBodySchema),
    OnlyAdminMiddleware.allowRoles([
        "ROLE_OWNER",
        "ROLE_ADMIN",
        "ROLE_MANAGER",
        "ROLE_SUPER_ADMIN",
        "ROLE_DEVELOPER",
        "ROLE_SUPPORT",
    ]),
    OnlyAdminMiddleware.accessAuthorized,
    controller.getEventExtraData
);

router.get("/events-:id", JWTService.authCookieOrBearer, validateParams(getEventByIdParamsSchema), controller.getById);

router.post(
    "/events/mark-as-read",
    [
        JWTService.authCookieOrBearer,
        preventDuplicateClicks,
        validateBody(markCommentAsReadBodySchema),
        OnlyAdminMiddleware.allowRoles(["ROLE_OWNER", "ROLE_ADMIN", "ROLE_MANAGER", "ROLE_USER"]),
        OnlyAdminMiddleware.accessAuthorized,
    ],
    controller.markCommentAsRead
);

router.post(
    "/events/delete",
    [
        JWTService.authCookieOrBearer,
        preventDuplicateClicks,
        validateBody(deleteEventBodySchema),
        OnlyAdminMiddleware.allowRoles([
            "ROLE_OWNER",
            "ROLE_ADMIN",
            "ROLE_MANAGER",
            "ROLE_SUPER_ADMIN",
            "ROLE_DEVELOPER",
            "ROLE_SUPPORT",
        ]),
        OnlyAdminMiddleware.accessAuthorized,
    ],
    controller.deleteEvent
);

router.post(
    "/events/change-status",
    [
        JWTService.authCookieOrBearer,
        preventDuplicateClicks,
        validateBody(changeEventStatusBodySchema),
        OnlyAdminMiddleware.accessOnlyAdminOrManagerOrUser,
    ],
    controller.changeEventStatus
);

router.post(
    "/events/update-:id",
    [
        JWTService.authCookieOrBearer,
        preventDuplicateClicks,
        validateParams(updateByIdParamsSchema),
        validateBody(updateByIdBodySchema),
        OnlyAdminMiddleware.allowRoles([
            "ROLE_OWNER",
            "ROLE_ADMIN",
            "ROLE_MANAGER",
            "ROLE_SUPER_ADMIN",
            "ROLE_DEVELOPER",
            "ROLE_SUPPORT",
        ]),
        OnlyAdminMiddleware.accessAuthorized,
    ],
    controller.updateById
);

router.post(
    "/events/v2/platform/manage-event",
    [
        JWTService.authCookieOrBearer,
        preventDuplicateClicks,
        validateBody(upsertEventByPlatformBodySchema),
        OnlyAdminMiddleware.allowRoles([
            "ROLE_USER",
            "ROLE_OWNER",
            "ROLE_ADMIN",
            "ROLE_MANAGER",
            "ROLE_SUPER_ADMIN",
            "ROLE_DEVELOPER",
            "ROLE_SUPPORT",
        ]),
        OnlyAdminMiddleware.accessAuthorized,
    ],
    controller.upsertEventByPlatform
);

export default router;
