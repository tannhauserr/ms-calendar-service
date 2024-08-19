import { Router } from 'express';
import { GoogleOauthController } from '../../controllers/google-oauth/google-oauth.controller';
import { JWTService } from '../../services/jwt/jwt.service';


const controller = new GoogleOauthController();

const router = Router();


// Obtiene la URL de autenticación de Google
router.get('/auth/google/url', JWTService.verifyCookieToken, controller.getAuthUrl);
// Recibe el callback de Google
router.get('/auth/google/callback', controller.googleCallback);
// Verifica si el usuario tiene los permisos necesarios
router.post('/auth/google/check-scopes', JWTService.verifyCookieToken, controller.checkUserScopes);



module.exports = router;