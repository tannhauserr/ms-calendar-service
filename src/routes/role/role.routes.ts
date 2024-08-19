import express from "express";
import { RoleController } from "../../controllers/role/role.controller";
import { JWTService } from "../../services/jwt/jwt.service";


const router = express.Router();
const controller = new RoleController();

// Obtener usuarios con paginación
router.get('/role/autocomplete', JWTService.verifyCookieToken, controller.autocomplete);


module.exports = router;
