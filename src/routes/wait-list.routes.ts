import express from 'express';
import { JWTService } from '../services/jwt/jwt.service';
import { WaitListController } from '../controllers/all-business-controller/wait-list/wait-list.controller';
import { OnlyAdminMiddleware } from '../middlewares/only-admin.middleware';

const router = express.Router();
const controller = new WaitListController();

// Lista paginada de waitlist
router.post('/wait-list',
    JWTService.authCookieOrBearer,
    OnlyAdminMiddleware.accessOnlyAdminOrManager,
    controller.get
);

// Crea un registro en waitlist
router.post('/wait-list/add',
    JWTService.authCookieOrBearer,
    OnlyAdminMiddleware.accessOnlyAdminOrManager,
    controller.add
);

// Obtiene un registro por id
router.get('/wait-list-:id',
    JWTService.authCookieOrBearer,
    OnlyAdminMiddleware.accessOnlyAdminOrManager,
    controller.getById
);

// Lista registros por workspace
router.post('/wait-list/by-workspace',
    JWTService.authCookieOrBearer,
    OnlyAdminMiddleware.accessOnlyAdminOrManager,
    controller.getByWorkspace
);

// Cuenta pendientes por cliente/workspace (endDate >= now)
router.get('/wait-list/pending-count',
    JWTService.authCookieOrBearer,
    OnlyAdminMiddleware.accessOnlyAdminOrManager,
    controller.getPendingCount
);

// Actualiza un registro (id en param o body)
router.post('/wait-list/update-:id',
    JWTService.authCookieOrBearer,
    OnlyAdminMiddleware.accessOnlyAdminOrManager,
    controller.update
);

// Elimina (soft) uno o varios registros
router.post('/wait-list/delete',
    JWTService.authCookieOrBearer,
    OnlyAdminMiddleware.accessOnlyAdminOrManager,
    controller.delete
);

module.exports = router;
