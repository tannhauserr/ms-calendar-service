import express from "express";
import { EventClientController } from "./controllers/event-client.controller";
import { PublicEventFeatureController } from "../public-event/controllers/public-event.controller";
import { BookingGuardsMiddleware } from "../../middlewares/booiking-guard/booking-guard.middleware";
import { JWTService } from "../../services/jwt/jwt.service";

const router = express.Router();
const controller = new EventClientController();
const publicEventController = new PublicEventFeatureController();

router.post(
    "/events/client-web/appointments",
    [
        JWTService.authCookieOrBearer,
        BookingGuardsMiddleware.BaseContextSimple(),
        BookingGuardsMiddleware.ResolveWorkspace(),
        BookingGuardsMiddleware.ResolveClientWorkspace(),
    ],
    controller.getFromWeb
);

router.post(
    "/events/client-web/appointments/:id",
    [
        JWTService.authCookieOrBearer,
        BookingGuardsMiddleware.BaseContextSimple(),
        BookingGuardsMiddleware.ResolveWorkspace(),
        BookingGuardsMiddleware.ResolveClientWorkspace(),
    ],
    controller.getEventByIdAndClientWorkspaceAndWorkspace
);

router.post(
    "/events/client-web/available-days",
    [JWTService.authCookieOrBearer],
    publicEventController.publicGetAvailableDaysSlots
);

router.post(
    "/events/client-web/available-times",
    [
        JWTService.authCookieOrBearer,
        BookingGuardsMiddleware.BaseValidationAndNormalize(),
        BookingGuardsMiddleware.ResolveWorkspace(),
    ],
    publicEventController.publicGetAvailableTimeSlots
);

router.post(
    "/events/client-add",
    [
        JWTService.authCookieOrBearer,
        BookingGuardsMiddleware.BaseValidationAndNormalize(),
        BookingGuardsMiddleware.ResolveWorkspace(),
        BookingGuardsMiddleware.ResolveClientWorkspace(),
        BookingGuardsMiddleware.EnforceTimeRules(),
        BookingGuardsMiddleware.EnforceUserLimits(),
    ],
    controller.addFromWeb
);

router.post(
    "/events/client-update",
    [
        JWTService.authCookieOrBearer,
        BookingGuardsMiddleware.BaseValidationAndNormalize(),
        BookingGuardsMiddleware.ResolveWorkspace(),
        BookingGuardsMiddleware.ResolveClientWorkspace(),
        BookingGuardsMiddleware.EnforceTimeRules(),
    ],
    controller.updateFromWeb
);

router.post(
    "/events/client-cancel",
    [
        JWTService.authCookieOrBearer,
        BookingGuardsMiddleware.BaseContextSimple(),
        BookingGuardsMiddleware.ResolveWorkspace(),
        BookingGuardsMiddleware.ResolveClientWorkspace(),
    ],
    controller.cancelEventFromWeb
);

router.post(
    "/events/client-confirm",
    [
        JWTService.authCookieOrBearer,
        BookingGuardsMiddleware.BaseContextSimple(),
        BookingGuardsMiddleware.ResolveWorkspace(),
        BookingGuardsMiddleware.ResolveClientWorkspace(),
    ],
    controller.confirmEventFromWeb
);

export default router;
