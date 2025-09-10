import express from 'express';
import { EventController } from '../../controllers/event/event.controller';
import { JWTService } from '../../services/jwt/jwt.service';
import { EventMiddleware } from '../../middlewares/event/event.middleware';
import { OnlyAdminMiddleware } from '../../middlewares/only-admin.middleware';
import { CheckCompanyMiddleware } from '../../middlewares/check-company/check-company.middleware';
import { BookingGuardsMiddleware } from '../../middlewares/booiking-guard/booking-guard.middleware';


const router = express.Router();
const controller = new EventController();

// Obtener eventos con paginación
// router.post('/eventstest', controller.get);


// Obtener eventos con paginación
router.post('/events', JWTService.authCookieOrBearer, controller.get);
router.post('/events-list', JWTService.authCookieOrBearer, controller.getList);

router.post('/events/company/:idCompany/workspace/:idWorkspace/get-event-extra-data',
    JWTService.authCookieOrBearer,
    OnlyAdminMiddleware.allowRoles([
        'ROLE_OWNER',
        'ROLE_ADMIN',
        'ROLE_MANAGER',
        'ROLE_SUPER_ADMIN',
        'ROLE_DEVELOPER',
        'ROLE_SUPPORT',
    ]),
    OnlyAdminMiddleware.accessAuthorized,
    controller.getEventExtraData
);


// Añadir un nuevo evento
// router.post('/events/add', JWTService.authCookieOrBearer, controller.add);
router.post('/events/add', [
    JWTService.authCookieOrBearer,
    OnlyAdminMiddleware.allowRoles(['ROLE_OWNER', 'ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_SUPER_ADMIN', 'ROLE_DEVELOPER', "ROLE_SUPPORT"]),
    OnlyAdminMiddleware.accessAuthorized,
    // EventMiddleware.preventPastEvent,
    // EventMiddleware.checkEventConflict,
], controller.add);

// TODO: crear middleware para confirmar que el id de cliente es válido
router.post(
    "/events/client-add",
    [
        JWTService.authCookieOrBearer,                 // auth
        BookingGuardsMiddleware.BaseValidationAndNormalize(),    // valida + normaliza input -> ctx.input
        BookingGuardsMiddleware.ResolveWorkspace(),              // resuelve workspace + config + tz -> ctx.workspace/config/timeZoneWorkspace
        BookingGuardsMiddleware.ResolveClientWorkspace(),        // resuelve idClientWorkspace -> ctx.customer
        BookingGuardsMiddleware.EnforceTimeRules(),              // reglas de ventana / lead times / etc. -> ctx.when
        BookingGuardsMiddleware.EnforceUserLimits(),             // límites por usuario -> bloquea si excede
        // BookingGuards.FeatureFlagsAndIdempotency(), // opcional (deja TODOs)
    ],
    controller.addFromWeb
);

// Esto es para cuando se añade un evento desde el front del cliente
// router.post('/events/client/:id/add', [
//     JWTService.authCookieOrBearer,

//     // TODO: Estaría bien crear un middleware que compruebe si el cliente
//     // pertenece al establecimiento del evento

//     // EventMiddleware.preventPastEvent,
//     // EventMiddleware.checkEventConflict,
// ], controller.add);

// Obtener un evento por su ID
router.get('/events-:id', JWTService.authCookieOrBearer, controller.getById);

// Actualizar un evento
router.post('/events/update-:id', [
    JWTService.authCookieOrBearer,
    OnlyAdminMiddleware.allowRoles(['ROLE_OWNER', 'ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_SUPER_ADMIN', 'ROLE_DEVELOPER', "ROLE_SUPPORT"]),
    OnlyAdminMiddleware.accessAuthorized,


    CheckCompanyMiddleware.checkCompanyInEvent,
    // TODO: Ahora si se puede actualizar pasado
    // EventMiddleware.preventPastEvent,
    // EventMiddleware.checkEventConflict,
    // EventMiddleware.validateEventStatusChange_DESFASADO
], controller.update);


// Borrar un evento
router.post('/events/delete',
    [
        JWTService.authCookieOrBearer,
        OnlyAdminMiddleware.allowRoles(['ROLE_OWNER', 'ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_SUPER_ADMIN', 'ROLE_DEVELOPER', "ROLE_SUPPORT"]),
        OnlyAdminMiddleware.accessAuthorized,
        CheckCompanyMiddleware.checkCompanyInEvent,
    ], controller.deleteEvent);
// router.post('/events/delete-google-total', JWTService.authCookieOrBearer, controller.deleteGoogleTotal);

router.post('/events/change-status',
    [
        JWTService.authCookieOrBearer,
        CheckCompanyMiddleware.checkCompanyInEvent,
        OnlyAdminMiddleware.accessOnlyAdminOrManagerOrUser,
    ],
    controller.changeEventStatus);


module.exports = router;
