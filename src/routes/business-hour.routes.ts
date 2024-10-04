import express from 'express';

import { JWTService } from '../services/jwt/jwt.service';
import { BusinessHourController } from '../controllers/all-business-controller/business-hour/business-hour.controller';
import { BusinessHourMiddleware } from '../middlewares/business-hour/business-hour.middleware';


const router = express.Router();
const controller = new BusinessHourController();

// Añadir un nuevo horario comercial
router.post('/business-hours/add', [
    JWTService.verifyCookieToken,
    BusinessHourMiddleware.convertToISOTime_FirstPart,
    BusinessHourMiddleware.handleDeleteClosedRecords_SecondPart,
    BusinessHourMiddleware.preventOverlapping_ThirdPart,

], controller.add);

// Obtener todos los horarios comerciales con paginación
// TODO: Este es un GET y no recibe paginación
router.get('/business-hours', JWTService.verifyCookieToken, controller.get);

// Obtener un horario comercial por ID
router.get('/business-hours-:id', JWTService.verifyCookieToken, controller.getById);

// Obtener horarios comerciales por día de la semana
router.get('/business-hours/by-weekday-:weekDayType', JWTService.verifyCookieToken, controller.getByWeekDay);

// Actualizar un horario comercial
router.post('/business-hours/update-:id',
    [
        JWTService.verifyCookieToken,
        BusinessHourMiddleware.convertToISOTime_FirstPart,
        BusinessHourMiddleware.handleDeleteClosedRecords_SecondPart,
        BusinessHourMiddleware.preventOverlapping_ThirdPart,
    ],
    controller.update);

// Eliminar un horario comercial por ID
router.post('/business-hours/delete', [
    JWTService.verifyCookieToken,
    BusinessHourMiddleware.convertToISOTime_FirstPart,
    BusinessHourMiddleware.handleDeleteClosedRecords_SecondPart,
    BusinessHourMiddleware.preventOverlapping_ThirdPart,
], controller.delete);

// Autocompletar horarios comerciales
router.post('/business-hours/autocomplete', JWTService.verifyCookieToken, controller.autocomplete);

module.exports = router;
