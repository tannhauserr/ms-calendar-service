import crypto from "crypto";
import express from "express";
import { PublicEventFeatureController } from "./controllers/public-event.controller";
import { BookingGuardsMiddleware } from "../../middlewares/booiking-guard/booking-guard.middleware";

const router = express.Router();
const controller = new PublicEventFeatureController();

router.post("/events/available-days", [], controller.publicGetAvailableDaysSlots);

router.post(
    "/events/available-times",
    [
        BookingGuardsMiddleware.BaseValidationAndNormalize(),
        BookingGuardsMiddleware.ResolveWorkspace(),
    ],
    controller.publicGetAvailableTimeSlots
);

const ICS_SECRET = process.env.ICS_SECRET || "dev-secret";

function sign(value: string) {
    return crypto.createHmac("sha256", ICS_SECRET).update(value).digest("hex");
}

function safeEq(a: string, b: string) {
    const A = Buffer.from(a);
    const B = Buffer.from(b);
    if (A.length !== B.length) return false;
    return crypto.timingSafeEqual(A, B);
}

void sign;
void safeEq;

router.get("/events/ics/:idEvent", controller.getICS);
router.get("/events/ics-group/:idGroup", controller.getICSByGroup);

export default router;
