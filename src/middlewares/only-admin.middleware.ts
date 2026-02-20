import { NextFunction, Request, Response as ExpressResponse } from "express";
import { JWTService } from "../services/jwt/jwt.service";
import { RedisStrategyFactory } from '../services/@redis/cache/strategies/redisStrategyFactory';
import { UserCompanyRoleStrategy } from "../services/@redis/cache/strategies/userCompanyRole/userCompanyRoleStrategy";
import { Response as ResponseMessage } from "../models/messages/response";
import { MiddlewareErrorKey, resolveMiddlewareError } from "../models/error-codes";

type AuthRequest = Request & { token?: string };

export class OnlyAdminMiddleware {
    private static sendError(
        res: ExpressResponse,
        status: number,
        key: MiddlewareErrorKey,
        overrideMessage?: string
    ) {
        const error = resolveMiddlewareError(key, overrideMessage);
        return res.status(status).json(
            ResponseMessage.build(error.message, status, false, null, error.code)
        );
    }



    /**
     * Middleware que utiliza el RPC para validar el rol del usuario.
     * Extrae de la petición el token (que ya debe haber sido verificado en un middleware previo),
     * y de este se obtiene role, idUser e idCompanySelected.
     *
     * Llama al servicio RPC para verificar que el usuario tiene el rol adecuado.
     * Si la verificación falla, retorna error 400; si hay error en el proceso, retorna 500.
     *
     * @param req Express Request (debe tener en req.token el token JWT)
     * @param res Express Response
     * @param next Función next de Express
     */
    static accessAuthorized = async (req: AuthRequest, res: ExpressResponse, next: NextFunction) => {
        try {
            const token = req.token;
            const decode = await JWTService.instance.verify(token);
            const { role, idUser, idCompanySelected } = decode;


            const roleSystemAllowed = ['ROLE_SUPER_ADMIN', 'ROLE_DEVELOPER', "ROLE_SUPPORT"];
            // Obtenemos la estrategia de Redis para gestionar el rol del usuario
            const FACTORY = RedisStrategyFactory.getStrategy('userCompanyRole') as UserCompanyRoleStrategy;

            // Consultamos en Redis si existe el registro del usuario
            const cachedUserRole = await FACTORY.getUserCompanyRole(idUser);
            // console.log("cacheUserRole", cachedUserRole);
            if (cachedUserRole) {
                // Si existe, validamos que coincida con los valores actuales
                if (cachedUserRole.roleType !== role || cachedUserRole.idCompany !== idCompanySelected) {

                    if (roleSystemAllowed.includes(role)) {
                        next();
                        return;
                    } else {
                        // LOG: Se podría registrar un log con idUser, role e idCompanySelected que intentó acceder
                        return this.sendError(
                            res,
                            400,
                            "AUTH_CACHE_ROLE_MISMATCH",
                            "No tienes permisos para realizar esta acción (datos en cache no coinciden)"
                        );
                    }

                } else if (cachedUserRole.isReal) {
                    // Si es un registro válido, continuamos
                    next();
                    return;
                }
            } else {
                // Si no está en Redis, lo guardamos para futuras consultas

            }

            // TODO: Ya no se usa el RPC
            // Llamamos al RPC para validar el rol del usuario en la base de datos
            // const { isValid, message } = await checkUserRoleRpc(idUser, role, idCompanySelected);
            // const isValid = roleSystemAllowed.includes(role) ? true : false;
            // FACTORY.setUserCompanyRole(idUser, idCompanySelected, role, isValid, TIME_SECONDS.MINUTE * 20);

            // if (!isValid) {
            //     // LOG: Se podría registrar un log con idUser, role e idCompanySelected que intentó acceder
            //     res.status(400).json({ message: "[AUTH_002] No tienes permisos para realizar esta acción" });
            //     return;
            // }

            // Si la verificación es exitosa, se procede al siguiente middleware o controlador
            next();
        } catch (err) {
            console.error("[accessAuthorized] Error:", err);
            return this.sendError(
                res,
                500,
                "AUTH_ACCESS_AUTHORIZED_FAILURE",
                "Hubo un error al procesar el token o verificar el rol"
            );
        }
    };







    /**
     * Coge el token guardado en request gracias al middleware JWTService.authCookieOrBearer 
     * y comprueba si el usuario es administrador
     * @param req 
     * @param res 
     * @param next 
     * @returns 
     */
    static accessOnlyAdmin = async (req: AuthRequest, res: ExpressResponse, next: NextFunction) => {
        try {
            const token = req.token;
            const decode = await JWTService.instance.verify(token);
            if (decode.role !== 'ROLE_DEVELOPER' && decode.role !== "ROLE_SUPPORT") {
                if (decode.role !== 'ROLE_OWNER' && decode.role !== 'ROLE_ADMIN') {
                    return this.sendError(
                        res,
                        400,
                        "AUTH_ADMIN_REQUIRED",
                        "No tienes permisos para realizar esta acción"
                    );
                }
            }
            next();
        }
        catch (err) {
            console.error(err);
            return this.sendError(res, 500, "AUTH_TOKEN_VALIDATION_FAILED", "Hubo un error al enviar el token");
        }
    };

