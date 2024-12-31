import express from 'express';
import { UserCalendarController } from '../controllers/user-calendar/user-calendar.controller';
import { JWTService } from '../services/jwt/jwt.service';

const router = express.Router();
const controller = new UserCalendarController();

// // Añadir un nuevo calendario de usuario
// router.post('/user-calendars/add', JWTService.verifyCookieToken, controller.add);
// router.post('/user-calendars/add-google-total', JWTService.verifyCookieToken, controller.addGoogleTotal);

// // Obtener calendario de usuario por ID
// router.get('/user-calendars-:id', JWTService.verifyCookieToken, controller.getById);

// // Obtener calendario de usuario por ID de usuario
// router.get('/user-calendars/byUser-:idUserFk', JWTService.verifyCookieToken, controller.getByIdUser);

// // Obtener calendario de usuario por ID de calendario
// router.get('/user-calendars/byCalendar-:idCalendarFk', JWTService.verifyCookieToken, controller.getByIdCalendar);

// // Actualizar un calendario de usuario
// router.post('/user-calendars/update-:id', JWTService.verifyCookieToken, controller.update);

// // Borrar un calendario de usuario
// // router.post('/user-calendars/delete', JWTService.verifyCookieToken, controller.delete);
// router.post('/user-calendars/delete-google-total', JWTService.verifyCookieToken, controller.deleteGoogleTotal);


module.exports = router;
