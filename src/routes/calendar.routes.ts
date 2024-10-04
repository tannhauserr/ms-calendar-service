import express from 'express';
import { CalendarController } from '../controllers/calendar/calendar.controller';
import { JWTService } from '../services/jwt/jwt.service';


const router = express.Router();
const controller = new CalendarController();

// Obtener calendarios con paginación
router.post('/calendars', JWTService.verifyCookieToken, controller.get);

// Añadir un nuevo calendario
router.post('/calendars/add', JWTService.verifyCookieToken, controller.add);

// Obtener un calendario por su ID
router.get('/calendars/:id', JWTService.verifyCookieToken, controller.getById);

// Actualizar un calendario
router.post('/calendars/update', JWTService.verifyCookieToken, controller.update);

// Borrar un calendario
router.post('/calendars/delete-google-total', JWTService.verifyCookieToken, controller.deleteGoogleTotal);

module.exports = router;
