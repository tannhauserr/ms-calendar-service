import express from 'express';
import { JWTService } from '../services/jwt/jwt.service';
import { OnlyAdminMiddleware } from '../middlewares/only-admin.middleware';
import { CategoryEstablishmentController } from '../controllers/category-establishment/category-establishment.controller';
import { CheckCompanyMiddleware } from '../middlewares/check-company/check-company.middleware';


const router = express.Router();
const controller = new CategoryEstablishmentController();

// Obtener todas las relaciones con paginación
router.post('/category-establishments', [
    JWTService.verifyCookieToken,
    OnlyAdminMiddleware.accessOnlyAdminOrManager,
], controller.get);

// Obtener una relación por ID
router.get('/category-establishments/:id', [
    JWTService.verifyCookieToken,
    OnlyAdminMiddleware.accessOnlyAdminOrManager,
], controller.getById);

// Crear una nueva relación
router.post('/category-establishments/add', [
    JWTService.verifyCookieToken,
    OnlyAdminMiddleware.accessOnlyAdminOrManager,
    CheckCompanyMiddleware.validateCompanyAccessInEstablishment,
], controller.addMultiple);

// Eliminar múltiples relaciones
router.post('/category-establishments/delete-definitive', [
    JWTService.verifyCookieToken,
    OnlyAdminMiddleware.accessOnlyAdminOrManager,
    CheckCompanyMiddleware.validateCompanyAccessInEstablishment,
], controller.delete);

module.exports = router;
