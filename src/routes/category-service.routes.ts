import express from 'express';
import { JWTService } from '../services/jwt/jwt.service';
import { OnlyAdminMiddleware } from '../middlewares/only-admin.middleware';
import { CategoryServiceController } from '../controllers/category-sercivice/category-service.controller';


const router = express.Router();
const controller = new CategoryServiceController();

const ROLE_ALLOWED = ['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_OWNER', 'ROLE_SUPER_ADMIN', 'ROLE_DEVELOPER', "ROLE_SUPPORT"]
// Obtener servicios de categoría por establecimiento
router.get(
    '/category-services/workspace/:idWorkspace',
    [
        JWTService.authCookieOrBearer,
        OnlyAdminMiddleware.allowRoles(ROLE_ALLOWED),
        OnlyAdminMiddleware.accessAuthorized
    ],
    controller.getByWorkspace
);

// Obtener una relación categoría-servicio por ID
router.get(
    '/category-services/:id',
    [
        JWTService.authCookieOrBearer,
        OnlyAdminMiddleware.allowRoles(ROLE_ALLOWED),
        OnlyAdminMiddleware.accessAuthorized
    ],
    controller.getById
);

// Crear múltiples relaciones categoría-servicio
router.post(
    '/category-services/add-multiple',
    [
        JWTService.authCookieOrBearer,
        OnlyAdminMiddleware.allowRoles(ROLE_ALLOWED),
        OnlyAdminMiddleware.accessAuthorized
    ],
    controller.addMultiple
);

// Eliminar una relación categoría-servicio por ID
router.post(
    '/category-services/detete-multiple',
    [
        JWTService.authCookieOrBearer,
        OnlyAdminMiddleware.allowRoles(ROLE_ALLOWED),
        OnlyAdminMiddleware.accessAuthorized
    ],
    controller.deleteMultiple
);

// Eliminar relaciones por categoría y servicio
router.post(
    '/category-services/delete-by-category-service',
    [
        JWTService.authCookieOrBearer,
        OnlyAdminMiddleware.allowRoles(ROLE_ALLOWED),
        OnlyAdminMiddleware.accessAuthorized
    ],
    controller.deleteMultipleByCategoryAndService
);

module.exports = router;
