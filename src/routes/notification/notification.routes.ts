import { Router } from 'express';
import { NotificationController } from '../../controllers/notification/notification.controller';
import { JWTService } from '../../services/jwt/jwt.service';




const controller = new NotificationController();

const router = Router();


// // Ruta para obtener todos los usuarios baneados
// router.post('/api/notification',
//     [
//         JWTService.verifyCookieToken,
//     ], controller.getAllNotificationV2);



// // Ruta para eliminar uno o más usuarios baneados
// router.post('/api/notification/delete',
//     [
//         JWTService.verifyCookieToken,
//     ], controller.deleteNotification);

// // Ruta para eliminar uno o más usuarios baneados
// router.post('/api/notification-all-id',
//     [
//         JWTService.verifyCookieToken,
//     ], controller.getAllId);



// // Ruta para obtener un usuario baneado por ID
// router.get('/api/notification-:id',
//     [
//         JWTService.verifyCookieToken,
//     ], controller.getNotificationById);


// router.post('/api/notification/update-:id',
//     [
//         JWTService.verifyCookieToken,
//     ], controller.updateNotification);


// // Tabla Notification User


// router.post('/api/notificationUser-update-:id',
//     [
//         JWTService.verifyCookieToken,
//     ], controller.updateNotificationUser);

// router.get('/api/notificationUser-update-multiple-revised',
//     [
//         JWTService.verifyCookieToken,
//     ], controller.markAllAsRevised);



module.exports = router;
