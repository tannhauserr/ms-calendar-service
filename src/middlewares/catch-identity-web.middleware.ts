import { NextFunction, Request, Response } from "express";



/**
 * Captura la identidad del usuario.
 * Es usado en la primera vez que el usuario accede a la aplicación
 */
export default class CatchIdentityWebMiddleware {

    constructor() { }

    /**
     * Solo es usado la primera vez que el usuario accende y recibe el token
     */
    static catch = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const ip = req.ip;
            const platform = 'WEB';
         

            next();
        } catch (e) {
            res.status(500).send({
                message: 'A error has occurred while trying to store the identity',
                error: e instanceof Error ? e.message : 'Unknown error'
            });
        }
    }
}