
import jwt from 'jsonwebtoken';
import { Message } from '../../models/messages/failure';
import { Response } from '../../models/messages/response';
import { generatePrivateKey } from '../../utils/jwt/generatePrivateKey';
import config from './config';
import { NodeCacheService } from '../@cache/node-cache.service';
import moment from 'moment';
import { CONSOLE_COLOR } from '../../constant/console-color';
import CustomError from '../../models/custom-error/CustomError';

const NODE_ENV = process.env.NODE_ENV || 'development';
require('dotenv').config({
    path: `.env.${NODE_ENV}`
});

export class JWTService {

    private static _instance: JWTService;
    private _privateKey?: string;
    private publicKey: string;


    constructor() {
        this.publicKey = generatePrivateKey();
    }

    public static get instance(): JWTService {
        return this._instance || (this._instance = new this());
    }

    public async getPrivateKey() {
        if (!this._privateKey) {
            await config.init();
            this._privateKey = config.getPrivateKey();
        }
        return this._privateKey;
    }

    /**
     * Crea el token con la clave privada 
     * Si esta no existe la clave la crea y la guarda en la base de datos
     * @param user 
     * @param expiresIn 86400 = 24 horas
     * @returns 
     */
    public async sign(user, expiresIn = 86400) {
        try {
            const privateKey = await this.getPrivateKey();

            return await new Promise((resolve, reject) => {
                jwt.sign(user, privateKey, { expiresIn }, (err, token) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(token);
                    }
                });
            });
        } catch (err: any) {
            throw new Error("Error en sign: " + err.message);
        }
    }


    public setPrivateKey(key: string) {
        this._privateKey = key;
    }

    /**
     * Verifica que el token sea el correcto
     * @param token 
     * @param secret 
     */
    // public verify(token) {
    //     return new Promise<any>((resolve, reject) => {
    //         jwt.verify(token, this._privateKey, (err, decode) => {
    //             if (err) {
    //                 reject(Message.Failure.TOKEN_INVALID)
    //                 return;
    //             }
    //             resolve(decode)
    //         })
    //     })
    // }

    /**
  * Verifica un token JWT usando la clave privada actual o una clave privada anterior.
  * @param token El token JWT que se va a verificar.
  * @returns Un Promise que se resuelve con los datos decodificados del token si la verificación es exitosa.
  * @throws Lanza un error si no se puede verificar el token con ninguna de las claves privadas.
  */
    public async verify(token): Promise<any> {
        if (!this._privateKey) {
            // await this.getPrivateKey()
            console.log(`${CONSOLE_COLOR.FgRed}Clave privada no disponible.${CONSOLE_COLOR.Reset}`);
            // throw new Error("Clave privada no disponible.");
            throw new CustomError('JWTService.verify', new Error("Clave privada no disponible."));
        }

        try {
            return await this._verifyTokenWithKey(token, this._privateKey);
        } catch (err: any) {
            if (err.name === 'TokenExpiredError') {
                // Manejar específicamente un token expirado
                throw new CustomError('JWTService.verify', new Error(Message.Failure.TOKEN_EXPIRED));
                // throw new Error(Message.Failure.TOKEN_EXPIRED);
            } else {
                // Si falla con la clave privada actual, intenta con la antigua
                return await this._verifyTokenWithOldKey(token);
            }

        }
    }

    /**
     * Verifica un token JWT utilizando una clave privada específica.
     * @param token El token JWT que se va a verificar.
     * @param key La clave privada utilizada para la verificación.
     * @returns Un Promise que se resuelve con los datos decodificados del token si la verificación es exitosa.
     * @throws Lanza un error si la verificación falla.
     */
    private async _verifyTokenWithKey(token: string, key: string): Promise<any> {
        return new Promise((resolve, reject) => {
            jwt.verify(token, key, (err, decoded) => {
                if (!err) {
                    resolve(decoded);
                } else {
                    reject(err);
                }
            });
        });
    }

    /**
     * Intenta verificar un token JWT con una clave privada anterior.
     * @param token El token JWT que se va a verificar.
     * @returns Un Promise que se resuelve con los datos decodificados del token si la verificación es exitosa.
     * @throws Lanza un error si no hay una clave privada anterior o si la verificación falla con dicha clave.
     */
    private async _verifyTokenWithOldKey(token: string): Promise<any> {
        const oldPrivateKey = this._checkOldPrivateKey();
        if (oldPrivateKey) {
            return this._verifyTokenWithKey(token, oldPrivateKey);
        }
        throw new CustomError('JWTService._verifyTokenWithOldKey', new Error(Message.Failure.TOKEN_INVALID));
        // throw new Error(Message.Failure.TOKEN_INVALID);
    }

    /**
     * Comprueba si existe una clave privada anterior en la caché y la devuelve.
     * Mirar servicio "generate-private-key-cron.service.ts" para más información sobre
     * el funcionamiento de la clave ntigua.
     * 
     * @returns La clave privada anterior si existe, o undefined si no hay ninguna clave privada anterior.
     */
    _checkOldPrivateKey(): string | undefined {
        let ncs = NodeCacheService.instance;
        let date = moment().format("YYYY-MM-DD");
        return ncs.getNodeCache().get(`rbc.old-pk_${date}`) as string | undefined;
    }

    // Middlewares
    // Middlewares
    // Middlewares
    // Middlewares
    // Middlewares
    // Middlewares


    /**
     * Middleware para revisar el token en la cabecera (usando Bearer token)
     * @param req 
     * @param res 
     * @param next 
     */
    static verifyToken(req, res, next) {
        // console.log("verificar token")
        const bearerHeader = req.headers['authorization'];
        if (typeof bearerHeader !== 'undefined') {
            const bearerToken = bearerHeader.split(' ')[1];
            req.token = bearerToken;
            next();
        } else {
            res.status(403).json(Response.build(Message.Failure.TOKEN_FORBIDDEN, 403, false))
        }
    }

    /**
     * Middleware para revisar el token en las cookies
     * @param req 
     * @param res 
     * @param next 
     */
    static verifyCookieToken(req, res, next) {
        // console.log("llego")

        // Obtener el token de las cookies
        const cookieToken = req.cookies['booking.rbc.token'];

        // console.log("cookieToken", cookieToken)
        if (cookieToken) {
            req.token = cookieToken;
            next();
        } else {
            res.status(403).json(Response.build(Message.Failure.TOKEN_FORBIDDEN, 403, false));
        }
    }

}