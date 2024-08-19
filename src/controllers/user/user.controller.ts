import prisma from "../../lib/prisma";
import { Response } from "../../models/messages/response";
import { UserService } from "../../services/@database/user.service";
import { JWTService } from "../../services/jwt/jwt.service";
import { UtilGeneral } from "../../utils/util-general";

export class UserController {

    public userService: UserService;
    public jwtService: JWTService;

    constructor() {
        this.userService = new UserService();
        this.jwtService = JWTService.instance;
    }













    public add = async (req: any, res: any, next: any) => {
        try {
            const body = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.userService.add(body)
            // console.log(result)
            res.status(200).json(Response.build("Registros creado", 200, true, result));
        } catch (err: any) {
            if (err?.message === "Clave privada no disponible") {
                res.status(500).json({ message: "Clave privada no disponible" });
            } else {
                res.status(500).json({ message: err.message });
            }
        }
    }

    get = async (req, res) => {
        try {
            const { pagination } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.userService.get(pagination);

            res.status(200).json({ message: "Usuarios encontrados", ok: true, item: result });

        } catch (err: any) {
            console.error(err)
            if (err?.message === "Clave privada no disponible") {
                res.status(500).json({ message: "Clave privada no disponible" });
            } else {
                res.status(500).json({ message: err.message });
            }
        }
    }

    public getById = async (req: any, res: any, next: any) => {
        try {
            const body = req.body;
            const token = req.token;
            await this.jwtService.verify(token);
            const { id } = req.params;

            const result = await this.userService.getById(id);
            res.status(200).json(Response.build("Registro encontrado", 200, true, result));
        } catch (err: any) {
            // console.log(err);
            console.log(err.message)
            if (err?.message === "Clave privada no disponible") {
                res.status(500).json({ message: "Clave privada no disponible" });
            } else {
                res.status(500).json({ message: err.message });
            }
        }
    }

    // Recibe todos los id
    getAllId = async (req, res) => {
        try {
            const { reasonForDesactivation } = req.body;
            const tokenFromPlatform = req.tokenFromPlatform;
            await this.jwtService.verify(tokenFromPlatform);

            if (!reasonForDesactivation) {
                throw new Error("No se proporcionó el motivo de desactivación de rows");
            }

            if (!Array.isArray(reasonForDesactivation) || !reasonForDesactivation.length) {
                throw new Error("El motivo de desactivación debe ser un array no vacío");
            }

            // Agrupar los filtros por clave
            const filtersGroupedByKeys = reasonForDesactivation.reduce((acc, filter) => {
                (acc[filter.key] = acc[filter.key] || []).push(filter.value);
                return acc;
            }, {});

            // Construir la cláusula where para Prisma
            let whereClause = {
                deletedDate: null,
                AND: [],
            };

            for (let key in filtersGroupedByKeys) {
                // Para cada clave, agregamos una condición NOT IN
                whereClause.AND.push({
                    NOT: {
                        [key]: {
                            in: filtersGroupedByKeys[key],
                        },
                    },
                });
            }

            // Realizar la consulta con Prisma
            const result = await prisma.user.findMany({
                where: whereClause,
                select: { id: true },
            });

            res.status(200).json({ message: "Consulta realizada correctamente", ok: true, items: result });
        } catch (err: any) {
            console.error(err);
            res.status(500).json({ message: err.message });
        }
    };


    public update = async (req: any, res: any, next: any) => {
        try {
            const body = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            console.log("que es body", body)

            const result = await this.userService.update(body)
            console.log(result)
            res.status(200).json(Response.build("Registro actualizado", 200, true, result));
        } catch (err: any) {
            console.log("error11212");
            console.log(err);
            if (err?.message === "Clave privada no disponible") {
                res.status(500).json({ message: "Clave privada no disponible" });
            } else {
                res.status(500).json({ message: err.message });
            }
        }
    }


    public delete = async (req: any, res: any, next: any) => {
        try {
            const body = req.body;
            const token = req.token;
            await this.jwtService.verify(token);
            const result = await this.userService.deleteMultiple(body.idList, body.action)

            res.status(200).json(Response.build("Registro borrado", 200, true, result));
        } catch (err: any) {
            if (err?.message === "Clave privada no disponible") {
                res.status(500).json({ message: "Clave privada no disponible" });
            } else {
                res.status(500).json({ message: err.message });
            }
        }
    }


