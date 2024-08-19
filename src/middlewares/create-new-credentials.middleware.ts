import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { JWTService } from '../services/jwt/jwt.service';
import { AuthCredentials } from '../models/interfaces';
import { NodeCacheService } from '../services/@cache/node-cache.service';
import { keyCache } from '../services/@cache/keys-cache';
import moment, { weekdays } from 'moment';
import * as uuid from 'uuid';
import { UtilGeneral } from '../utils/util-general';



class AuthMiddleware {
    /**
     * Esta función es usada en la primera petición que se hace al bot,
     * justo al iniciar la app por parte de un usuario
     * */
    static checkAndCreateToken = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const ip = req.ip;
            // const referrer = req.get('Referrer') || 'direct';
            const origen = req.get('X-Origin-Activation');

            // console.log("referrer: ", referrer)
            console.log("origen: ", origen)

            const idSession = uuid.v4();

            // console.log("referrer: ", referrer)


            let jwtService = JWTService.instance;
            // const privateKey = await jwtService.getPrivateKey();
            // console.log("Look at the new dailyKey: ", privateKey);

            // await UtilGeneral.sleep(2000);
            const token = await jwtService.sign({ idSession, ip, webAllowed: origen });

            // Asumiendo que AuthCredentials es una interfaz o tipo que tienes definido
            (req as any).token = token;
            (req as any).userInfo = { ip, webAllowed: origen };

            next();
        } catch (e) {

            res.status(500).send({
                message: 'An unexpected error occurred during the authentication process.',
                error: e instanceof Error ? e.message : 'Unknown error'
            });
        }
    }







    /**
     * Este middlewarte se usará justo antes de reviewParamsToken para capturar el
     * IP y web del usuario y ayudar a la comprobación de la key
     * @param req 
     * @param res 
     * @param next 
     */
    static checkIpAndWeb = async (req: Request, res: Response, next: NextFunction) => {
        try {

            const ip = req.ip;
            // const referrer = req.get('Referrer') || 'direct';
            const origen = req.get('X-Origin-Activation');

            (req as any).userInfo = { ip, webAllowed: origen };

            next();
        } catch (e) {

            res.status(500).send({
                message: 'An unexpected error occurred during the authentication process.',
                error: e instanceof Error ? e.message : 'Unknown error'
            });
        }
    }


}

export default AuthMiddleware;
