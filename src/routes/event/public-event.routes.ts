import express from 'express';
import crypto from 'crypto';
import { EventController } from '../../controllers/event/event.controller';
import { JWTService } from '../../services/jwt/jwt.service';
import { EventMiddleware } from '../../middlewares/event/event.middleware';
import { OnlyAdminMiddleware } from '../../middlewares/only-admin.middleware';
import { CheckCompanyMiddleware } from '../../middlewares/check-company/check-company.middleware';
import { PublicEventController } from '../../controllers/event/public-event.controller';
import { BookingGuardsMiddleware } from '../../middlewares/booiking-guard/booking-guard.middleware';
import prisma from '../../lib/prisma';
import { buildIcs, IcsMeta } from '../../services/@database/event/util/build-ics';


const router = express.Router();
const controller = new PublicEventController();

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
        BookingGuardsMiddleware.ResolveBookingPage(),
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


module.exports = router;
