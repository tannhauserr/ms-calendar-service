import express from 'express';
import { JWTService } from '../services/jwt/jwt.service';
import { WorkerAbsenceController } from '../controllers/all-business-controller/worker-absence/worker-absence.controller';
import { BusinessHourMiddleware } from '../middlewares/business-hour/business-hour.middleware';
import { WorkerAbsenceMiddleware } from '../middlewares/worker-absence/worker-absence.middleware';
import { OnlyAdminMiddleware } from '../middlewares/only-admin.middleware';

const router = express.Router();
const controller = new WorkerAbsenceController();

// Añadir una nueva ausencia de trabajador
router.post('/worker-absences/add',
    [
        JWTService.verifyCookieToken,
        OnlyAdminMiddleware.accessOnlyAdminOrManager,
        WorkerAbsenceMiddleware.cleanExceptionDate
    ],
    controller.add
);

// Obtener una ausencia por ID
router.get('/worker-absences-:id',
    [
        JWTService.verifyCookieToken,
        OnlyAdminMiddleware.accessOnlyAdminOrManager,
    ],
    controller.getById
);

// Obtener ausencias por establecimiento
router.post('/worker-absences/by-establishment',
    JWTService.verifyCookieToken,
    OnlyAdminMiddleware.accessOnlyAdminOrManager,

    controller.getByEstablishment
);

// Obtener ausencias por trabajador
router.post('/worker-absences/by-user',
    [
        JWTService.verifyCookieToken,
        OnlyAdminMiddleware.accessOnlyAdminOrManager,
    ],
    controller.getByUser
);

// Actualizar una ausencia
router.post('/worker-absences/update-:id',
    [
        JWTService.verifyCookieToken,
        OnlyAdminMiddleware.accessOnlyAdminOrManager,
        WorkerAbsenceMiddleware.cleanExceptionDate
    ],
    controller.update
);

// Eliminar ausencias por ID
router.post('/worker-absences/delete-definitive',
    [
        JWTService.verifyCookieToken,
        OnlyAdminMiddleware.accessOnlyAdminOrManager,

    ],
    controller.delete
);

module.exports = router;
