
import prisma from "../../lib/prisma";
import { Response } from "../../models/messages/response";
import { JWTService } from "../../services/jwt/jwt.service";
import { getMainDataForAppointmentFlow } from "../../utils/@flow/getMainDataForAppointmentFlow";
import * as InformationReservation from "../../models/rabbitmq/getCateroiesAndServicesResponse";



export class CheckCompanyMiddleware {


    /**
     * Comprueba si el idCompanyFk del establecimiento es igual al idCompanyFk que se manda desde el front
     * @param req 
     * @param res 
     * @param next 
     */
    static validateCompanyAccessInWorkspace = async (req: any, res: any, next: any) => {

        try {

            const { idWorkspace, idWorkspaceFk, idCompany, idCompanyFk } = req.body;

            const idWorkspaceAux = idWorkspaceFk || idWorkspace;
            const idCompanyAux = idCompanyFk || idCompany;

            let jwtService = JWTService.instance;

            // Obtiene el token de la solicitud
            const token = req.token;
            // Verifica y decodifica el token
            let decode = await jwtService.verify(token);
            // Extrae idCompanySelected del token decodificado
            const roleAllowed = ['ROLE_ADMIN', 'ROLE_MANAGER'];
            const roleSuperAdmin = ["ROLE_DEVELOPER", "ROLE_SUPER_ADMIN", "ROLE_SUPPORT"];

            console.log("decode", decode);
            const isAdmin = roleAllowed.includes(decode.role);
            const isSuperAdmin = roleSuperAdmin.includes(decode.role);

            const idCompanyInToken = decode?.idCompanySelected;
            const idUser = decode?.idUser;

            // const response: GetCategoriesAndServicesResponse = await getCategoriesServicesUserForFlow(idWorkspace);
            const response: InformationReservation.GetCategoriesAndServicesResponse = await getMainDataForAppointmentFlow(idWorkspaceAux);

            let existUser = response.users.find((user) => user.id === idUser);
            if (!existUser && !isSuperAdmin) {
                // Validar si el usuario es administrador y pertenece a la empresa
                if (isAdmin) {
                    if (response?.workspace?.idCompanyFk === idCompanyInToken) {
                        // LOG: Usuario administrador autorizado, pero no pertenece al establecimiento
                        // console.log("LOG: Usuario administrador, autorizado porque pertenece a la empresa.");
                    } else {
                        // LOG: Administrador no pertenece a la empresa
                        console.log("LOG: Administrador no pertenece a la compañía del establecimiento.");
                        return res.status(403).json(Response.build("Acceso denegado: el administrador no pertenece a la empresa.", 403, false));
                    }
                } else {
                    // LOG: Usuario regular que no pertenece al establecimiento
                    console.log("LOG: Usuario no pertenece al establecimiento.");
                    return res.status(404).json(Response.build("El usuario no pertenece al establecimiento", 404, false));
                }
            }


            let existRelationBetweenUserAndWorkspace = response.workspace.idCompanyFk === idCompanyInToken;
            console.log("companySelected", idCompanyInToken);
            console.log("que es idWorkspaceAux", idWorkspaceAux);
             console.log("mira que es el response flow", response);
            console.log("workspaces", response.workspace.id);
            console.log("idCompanyFk", response.workspace.idCompanyFk);
            console.log("existRelationBetweenUserAndWorkspace", existRelationBetweenUserAndWorkspace);

            if (!existRelationBetweenUserAndWorkspace) {
                // LOG: Mandar petición log de que el establecimiento no pertenece a la compañía
                return res.status(500).json(Response.build("El establecimiento no pertenece a la compañía", 404, false));
            }

            req.workspaceData = response;
            next();
        } catch (error: any) {
            // Si ocurre un error, responde con un mensaje de error del servidor
            return res.status(500).json({
                message: 'Error en el servidor.'
            });
        }


    }


    /**
     * Solo un usuario de la compañía puede acceder a los eventos de la compañía
     * @param req 
     * @param res 
     * @param next 
     * @returns 
     */
    /**
     * Middleware to check if the company exists in the event.
     * 
     * This middleware verifies if the `idCalendar` provided in the request body belongs to the company
     * associated with the JWT token. It also checks if the event belongs to the user if the user is not an admin or manager.
     * 
     * @param req - The request object containing the body with `idCalendarFk`, `idCalendar`, and `myId`.
     * @param res - The response object used to send back the appropriate response.
     * @param next - The next middleware function in the stack.
     * 
     * @returns A JSON response with an error message and status code if the checks fail, or calls the next middleware if successful.
     * 
     * @throws Will return a 500 status code with an error message if there is a server error.
     */
    static checkCompanyInEvent = async (req: any, res: any, next: any) => {
        // TODO: Esto se va a comprobar con un nuevo parámetro en el token del usuario
        // En este nuevo parámetro saldrán todos los workspaces a los que tiene acceso el usuario
        next();
        // try {
        //     // Extrae idCalendarFk, idCalendarAux y myId del cuerpo de la solicitud
        //     const { idCalendarFk, idCalendar: idCalendarAux, myId: string } = req.body;
        //     // Asigna idCalendarFk a idCalendar si existe, de lo contrario usa idCalendarAux
        //     let idCalendar = idCalendarFk || idCalendarAux;

        //     // Si no se proporciona idCalendar, responde con un error
        //     if (!idCalendar) {
        //         // LOG: Mandar petición log de que no se ha proporcionado el idCalendar
        //         return res.status(500).json(Response.build("El idCalendar no se proporcionó", 404, false));
        //     }

        //     // Obtiene una instancia del servicio JWT
        //     let jwtService = JWTService.instance;

        //     // Obtiene el token de la solicitud
        //     const token = req.token;
        //     // Verifica y decodifica el token
        //     let decode = await jwtService.verify(token);
        //     // Extrae idCompanySelected del token decodificado
        //     const idCompany = decode?.idCompanySelected;

        //     // Verifica si el calendario existe y pertenece a la compañía
        //     // const calendarExist = prisma.calendar.findFirst({
        //     //     where: {
        //     //         id: idCalendar,
        //     //         idCompanyFk: idCompany
        //     //     }
        //     // });

        //     // Si el calendario no existe o no pertenece a la compañía, responde con un error
        //     // if (!calendarExist) {
        //     //     // LOG: Mandar petición log de que el idCalendar no pertenece a la compañía
        //     //     return res.status(500).json(Response.build("El idCalendar no pertenece a la compañía", 404, false));
        //     // }

        //     // Si el rol del usuario no es 'ROLE_ADMIN' o 'ROLE_MANAGER'
        //     if (decode.role !== 'ROLE_OWNER' && decode.role !== 'ROLE_ADMIN' && decode.role !== 'ROLE_MANAGER') {
        //         // Verifica si el evento existe y pertenece al usuario
        //         const eventExist = prisma.event.findFirst({
        //             where: {
        //                 // idCalendarFk: idCalendar,
        //                 idWorkspaceFk
        //                 idUserPlatformFk: decode.idUser
        //             }
        //         });

        //         // Si el evento no pertenece al usuario, responde con un error
        //         if (!eventExist) {
        //             // LOG: Mandar petición log de que el evento no pertenece al usuario
        //             return res.status(500).json(Response.build("El evento no pertenece al usuario", 404, false));
        //         }
        //     }

        //     // Llama a la siguiente función middleware
        //     next();
        // } catch (error: any) {
        //     // Si ocurre un error, responde con un mensaje de error del servidor
        //     return res.status(500).json({
        //         message: 'Error en el servidor.'
        //     });
        // }
    }






}