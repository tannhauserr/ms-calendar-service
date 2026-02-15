import express from 'express';
import { JWTService } from '../services/jwt/jwt.service';
import { OnlyAdminMiddleware } from '../middlewares/only-admin.middleware';
import { RecurrenceRuleController } from '../controllers/recurrence-rule/recurrence-rule.controller';

const router = express.Router();
const controller = new RecurrenceRuleController();

// Listar reglas con paginación
router.post(
    '/recurrenceRules',
    [JWTService.authCookieOrBearer, OnlyAdminMiddleware.accessAuthorized],
    controller.get
);

// Listar reglas de un calendario específico
router.post(
    '/recurrenceRules/byCalendar',
    [JWTService.authCookieOrBearer, OnlyAdminMiddleware.accessAuthorized],
    controller.getByCalendar
);

// Añadir una nueva regla de recurrencia
router.post(
    '/recurrenceRules/add',
    [JWTService.authCookieOrBearer, OnlyAdminMiddleware.accessAuthorized],
    controller.add
);

// Obtener una regla por su ID
router.get(
    '/recurrenceRules-:id',
    [JWTService.authCookieOrBearer, OnlyAdminMiddleware.accessAuthorized],
    controller.getById
);

// Actualizar una regla de recurrencia
router.post(
    '/recurrenceRules/update-:id',
    [
        JWTService.authCookieOrBearer,
        OnlyAdminMiddleware.allowRoles([
            'ROLE_OWNER', 
            'ROLE_ADMIN',
            'ROLE_MANAGER',
            'ROLE_SUPER_ADMIN',
            'ROLE_DEVELOPER',
            'ROLE_SUPPORT',
        ]),
        OnlyAdminMiddleware.accessAuthorized,
    ],
    controller.update
);

// Eliminar una regla de recurrencia
router.post(
    '/recurrenceRules/delete',
    [
        JWTService.authCookieOrBearer,
        OnlyAdminMiddleware.allowRoles([
            'ROLE_ADMIN',
            'ROLE_SUPER_ADMIN',
            'ROLE_DEVELOPER',
            'ROLE_SUPPORT',
        ]),
        OnlyAdminMiddleware.accessAuthorized,
    ],
    controller.delete
);

module.exports = router;
