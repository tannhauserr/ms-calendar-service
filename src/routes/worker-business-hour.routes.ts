import express from 'express';

import { JWTService } from '../services/jwt/jwt.service';
import { WorkerBusinessHourController } from '../controllers/all-business-controller/worker-business-hour/worker-business-hour.controller';
import { BusinessHourMiddleware } from '../middlewares/business-hour/business-hour.middleware';
import { OnlyAdminMiddleware } from '../middlewares/only-admin.middleware';

const router = express.Router();
const controller = new WorkerBusinessHourController();

// Añadir un nuevo horario de trabajo
router.post('/worker-business-hours/add',
    [
        JWTService.verifyCookieToken,
        OnlyAdminMiddleware.accessOnlyAdminOrManager,
        BusinessHourMiddleware.convertToISOTime_FirstPart,
        BusinessHourMiddleware.handleDeleteClosedRecords_SecondPart,
        BusinessHourMiddleware.preventOverlapping_ThirdPart,
    ], controller.add);

// Obtener todos los horarios de trabajo con paginación
router.post('/worker-business-hours', JWTService.verifyCookieToken, controller.get);

// Obtener un horario de trabajo por ID
router.get('/worker-business-hours-:id', JWTService.verifyCookieToken, controller.getById);

// Obtener horarios de trabajo por día de la semana
router.get('/worker-business-hours/by-weekday-:weekDayType', JWTService.verifyCookieToken, controller.getByWeekDay);

// Obtener horarios de trabajo por trabajador
router.get('/worker-business-hours/by-worker-:idWorker-and-workspace-:idWorkspace', JWTService.verifyCookieToken, controller.getByWorkerAndWorkspace);

// Actualizar un horario de trabajo
router.post('/worker-business-hours/update-:id', [
    JWTService.verifyCookieToken,
    OnlyAdminMiddleware.accessOnlyAdminOrManager,
    BusinessHourMiddleware.convertToISOTime_FirstPart,
    BusinessHourMiddleware.handleDeleteClosedRecords_SecondPart,
    BusinessHourMiddleware.preventOverlapping_ThirdPart,
], controller.update);

// Eliminar un horario de trabajo por ID
router.post('/worker-business-hours/delete', [
    JWTService.verifyCookieToken,
    OnlyAdminMiddleware.accessOnlyAdminOrManager,
    BusinessHourMiddleware.convertToISOTime_FirstPart,
    BusinessHourMiddleware.handleDeleteClosedRecords_SecondPart,
    BusinessHourMiddleware.preventOverlapping_ThirdPart,
], controller.delete);

router.post('/worker-business-hours/r-worker-business-hours', [
    JWTService.verifyCookieToken,
    OnlyAdminMiddleware.accessOnlyAdminOrManagerOrUser,

], controller.getWorkerHoursFromRedis);

// Autocompletar horarios de trabajo
// router.post('/worker-business-hours/autocomplete', JWTService.verifyCookieToken, controller.autocomplete);

module.exports = router;
