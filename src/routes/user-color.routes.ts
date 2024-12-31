import express from 'express';
import { UserColorController } from '../controllers/user-color/user-color.controller';
import { JWTService } from '../services/jwt/jwt.service';


const router = express.Router();
const controller = new UserColorController();


// router.get('/user-colors', JWTService.verifyCookieToken, controller.getUserColorSimple);

// router.get('/user-colors-:id', JWTService.verifyCookieToken, controller.getById);

// // Obtener color de usuario por ID de usuario
// router.get('/user-colors/byUser-:idUserFk', JWTService.verifyCookieToken, controller.getByidUser);

// // Añadir un nuevo color de usuario
// router.post('/user-colors/add', JWTService.verifyCookieToken, controller.add);

// // Actualizar un color de usuario
// router.post('/user-colors/update-:id', JWTService.verifyCookieToken, controller.update);

// // Borrar un color de usuario
// router.post('/user-colors/delete', JWTService.verifyCookieToken, controller.delete);

module.exports = router;
