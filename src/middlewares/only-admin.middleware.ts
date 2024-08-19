import { JWTService } from "../services/jwt/jwt.service";

export class OnlyAdminMiddleware {

    /**
     * Coge el token guardado en request gracias al middleware JWTService.verifyCookieToken 
     * y comprueba si el usuario es administrador
     * @param req 
     * @param res 
     * @param next 
     * @returns 
     */
    static accessOnlyAdmin = async (req, res, next) => {
        try {
            const token = req.token;
            const decode = await JWTService.instance.verify(token);
            if (decode.role !== 'ROLE_ADMIN') {
                res.status(400).json({ message: "No tienes permisos para realizar esta acción" });
                return;
            }
            next();
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ message: "Hubo un error al enviar el token" });
        }
    };

    static accessOnlyAdminOrUser = async (req, res, next) => {
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


            if (decode.role !== 'ROLE_ADMIN' && object?.myId !== decode.idUser) {
                res.status(400).json({ message: "No tienes permisos para realizar esta acción 222" });
                return;
            }
            next();
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ message: "Hubo un error al enviar el token" });
        }
    }


}