import express from 'express';
import { JWTService } from '../services/jwt/jwt.service';
import { WorkerAbsenceController } from '../controllers/all-business-controller/worker-absence/worker-absence.controller';
import { WorkerAbsenceMiddleware } from '../middlewares/worker-absence/worker-absence.middleware';
import { OnlyAdminMiddleware } from '../middlewares/only-admin.middleware';

const router = express.Router();
const controller = new WorkerAbsenceController();

// Obtener todas las ausencias de trabajadores
router.post('/worker-absences',
    JWTService.verifyCookieToken,
    OnlyAdminMiddleware.allowRoles(['ROLE_ADMIN', 'ROLE_MANAGER']),
    OnlyAdminMiddleware.accessAuthorized,
    controller.get
);
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
router.post('/worker-absences/by-workspace',
    JWTService.verifyCookieToken,
    OnlyAdminMiddleware.accessOnlyAdminOrManager,

    controller.getByWorkspace
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
