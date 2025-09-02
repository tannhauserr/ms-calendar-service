// import express from 'express';
// import { JWTService } from '../services/jwt/jwt.service';
// import { OnlyAdminMiddleware } from '../middlewares/only-admin.middleware';
// import { CategoryWorkspaceController } from '../controllers/category-workspace/category-workspace.controller';
// import { CheckCompanyMiddleware } from '../middlewares/check-company/check-company.middleware';


// const router = express.Router();
// const controller = new CategoryWorkspaceController();

// // Obtener todas las relaciones con paginación
// router.post('/category-workspaces', [
//     JWTService.verifyCookieToken,
//     OnlyAdminMiddleware.allowRoles(['ROLE_OWNER', 'ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_SUPER_ADMIN', 'ROLE_DEVELOPER', "ROLE_SUPPORT"]),
//     OnlyAdminMiddleware.accessAuthorized,
// ], controller.get);

// // Obtener una relación por ID
// router.get('/category-workspaces/:id', [
//     JWTService.verifyCookieToken,
//     // OnlyAdminMiddleware.accessOnlyAdminOrManager,
//     OnlyAdminMiddleware.allowRoles(['ROLE_OWNER', 'ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_SUPER_ADMIN', 'ROLE_DEVELOPER', "ROLE_SUPPORT"]),
//     OnlyAdminMiddleware.accessAuthorized,
// ], controller.getById);

// // Crear una nueva relación
// router.post('/category-workspaces/add', [
//     JWTService.verifyCookieToken,
//     // OnlyAdminMiddleware.accessOnlyAdminOrManager,
//     // CheckCompanyMiddleware.validateCompanyAccessInWorkspace,
//     OnlyAdminMiddleware.allowRoles(['ROLE_OWNER', 'ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_SUPER_ADMIN', 'ROLE_DEVELOPER', "ROLE_SUPPORT"]),
//     OnlyAdminMiddleware.accessAuthorized,
// ], controller.addMultiple);

// // Eliminar múltiples relaciones
// router.post('/category-workspaces/delete-definitive', [
//     JWTService.verifyCookieToken,
//     OnlyAdminMiddleware.allowRoles(['ROLE_OWNER', 'ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_SUPER_ADMIN', 'ROLE_DEVELOPER', "ROLE_SUPPORT"]),
//     OnlyAdminMiddleware.accessAuthorized,
// ], controller.delete);

// module.exports = router;
