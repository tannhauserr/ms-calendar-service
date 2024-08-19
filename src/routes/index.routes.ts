import { Router } from 'express';

const router = Router();


// Notificaciones
// router.use("/", require('./notification/notification.routes'));
// Para acceder a archivos estáticos
router.use("/", require('./cache-control/cache-control.routes'));
// Configuration
// router.use("/", require('./configuration.routes'));

// Auth
router.use("/", require('./auth/auth.routes'));
// Google Oauth
router.use("/api", require('./google-oauth/google-oauth.routes'));
// user
router.use("/api", require('./user/user.routes'));
// role
router.use("/api", require('./role/role.routes'));



// upload file
router.use("/api", require('./upload-file/upload-file.routes'));

export default router;
