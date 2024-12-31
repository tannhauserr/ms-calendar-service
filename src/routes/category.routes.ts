import express from 'express';
import { JWTService } from '../services/jwt/jwt.service';
import { OnlyAdminMiddleware } from '../middlewares/only-admin.middleware';
import { CategoryController } from '../controllers/category/category.controller';

const router = express.Router();
const controller = new CategoryController();

// Obtener todas las categorías con paginación
router.post('/categories', [
    JWTService.verifyCookieToken,
    OnlyAdminMiddleware.accessOnlyAdminOrManager,
], controller.get);

// Obtener una categoría por ID
router.get('/categories-:id', [
    JWTService.verifyCookieToken,
    OnlyAdminMiddleware.accessOnlyAdminOrManager,
], controller.getById);

// Crear una nueva categoría
router.post('/categories/add', [
    JWTService.verifyCookieToken,
    OnlyAdminMiddleware.accessOnlyAdminOrManager,
], controller.add);

// Actualizar una categoría
router.post('/categories/update-:id', [
    JWTService.verifyCookieToken,
    OnlyAdminMiddleware.accessOnlyAdminOrManager,
], controller.update);


// Eliminar múltiples categorías (borrado lógico)
router.post('/categories/delete-definitive', [
    JWTService.verifyCookieToken,
    OnlyAdminMiddleware.accessOnlyAdminOrManager,
], controller.delete);

router.get('/categories/autocomplete', [
    JWTService.verifyCookieToken,
    OnlyAdminMiddleware.accessOnlyAdminOrManager,
], controller.autocomplete);

// Obtener servicios asociados a una categoría por ID
router.post('/categories/:id/services', [
    JWTService.verifyCookieToken,
    OnlyAdminMiddleware.accessOnlyAdminOrManager,
], controller.getServiceByCategoryId);

router.get('/categories/company/:idCompany', [
    JWTService.verifyCookieToken,
    OnlyAdminMiddleware.accessOnlyAdminOrManager,
], controller.getCategoriesWithServicesAndUsers);




module.exports = router;
