import express from "express";
import { CalendarController } from "../controllers/calendar/calendar.controller";
import { JWTService } from "../services/jwt/jwt.service";
import { CheckCompanyMiddleware } from "../middlewares/check-company/check-company.middleware";
import { OnlyAdminMiddleware } from "../middlewares/only-admin.middleware";

const router = express.Router();
const controller = new CalendarController();

/**
 * Middleware para verificar el token JWT a través de cookies.
 */
const verifyTokenMiddleware = JWTService.verifyCookieToken;

/**
 * Rutas de Calendario
 */

// Obtener todos los calendarios con paginación
// router.get("/calendars", verifyTokenMiddleware, controller.getAll);

// Obtener un calendario por su ID
router.get("/calendars-:id", [
    verifyTokenMiddleware,
    // CheckCompanyMiddleware.validateCompanyAccessInWorkspace,
    OnlyAdminMiddleware.allowRoles(['ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_USER', 'ROLE_SUPER_ADMIN', 'ROLE_DEVELOPER', "ROLE_SUPPORT"]),
    OnlyAdminMiddleware.accessAuthorized,
], controller.getById);

// Añadir un nuevo calendario
router.post("/calendars", verifyTokenMiddleware, controller.create);

// Actualizar un calendario existente
// router.post("/calendars/update", verifyTokenMiddleware, controller.update);

// Borrar varios calendarios mediante sus IDs
router.post("/calendars/delete-definitive", verifyTokenMiddleware, controller.delete);

// Buscar o crear un calendario
router.post("/calendars/find-or-create", verifyTokenMiddleware, controller.findOrCreate);
router.post("/calendars/find-or-create-data", [
    verifyTokenMiddleware,
    OnlyAdminMiddleware.allowRoles(['ROLE_OWNER', 'ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_SUPER_ADMIN', 'ROLE_DEVELOPER', "ROLE_SUPPORT"]),
    OnlyAdminMiddleware.accessAuthorized,
], controller.findOrCreateWithData);


router.post(
    "/calendars/by-company-workspace",
    verifyTokenMiddleware,
    controller.getByCompanyAndWorkspace
);


module.exports = router;
