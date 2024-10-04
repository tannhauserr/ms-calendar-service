import express from 'express';
import { EventController } from '../controllers/event/event.controller';
import { JWTService } from '../services/jwt/jwt.service';
import { EventMiddleware } from '../middlewares/event/event.middleware';


const router = express.Router();
const controller = new EventController();

// Obtener eventos con paginación
router.post('/eventstest', controller.get);


// Obtener eventos con paginación
router.post('/events', JWTService.verifyCookieToken, controller.get);

// Añadir un nuevo evento
// router.post('/events/add', JWTService.verifyCookieToken, controller.add);
router.post('/events/add-google-total', [
    JWTService.verifyCookieToken,
    EventMiddleware.checkEventConflict
], controller.addGoogleTotal);


// Obtener un evento por su ID
router.get('/events-:id', JWTService.verifyCookieToken, controller.getById);

// Actualizar un evento
// router.post('/events/update-:id', JWTService.verifyCookieToken, controller.update);
router.post('/events/update-google-total-:id', JWTService.verifyCookieToken, controller.updateGoogleTotal);


// Borrar un evento
// router.post('/events/delete', JWTService.verifyCookieToken, controller.delete);
router.post('/events/delete-google-total', JWTService.verifyCookieToken, controller.deleteGoogleTotal);

module.exports = router;