    static accessOnlyAdminOrManager = async (req: AuthRequest, res: ExpressResponse, next: NextFunction) => {
        try {
            const token = req.token;
            const decode = await JWTService.instance.verify(token);
            if (decode.role !== 'ROLE_DEVELOPER' && decode.role !== "ROLE_SUPPORT") {

                if (decode.role !== 'ROLE_OWNER' && decode.role !== 'ROLE_ADMIN' && decode.role !== 'ROLE_MANAGER') {
                    return this.sendError(
                        res,
                        400,
                        "AUTH_ADMIN_OR_MANAGER_REQUIRED",
                        "No tienes permisos para realizar esta acción"
                    );
                }
            }
            next();
        }
        catch (err) {
            console.error(err);
            return this.sendError(res, 500, "AUTH_TOKEN_VALIDATION_FAILED", "Hubo un error al enviar el token");
        }
    };

    static accessOnlyAdminOrManagerOrUser = async (req: AuthRequest, res: ExpressResponse, next: NextFunction) => {
        try {
            const token = req.token;
            const decode = await JWTService.instance.verify(token);

            // El id del objeto a editar siempre tiene que ser llamadoi "id" o "idUser"
            const object = req.body;

            // console.log(decode)

            // console.log(object)

            console.log('myId:', object?.myId, 'Type:', typeof object?.myId);
            console.log('idUser:', decode.idUser, 'Type:', typeof decode.idUser);
            console.log(decode.idUser, typeof decode.idUser, object.myId, typeof object.myId);

            if (decode.role !== 'ROLE_DEVELOPER' && decode.role !== "ROLE_SUPPORT") {

                if ((decode.role !== 'ROLE_OWNER' && decode.role !== 'ROLE_ADMIN') && object?.myId !== decode.idUser) {
                    // LOG: Mandar petición log de que no tiene permisos para realizar esta acción
                    return this.sendError(
                        res,
                        400,
                        "AUTH_MANAGER_OR_OWNER_OR_SELF_REQUIRED",
                        "No tienes permisos para realizar esta acción"
                    );
                } else if (decode.role !== 'ROLE_OWNER' && decode.role !== 'ROLE_ADMIN' && decode.role !== 'ROLE_MANAGER') {
                    // LOG: Mandar petición log de que no tiene permisos para realizar esta acción
                    return this.sendError(
                        res,
                        400,
                        "AUTH_MANAGER_OR_OWNER_REQUIRED",
                        "No tienes permisos para realizar esta acción"
                    );
                }
            }

            console.log("Pasa el middleware");

            next();
        }
        catch (err) {
            console.log("Error en el middleware");
            console.error(err);
            return this.sendError(res, 500, "AUTH_TOKEN_VALIDATION_FAILED", "Hubo un error al enviar el token");
        }
    }

    static accessOnlyAdminOrUser = async (req: AuthRequest, res: ExpressResponse, next: NextFunction) => {
        try {
            const token = req.token;
            const decode = await JWTService.instance.verify(token);

            // El id del objeto a editar siempre tiene que ser llamadoi "id" o "idUser"
            const object = req.body;

            // console.log(decode)

            // console.log(object)

            console.log('myId:', object?.myId, 'Type:', typeof object?.myId);
            console.log('idUser:', decode.idUser, 'Type:', typeof decode.idUser);
            console.log(decode.idUser, typeof decode.idUser, object.myId, typeof object.myId);

            if (decode.role !== 'ROLE_DEVELOPER' && decode.role !== "ROLE_SUPPORT") {
                if (decode.role !== 'ROLE_OWNER' && decode.role !== 'ROLE_ADMIN' && object?.myId !== decode.idUser) {
                    return this.sendError(
                        res,
                        400,
                        "AUTH_ADMIN_OR_SELF_REQUIRED",
                        "No tienes permisos para realizar esta acción"
                    );
                }
            }
            next();
        }
        catch (err) {
            console.error(err);
            return this.sendError(res, 500, "AUTH_TOKEN_VALIDATION_FAILED", "Hubo un error al enviar el token");
        }
    }


    static allowRoles = (permittedRoles: string[], mustMatchUser = false) => {
        return async (req: AuthRequest, res: ExpressResponse, next: NextFunction) => {
            try {
                const token = req.token;
                const decode = await JWTService.instance.verify(token);

                // Si developer o support tienen permiso global
                if (decode.role === 'ROLE_DEVELOPER' || decode.role === 'ROLE_SUPER_ADMIN' || decode.role === 'ROLE_SUPPORT') {
                    return next();
                }

            
                // Si no está dentro de los roles permitidos, 403
                if (!permittedRoles.includes(decode.role)) {
                    return this.sendError(
                        res,
                        403,
                        "AUTH_ROLE_NOT_ALLOWED",
                        "No tienes permisos para esta acción"
                    );
                }

                // Si este middleware requiere que el usuario sea dueño de su recurso...
                if (mustMatchUser) {
                    // Verificar que exista myId
                    if (!req.body?.myId) {
                        return this.sendError(
                            res,
                            400,
                            "AUTH_MY_ID_REQUIRED",
                            "El campo 'myId' es obligatorio"
                        );
                    }
                    // Comparar
                    if (req.body.myId !== decode.idUser) {
                        return this.sendError(
                            res,
                            403,
                            "AUTH_MY_ID_MISMATCH",
                            "No puedes operar sobre un ID que no sea el tuyo"
                        );
                    }
                }

                // Si todo bien...
                next();
            } catch (err) {
                console.error(err);
                return this.sendError(
                    res,
                    500,
                    "AUTH_TOKEN_VALIDATION_FAILED",
                    "Hubo un error al validar el token"
                );
            }
        };
    };


}
