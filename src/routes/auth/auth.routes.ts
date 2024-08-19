import express from 'express';

import { AuthController } from '../../controllers/auth/auth.controller';
import { UserMiddleware } from '../../middlewares/user/user.middleware';
import AuthMiddleware from '../../middlewares/create-new-credentials.middleware';


const router = express.Router();
const authController = new AuthController()


router.post('/api/login', UserMiddleware.checkUserAndPassword, authController.login);

router.get('/api/auth', [
    // CatchIdentityWebMiddleware.catch, // Captura la identidad del usuario para ser guardada en la base de datos
    AuthMiddleware.checkAndCreateToken, // Crea el token y lo guarda en la base de datos
    // AuthMiddleware.reviewParamsToken, // Revisa los parametros del token
], authController.getTokens);


module.exports = router;
