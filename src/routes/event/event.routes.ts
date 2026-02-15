import express from 'express';
import { EventController } from '../../controllers/event/event.controller';
import { UpdateEventByIdController } from '../../controllers/event/update-event-by-id.controller';
import { OnlyAdminMiddleware } from '../../middlewares/only-admin.middleware';
import { JWTService } from '../../services/jwt/jwt.service';


const router = express.Router();
const controller = new EventController();
const updateEventByIdController = new UpdateEventByIdController();

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


// Obtener un evento por su ID
router.get('/events-:id', JWTService.authCookieOrBearer, controller.getById);


// Marcar comentario de cliente como leído, es solo para roles de usuario normal
router.post('/events/mark-as-read', [
    JWTService.authCookieOrBearer,
    OnlyAdminMiddleware.allowRoles(['ROLE_OWNER', 'ROLE_ADMIN', 'ROLE_MANAGER', "ROLE_USER"]),
    OnlyAdminMiddleware.accessAuthorized,

    // TODO: Ahora si se puede actualizar pasado
    // EventMiddleware.preventPastEvent,
    // EventMiddleware.checkEventConflict,
    // EventMiddleware.validateEventStatusChange_DESFASADO
], controller.markCommentAsRead);


// Borrar un evento
router.post('/events/delete',
    [
        JWTService.authCookieOrBearer,
        OnlyAdminMiddleware.allowRoles(['ROLE_OWNER', 'ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_SUPER_ADMIN', 'ROLE_DEVELOPER', "ROLE_SUPPORT"]),
        OnlyAdminMiddleware.accessAuthorized,

    ], controller.deleteEvent);
// router.post('/events/delete-google-total', JWTService.authCookieOrBearer, controller.deleteGoogleTotal);

router.post('/events/change-status',
    [
        JWTService.authCookieOrBearer,
        OnlyAdminMiddleware.accessOnlyAdminOrManagerOrUser,
    ],
    controller.changeEventStatus);

// Legacy (comentado):
// router.post('/events/update-id', JWTService.authCookieOrBearer, controller.update);
router.post('/events/update-id',
    [
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
    ],
    updateEventByIdController.updateById
);

// Upsert de eventos desde la plataforma (sidebar)
router.post('/events/v2/platform/manage-event',
    [
        JWTService.authCookieOrBearer,
        OnlyAdminMiddleware.allowRoles(['ROLE_USER', 'ROLE_OWNER', 'ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_SUPER_ADMIN', 'ROLE_DEVELOPER', 'ROLE_SUPPORT']),
        OnlyAdminMiddleware.accessAuthorized,
    ],
    controller.upsertEventByPlatform
);


module.exports = router;