    getUserListForPromotionPage = async (req, res, next) => {
        try {
            const token = req.token;
            const { idUserList } = req.body;

            console.log("idProductList", idUserList)
            console.log("body", req.body)

            await this.jwtService.verify(token);

            const result = await this.userService.getUserListForPromotionPage(idUserList);
            res.status(200).json({ message: "Productos encontrados", ok: true, item: result });
        } catch (err: any) {
            console.error(err);
            res.status(500).json({ message: err.message });
        }
    }


    // public checkPassword = async (req, res) => {
    //     try {
    //         const { password, id } = req.body;
    //         const token = req.token;

    //         // Verificación del token omitida para simplificar
    //         // const decode = await auth.verify(token);

    //         if (password !== undefined && id) {
    //             const passEncrypt = UtilGeneral.createHashPassword(password);
    //             const user = await prisma.user.findUnique({
    //                 where: {
    //                     id: id,
    //                     deletedDate: null,
    //                     password: passEncrypt,
    //                 },
    //                 select: {
    //                     id: true,
    //                     password: true,
    //                 }
    //             });

    //             const isValid = user && user.password === passEncrypt;
    //             res.status(200).json({
    //                 message: "Comprobación completada",
    //                 ok: true,
    //                 item: isValid,
    //             });
    //         } else {
    //             res.status(404).json({
    //                 message: "No se han entregado las opciones necesarias para la comprobación",
    //                 ok: false,
    //                 item: false,
    //             });
    //         }
    //     } catch (err) {
    //         console.error("Error en checkPassword:", err);
    //         res.status(500).json({ message: "Error interno del servidor", success: false });
    //     }
    // };


    public checkPassword = async (req, res) => {
        try {
            const { password, id } = req.body;
            const token = req.token;

            // Verificación del token omitida para simplificar
            // const decode = await auth.verify(token);
            console.log("mira el id", id)
            console.log("mira el password", password)

            if (!password || !id) {
                return res.status(200).json({
                    message: "Faltan credenciales para la comprobación.",
                    ok: false,
                    item: false,
                });
            }

            const user = await prisma.user.findUnique({
                where: { id: id, deletedDate: null },
                select: { password: true },
            });

            // Si no se encuentra el usuario, o está marcado como eliminado
            if (!user) {
                return res.status(404).json({
                    message: "Usuario no encontrado o eliminado.",
                    ok: false,
                    item: false,
                });
            }

            const isValid = await UtilGeneral.compareHashPassword(password, user.password);

            return res.status(200).json({
                message: "Comprobación de contraseña exitosa.",
                ok: true,
                item: isValid,
            });
        } catch (err) {
            console.error("Error en checkPassword:", err);
            res.status(500).json({ message: "Error interno del servidor", success: false });
        }
    };

    public checkUsername = async (req, res) => {
        try {
            let { id, email } = req.body;

            console.log("mira el id", id)
            console.log("mira el email", email)

            id = id ?? 0;

            if (email) {
                const user = await prisma.user.findFirst({
                    where: {
                        id: { not: id },
                        deletedDate: null,
                        email: email,

                    },
                    select: { id: true },
                });

                const exists = !!user;
                res.status(200).json({
                    message: "Comprobación completada",
                    ok: true,
                    item: exists, // Si el usuario existe, devolveremos false
                });
            } else {
                res.status(404).json({
                    message: "No se han entregado las opciones necesarias para la comprobación",
                    success: false,
                });
            }
        } catch (err) {
            console.error("Error en checkUsername:", err);
            res.status(500).json({ message: "Error interno del servidor", success: false });
        }
    };



    public autocompleteBack = async (req: any, res: any, next: any) => {
        try {
            const { query, field, itemsPerPage } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            if (!query || !field || !itemsPerPage) {
                return res.status(400).json({ message: "Faltan parámetros necesarios para la búsqueda", ok: false });
            }

            const results = await prisma.user.findMany({
                where: {
                    [field]: {
                        contains: query,
                        mode: 'insensitive',
                    },
                    deletedDate: null,
                },
                take: itemsPerPage,
                select: { id: true, [field]: true },
            });

            res.status(200).json({ message: "Búsqueda completada", ok: true, item: results });
        } catch (err: any) {
            console.error("Error en autocompleteBack:", err);
            res.status(500).json({ message: err.message });
        }
    };


}