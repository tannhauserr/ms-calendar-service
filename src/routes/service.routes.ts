import express from 'express';
import { ServiceController } from '../controllers/service/service.controller';
import { JWTService } from '../services/jwt/jwt.service';
import { OnlyAdminMiddleware } from '../middlewares/only-admin.middleware';


const router = express.Router();
const controller = new ServiceController();

// Obtener servicios con paginación
router.post('/services', [JWTService.authCookieOrBearer, OnlyAdminMiddleware.accessAuthorized], controller.get);
router.post('/services/ordered', [JWTService.authCookieOrBearer, OnlyAdminMiddleware.accessAuthorized], controller.orderedServicesByCategory);


router.post('/services/autocomplete', [JWTService.authCookieOrBearer, OnlyAdminMiddleware.accessAuthorized], controller.autocomplete);

router.post('/services/autocomplete-back', [JWTService.authCookieOrBearer, OnlyAdminMiddleware.accessAuthorized], controller.autocompleteServicesBackendByIdWorkspaceAndText);

// Añadir un nuevo servicio
router.post('/services/add', [JWTService.authCookieOrBearer, OnlyAdminMiddleware.accessAuthorized], controller.add);

// Obtener un servicio por su ID
router.get('/services-:id', [JWTService.authCookieOrBearer, OnlyAdminMiddleware.accessAuthorized], controller.getById);

// Actualizar un servicio
router.post('/services/update-:id', [
    JWTService.authCookieOrBearer,
    OnlyAdminMiddleware.allowRoles(['ROLE_OWNER', 'ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_SUPER_ADMIN', 'ROLE_DEVELOPER', "ROLE_SUPPORT"]),
    OnlyAdminMiddleware.accessAuthorized
], controller.update);


router.post('/services/update/mod-status',
    [
        JWTService.authCookieOrBearer,
        OnlyAdminMiddleware.allowRoles(['ROLE_SUPER_ADMIN', 'ROLE_DEVELOPER', "ROLE_SUPPORT"]),
        OnlyAdminMiddleware.accessAuthorized
    ],
    controller.updateModerationStatus);


// Borrar un servicio
router.post('/services/delete', [
    JWTService.authCookieOrBearer,
    OnlyAdminMiddleware.allowRoles(['ROLE_ADMIN', 'ROLE_SUPER_ADMIN', 'ROLE_DEVELOPER', "ROLE_SUPPORT"]),
    OnlyAdminMiddleware.accessAuthorized
], controller.delete);

module.exports = router;
