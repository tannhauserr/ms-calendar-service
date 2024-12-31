import express from 'express';
import { UserServiceController } from '../controllers/user-service/user-service.controller';
import { JWTService } from '../services/jwt/jwt.service';


const router = express.Router();
const controller = new UserServiceController();

router.post('/user-services', JWTService.verifyCookieToken, controller.get);

// Obtener servicio de usuario por su ID
router.get('/user-services-:id', JWTService.verifyCookieToken, controller.getById);

// Añadir un nuevo servicio de usuario
router.post('/user-services/add', JWTService.verifyCookieToken, controller.addMultiple);

// Actualizar un servicio de usuario
router.post('/user-services/update-:id', JWTService.verifyCookieToken, controller.update);

// Borrar un servicio de usuario
router.post('/user-services/delete-definitive', JWTService.verifyCookieToken, controller.delete);

module.exports = router;
