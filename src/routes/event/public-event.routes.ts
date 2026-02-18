import crypto from 'crypto';
import express from 'express';
import { PublicEventFeatureController } from '../../features/public-event/controllers/public-event.controller';
import { BookingGuardsMiddleware } from '../../middlewares/booiking-guard/booking-guard.middleware';


const router = express.Router();
const controller = new PublicEventFeatureController();

router.post('/events/available-days',
    [
        // BookingGuardsMiddleware.BaseValidationAndNormalize(),
        // BookingGuardsMiddleware.ResolveWorkspace(),
        // BookingGuardsMiddleware.ResolveBookingPage(),
    ],
    controller.publicGetAvailableDaysSlots
);

router.post('/events/available-times',
    [
        BookingGuardsMiddleware.BaseValidationAndNormalize(),
        BookingGuardsMiddleware.ResolveWorkspace(),
        // BookingGuardsMiddleware.ResolveBookingPage(),
    ],
    controller.publicGetAvailableTimeSlots);



const ICS_SECRET = process.env.ICS_SECRET || "dev-secret";

// Firma/valida: sig = HMAC(eventId + ":" + startIso)
function sign(value: string) {
    return crypto.createHmac("sha256", ICS_SECRET).update(value).digest("hex");
}
function safeEq(a: string, b: string) {
    const A = Buffer.from(a);
    const B = Buffer.from(b);
    if (A.length !== B.length) return false;
    return crypto.timingSafeEqual(A, B);
}

router.get("/events/ics/:idEvent", controller.getICS);

// Se manda el idBooking, que es el idGroup (puede ser uno o varios eventos asociados)
router.get("/events/ics-group/:idGroup", controller.getICSByGroup);


module.exports = router;
