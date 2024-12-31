import express from 'express';

import { JWTService } from '../services/jwt/jwt.service';
import { TemporaryBusinessHourController } from '../controllers/all-business-controller/temporary-business-hour/temporary-business-hour.controller';
import { BusinessHourMiddleware } from '../middlewares/business-hour/business-hour.middleware';
import { OnlyAdminMiddleware } from '../middlewares/only-admin.middleware';

const router = express.Router();
const controller = new TemporaryBusinessHourController();

// Añadir un nuevo horario de trabajo
router.post('/temporary-business-hours/add',
    [
        JWTService.verifyCookieToken,
        OnlyAdminMiddleware.accessOnlyAdminOrManager,

        // TODO: No se agrega ya que las fechas vienen de otra manera
        // BusinessHourMiddleware.convertToISOTime_FirstPart,
        BusinessHourMiddleware.handleDeleteClosedRecords_SecondPart,
        BusinessHourMiddleware.preventOverlapping_ThirdPart,
    ], controller.add);

// Obtener todos los horarios de trabajo con paginación
router.post('/temporary-business-hours', JWTService.verifyCookieToken, controller.get);

// Obtener un horario de trabajo por ID
router.get('/temporary-business-hours-:id', JWTService.verifyCookieToken, controller.getById);

// Obtener horarios de trabajo por día de la semana
router.post('/temporary-business-hours/by-date', JWTService.verifyCookieToken, controller.getByDate);

// Obtener horarios de trabajo por trabajador
router.post('/temporary-business-hours/by-worker-and-date', JWTService.verifyCookieToken, controller.getByWorkerAndDate);

router.post('/temporary-business-hours/exception/by-worker-and-date-exception', JWTService.verifyCookieToken, controller.getDistinctDatesWithExceptionsByWorker);

router.post('/temporary-business-hours/r-temporary-business', JWTService.verifyCookieToken, controller.getTemporaryHoursFromRedis);

// Actualizar un horario de trabajo
router.post('/temporary-business-hours/update-:id', [
    JWTService.verifyCookieToken,
    OnlyAdminMiddleware.accessOnlyAdminOrManager,

    // TODO: No se agrega ya que las fechas vienen de otra manera
    // BusinessHourMiddleware.convertToISOTime_FirstPart,
    BusinessHourMiddleware.handleDeleteClosedRecords_SecondPart,
    BusinessHourMiddleware.preventOverlapping_ThirdPart,
], controller.update);

// Eliminar un horario de trabajo por ID
router.post('/temporary-business-hours/delete', [
    JWTService.verifyCookieToken,
    OnlyAdminMiddleware.accessOnlyAdminOrManager,
    // TODO: No se agrega ya que las fechas vienen de otra manera
    // BusinessHourMiddleware.convertToISOTime_FirstPart,
    BusinessHourMiddleware.handleDeleteClosedRecords_SecondPart,
    BusinessHourMiddleware.preventOverlapping_ThirdPart,
], controller.delete);

// Autocompletar horarios de trabajo
router.post('/temporary-business-hours/autocomplete', JWTService.verifyCookieToken, controller.autocomplete);


router.post('/temporary-business-hours/r-temporary-business-hours', [ JWTService.verifyCookieToken, OnlyAdminMiddleware.accessOnlyAdminOrManagerOrUser, ], controller.getTemporaryHoursFromRedis);

module.exports = router;
