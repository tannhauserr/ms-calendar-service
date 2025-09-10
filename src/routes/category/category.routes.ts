import express from 'express';
import { JWTService } from '../../services/jwt/jwt.service';
import { OnlyAdminMiddleware } from '../../middlewares/only-admin.middleware';
import { CategoryController } from '../../controllers/category/category.controller';

const router = express.Router();
const controller = new CategoryController();

// Obtener todas las categorías con paginación
router.post('/categories', [
    JWTService.authCookieOrBearer,
    OnlyAdminMiddleware.accessOnlyAdminOrManager,
], controller.get);

// Obtener una categoría por ID
router.get('/categories-:id', [
    JWTService.authCookieOrBearer,
    OnlyAdminMiddleware.accessOnlyAdminOrManager,
], controller.getById);

// Crear una nueva categoría
router.post('/categories/add', [
    JWTService.authCookieOrBearer,
    OnlyAdminMiddleware.accessOnlyAdminOrManager,
], controller.add);

// Actualizar una categoría
router.post('/categories/update-:id', [
    JWTService.authCookieOrBearer,
    OnlyAdminMiddleware.accessOnlyAdminOrManager,
], controller.update);

router.post('/categories/update/mod-status', [
    JWTService.authCookieOrBearer,
    OnlyAdminMiddleware.accessAuthorized
], controller.updateModerationStatus);


// Eliminar múltiples categorías (borrado lógico)
router.post('/categories/delete-definitive', [
    JWTService.authCookieOrBearer,
    OnlyAdminMiddleware.accessOnlyAdminOrManager,
], controller.deleteMultiple);

router.get('/categories/autocomplete', [
    JWTService.authCookieOrBearer,
    OnlyAdminMiddleware.accessOnlyAdminOrManager,
], controller.autocomplete);

// Obtener servicios asociados a una categoría por ID
router.post('/categories/:id/services', [
    JWTService.authCookieOrBearer,
    OnlyAdminMiddleware.accessOnlyAdminOrManager,
], controller.getServiceByCategoryId);

router.get('/categories/company/:idCompany/workspace/:idWorkspace', [
    JWTService.authCookieOrBearer,
    OnlyAdminMiddleware.accessOnlyAdminOrManager,
], controller.getCategoriesWithServicesAndUsers);


router.post('/categories/counter-services', [
    JWTService.authCookieOrBearer,
    OnlyAdminMiddleware.allowRoles(['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_OWNER', 'ROLE_SUPER_ADMIN', 'ROLE_DEVELOPER', "ROLE_SUPPORT"]),
    OnlyAdminMiddleware.accessAuthorized
], controller.counterServicesByCategories);



module.exports = router;
