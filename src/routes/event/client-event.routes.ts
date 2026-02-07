import express from 'express';

import { ClientEventController } from '../../controllers/event/client-event.controller';
import { PublicEventController } from '../../controllers/event/public-event.controller';
import { BookingGuardsMiddleware } from '../../middlewares/booiking-guard/booking-guard.middleware';
import { JWTService } from '../../services/jwt/jwt.service';


const router = express.Router();
const controller = new ClientEventController();
// Se usa en client-event para reutilizar un par de funciones, pero en este caso usa el token de cliente
const publicEventController = new PublicEventController();


// TODO: crear middleware para confirmar que el id de cliente es válido
// TODO: crear middleware para confirmar que el id de cliente es válido
// TODO: crear middleware para confirmar que el id de cliente es válido
// TODO: crear middleware para confirmar que el id de cliente es válido
// TODO: crear middleware para confirmar que el id de cliente es válido
// TODO: crear middleware para confirmar que el id de cliente es válido 

// Obtener eventos de un cliente en concreto
router.post('/events/client-web/appointments', [
    JWTService.authCookieOrBearer,
    BookingGuardsMiddleware.BaseContextSimple(),    // valida + normaliza input -> ctx.input
    BookingGuardsMiddleware.ResolveWorkspace(),              // resuelve workspace + config + tz -> ctx.workspace/config/timeZoneWorkspace
    BookingGuardsMiddleware.ResolveClientWorkspace(),        // resuelve idClientWorkspace -> ctx.customer
], controller.getFromWeb);

// Get de un evento por id para cliente web
router.post('/events/client-web/appointments/:id', [
    JWTService.authCookieOrBearer,
    BookingGuardsMiddleware.BaseContextSimple(),    // valida + normaliza input -> ctx.input
    BookingGuardsMiddleware.ResolveWorkspace(),              // resuelve workspace + config + tz -> ctx.workspace/config/timeZoneWorkspace
    BookingGuardsMiddleware.ResolveClientWorkspace(),        // resuelve idClientWorkspace -> ctx.customer
], controller.getEventByIdAndClientWorkspaceAndWorkspace);



// Disponible días para cliente web
router.post('/events/client-web/available-days',
    [
        JWTService.authCookieOrBearer,

        // BookingGuardsMiddleware.BaseValidationAndNormalize(),
        // BookingGuardsMiddleware.ResolveWorkspace(),
        // BookingGuardsMiddleware.ResolveBookingPage(),
    ],
    publicEventController.publicGetAvailableDaysSlots
);

// Disponible horarios para cliente web
router.post('/events/client-web/available-times',
    [
        JWTService.authCookieOrBearer,
        BookingGuardsMiddleware.BaseValidationAndNormalize(),
        BookingGuardsMiddleware.ResolveWorkspace(),
        // BookingGuardsMiddleware.ResolveBookingPage(),
    ],
    publicEventController.publicGetAvailableTimeSlots
);

// Crea el evento desde el cliente web
router.post(
    "/events/client-add",
    [
        JWTService.authCookieOrBearer,                 // auth
        BookingGuardsMiddleware.BaseValidationAndNormalize(),    // valida + normaliza input -> ctx.input
        BookingGuardsMiddleware.ResolveWorkspace(),              // resuelve workspace + config + tz -> ctx.workspace/config/timeZoneWorkspace
        // BookingGuardsMiddleware.ResolveBookingPage(),
        BookingGuardsMiddleware.ResolveClientWorkspace(),        // resuelve idClientWorkspace -> ctx.customer
        BookingGuardsMiddleware.EnforceTimeRules(),              // reglas de ventana / lead times / etc. -> ctx.when
        BookingGuardsMiddleware.EnforceUserLimits(),             // límites por usuario -> bloquea si excede
        // BookingGuards.FeatureFlagsAndIdempotency(), // opcional (deja TODOs)
    ],
    controller.addFromWeb
);

// Actualiza el evento desde el cliente web
router.post('/events/client-update', [
    JWTService.authCookieOrBearer,
    BookingGuardsMiddleware.BaseValidationAndNormalize(),    // valida + normaliza input -> ctx.input
    BookingGuardsMiddleware.ResolveWorkspace(),              // resuelve workspace + config + tz -> ctx.workspace/config/timeZoneWorkspace
    BookingGuardsMiddleware.ResolveClientWorkspace(),        // resuelve idClientWorkspace -> ctx.customer
    BookingGuardsMiddleware.EnforceTimeRules(),              // reglas de ventana / lead times / etc. -> ctx.when
    //   A la hora de editar un evento no se aplican los límites de usuario
    // BookingGuardsMiddleware.EnforceUserLimits(),
], controller.updateFromWeb);


router.post('/events/client-cancel', [
    JWTService.authCookieOrBearer,
    BookingGuardsMiddleware.BaseContextSimple(),    // valida + normaliza input -> ctx.input
    BookingGuardsMiddleware.ResolveWorkspace(),              // resuelve workspace + config + tz -> ctx.workspace/config/timeZoneWorkspace
    BookingGuardsMiddleware.ResolveClientWorkspace(),        // resuelve idClientWorkspace -> ctx.customer
], controller.cancelEventFromWeb);

router.post('/events/client-confirm', [
    JWTService.authCookieOrBearer,
    BookingGuardsMiddleware.BaseContextSimple(),    // valida + normaliza input -> ctx.input
    BookingGuardsMiddleware.ResolveWorkspace(),              // resuelve workspace + config + tz -> ctx.workspace/config/timeZoneWorkspace
    BookingGuardsMiddleware.ResolveClientWorkspace(),        // resuelve idClientWorkspace -> ctx.customer
], controller.confirmEventFromWeb);

module.exports = router;
