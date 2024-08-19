

import { User } from "@prisma/client";
import { Response } from "../../models/messages/response";
import { UserService } from "../../services/@database/user.service";
import { UtilGeneral } from "../../utils/util-general";
import prisma from "../../lib/prisma";


export class UserMiddleware {

    static checkUserAndPassword = async (req, res, next) => {
        try {
            // console.log(req.body)

            // const userAuthData = req.body as UserAuthData;
            // const { username, password } = userAuthData.authData;

            const body = req.body as User;
            const { email, password } = body;

            if (!email || !password) {
                res.status(400).json({ message: "Faltan datos" });
                return;
            }

            const userService = new UserService();
            const user: User = await userService.getByUsernameAndPassword(email, password);

            if (!user) {
                res.status(400).json({ message: "Usuario o contraseña incorrectos" });
                return;
            }

            if (user.isBlocked) {
                res.status(400).json({ message: "Usuario bloqueado" });
                return;
            }


            // console.log(user)
            req.user = user;
            next();
        } catch (err) {
            console.error(err)
            res.status(500).json({ message: "Hubo un error al enviar el token" });
        }
    }


    static async searchUserByUsername(req, res, next) {

        try {
            let userService: UserService
            userService = new UserService();
            // console.log(req.body)
            const existUsername = await userService.getByUsername(req.body.username);
            // console.log("que es existUsername aqui", existUsername)
            if (existUsername && existUsername.length > 0) {
                res.status(200).json(Response.build(`El usuario ${req.body.username} ya existe`, 200, false));
            } else {
                next();
            }
        } catch (e) {
            res.status(200).json(Response.build(e as any, 404, false));
        }
    }



    static async checkPassword(req, res, next) {
        try {
            const { password, idUser } = req.body;

            if (!password || !idUser) {
                return res.status(200).json({
                    message: "Faltan credenciales para la comprobación.",
                    ok: false,
                    item: false,
                });
            }

            const userService = new UserService();
            const isValid = await userService.checkPassword(idUser, password);

            if (!isValid) {
                return res.status(200).json({
                    message: "Contraseña incorrecta.",
                    ok: false,
                    item: false,
                });
            }

            next();
        } catch (err) {
            console.error("Error en checkPassword:", err);
            res.status(500).json({ message: "Error interno del servidor", success: false });
        }
    }

}