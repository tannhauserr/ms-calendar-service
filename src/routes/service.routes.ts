import express from 'express';
import { ServiceController } from '../controllers/service/service.controller';
import { JWTService } from '../services/jwt/jwt.service';


const router = express.Router();
const controller = new ServiceController();

// Obtener servicios con paginación
router.post('/services', JWTService.verifyCookieToken, controller.get);

router.post('/services/autocomplete', JWTService.verifyCookieToken, controller.autocomplete);


// Añadir un nuevo servicio
router.post('/services/add', JWTService.verifyCookieToken, controller.add);

// Obtener un servicio por su ID
router.get('/services-:id', JWTService.verifyCookieToken, controller.getById);

// Actualizar un servicio
router.post('/services/update', JWTService.verifyCookieToken, controller.update);

// Borrar un servicio
router.post('/services/delete', JWTService.verifyCookieToken, controller.delete);

module.exports = router;
