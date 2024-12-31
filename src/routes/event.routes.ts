import express from 'express';
import { EventController } from '../controllers/event/event.controller';
import { JWTService } from '../services/jwt/jwt.service';
import { EventMiddleware } from '../middlewares/event/event.middleware';
import { OnlyAdminMiddleware } from '../middlewares/only-admin.middleware';
import { CheckCompanyMiddleware } from '../middlewares/check-company/check-company.middleware';


const router = express.Router();
const controller = new EventController();

// Obtener eventos con paginación
// router.post('/eventstest', controller.get);


// Obtener eventos con paginación
router.post('/events', JWTService.verifyCookieToken, controller.get);
router.post('/events-list', JWTService.verifyCookieToken, controller.getList);


// Añadir un nuevo evento
// router.post('/events/add', JWTService.verifyCookieToken, controller.add);
router.post('/events/add', [
    JWTService.verifyCookieToken,
    OnlyAdminMiddleware.accessOnlyAdminOrManagerOrUser,
    EventMiddleware.preventPastEvent,
    EventMiddleware.checkEventConflict,
], controller.addGoogleTotal);


// Obtener un evento por su ID
router.get('/events-:id', JWTService.verifyCookieToken, controller.getById);

// Actualizar un evento
router.post('/events/update-:id', [
    JWTService.verifyCookieToken,
    OnlyAdminMiddleware.accessOnlyAdminOrManagerOrUser,
    CheckCompanyMiddleware.checkCompanyInEvent,
    EventMiddleware.preventPastEvent,
    EventMiddleware.checkEventConflict,
    EventMiddleware.validateEventStatusChange
], controller.updateGoogleTotal);


// Borrar un evento
// router.post('/events/delete', JWTService.verifyCookieToken, controller.delete);
// router.post('/events/delete-google-total', JWTService.verifyCookieToken, controller.deleteGoogleTotal);

router.post('/events/change-status',
    [
        JWTService.verifyCookieToken,
        CheckCompanyMiddleware.checkCompanyInEvent,
        OnlyAdminMiddleware.accessOnlyAdminOrManagerOrUser,
    ],
    controller.changeEventStatus);


module.exports = router;
