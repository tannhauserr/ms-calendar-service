import express from 'express';

import { JWTService } from '../../services/jwt/jwt.service';
import { UserController } from '../../controllers/user/user.controller';
import { OnlyAdminMiddleware } from '../../middlewares/only-admin.middleware';



const router = express.Router();
const userController = new UserController();

// Obtener usuarios con paginación
router.post('/user', JWTService.verifyCookieToken, userController.get);


// Añadir un nuevo usuario
router.post('/user/add', JWTService.verifyCookieToken, userController.add);

// Obtener un usuario por su ID
router.get('/user/:id', JWTService.verifyCookieToken, userController.getById);

// Actualizar un usuario
router.post('/user/update', [
    JWTService.verifyCookieToken,
    OnlyAdminMiddleware.accessOnlyAdminOrUser
], userController.update);

// Borrar uno o varios usuarios
router.post('/user/delete', JWTService.verifyCookieToken, userController.delete);


router.post('/user/autocomplete-back', JWTService.verifyCookieToken, userController.autocompleteBack);


router.post('/users-by-list', JWTService.verifyCookieToken, userController.getUserListForPromotionPage);

// OLD
// OLD
// OLD
// OLD


router.get('/user/pagination', JWTService.verifyCookieToken, userController.get);
router.post('/user/all-id', JWTService.verifyCookieToken, userController.getAllId);

router.post('/user/check-password', JWTService.verifyCookieToken, userController.checkPassword);
router.post('/user/check-username', JWTService.verifyCookieToken, userController.checkUsername);

// Sin necesidad de token
// router.get('/user', AuthenticatorService.verifyToken, userController.get);



// Crear, editar y borrar (falta borrar)
// router.post('/user/add',
//     [
//         JWTService.verifyCookieToken,
//         UserMiddleware.searchUserByUsername
//     ], userController.add);

// router.post('/user/update',
//     [
//         JWTService.verifyCookieToken,
//     ], userController.update);

// router.post('/user/delete',
//     [
//         JWTService.verifyCookieToken,
//     ], userController.delete);




module.exports = router;
