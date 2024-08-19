import prisma from "../../lib/prisma";
import { NotificationService } from "../../services/@database/notification/notification.service";
import { JWTService } from "../../services/jwt/jwt.service";

export class NotificationController {
    public notificationService: NotificationService;
    public jwtService: JWTService;

    constructor() {
        this.jwtService = JWTService.instance;
        this.notificationService = new NotificationService();
    }

    // getAllNotificationV2 = async (req, res) => {
    //     try {

    //         const token = req.token;
    //         const decode = await JWTService.instance.verify(token);

    //         if (!decode.idUser) {
    //             throw new Error("No se proporcionó el ID de usuario");
    //         }

    //         const idUser = decode.idUser;


    //         const pagination = req.body.pagination;
    //         const result = await this.notificationService.getAllV2(pagination, idUser);

    //         res.status(200).json({ message: "Usuarios baneados encontrados", ok: true, item: result });

    //     } catch (err: any) {
    //         console.error(err);
    //         res.status(500).json({ message: err.message });
    //     }
    // }

    // // Recibe todos los id
    // getAllId = async (req, res) => {
    //     try {
    //         const { reasonForDesactivation } = req.body;
    //         const token = req.token;
    //         await this.jwtService.verify(token);

    //         if (!reasonForDesactivation) {
    //             throw new Error("No se proporcionó el motivo de desactivación de rows");
    //         }


    //         if (!Array.isArray(reasonForDesactivation)) {
    //             throw new Error("El motivo de desactivación debe ser un array");
    //         }

    //         // Agrupar los filtros por clave
    //         const filtersGroupedByKeys = reasonForDesactivation.reduce((acc, filter) => {
    //             (acc[filter.key] = acc[filter.key] || []).push(filter.value);
    //             return acc;
    //         }, {});

    //         // Construir la cláusula where para Prisma
    //         let whereClause = {
    //             deletedDate: null,
    //             AND: [],
    //         };

    //         for (let key in filtersGroupedByKeys) {
    //             // Para cada clave, agregamos una condición NOT IN
    //             whereClause.AND.push({
    //                 NOT: {
    //                     [key]: {
    //                         in: filtersGroupedByKeys[key],
    //                     },
    //                 },
    //             });
    //         }

    //         // Realizar la consulta con Prisma
    //         const result = await prisma.notification.findMany({
    //             where: whereClause,
    //             select: { id: true },
    //         });

    //         res.status(200).json({ message: "Consulta realizada correctamente", ok: true, item: result });
    //     } catch (err: any) {
    //         console.error(err);
    //         res.status(500).json({ message: err.message });
    //     }
    // };


    // // Método para obtener un usuario baneado por ID
    // getNotificationById = async (req, res) => {
    //     try {
    //         const { id } = req.params;
    //         const token = req.token;
    //         await this.jwtService.verify(token);

    //         const result = await this.notificationService.getById(id);

    //         res.status(200).json({ message: "Registro encontrado", ok: true, item: result });

    //     } catch (err: any) {
    //         console.error(err);
    //         res.status(500).json({ message: err.message });
    //     }
    // }

    // updateNotification = async (req, res) => {
    //     try {
    //         const { id } = req.params;
    //         const token = req.token;
    //         await this.jwtService.verify(token);

    //         const body = req.body;

    //         console.log(id, body)
    //         const result = await this.notificationService.update(Number(id), body);

    //         res.status(200).json({ message: "Registro actualizado correctamente", ok: true, item: result });

    //     } catch (err: any) {
    //         console.error(err);
    //         res.status(500).json({ message: err.message });
    //     }
    // }

    // markAllAsRevised = async (req, res) => {
    //     try {

    //         const token = req.token;
    //         const decode = await JWTService.instance.verify(token);

    //         if (!decode.idUser) {
    //             throw new Error("No se proporcionó el ID de usuario");
    //         }

    //         const idUser = decode.idUser;

    //         const result = await this.notificationService.markAllAsRevised(idUser);

    //         res.status(200).json({ message: "Actualización completada", ok: true, item: result });

    //     } catch (err: any) {
    //         console.error(err);
    //         res.status(500).json({ message: err.message });
    //     }
    // }

    // // Método para eliminar un usuario baneado
    // deleteNotification = async (req, res) => {
    //     try {
    //         const { idList, action } = req.body;
    //         const token = req.token;
    //         await this.jwtService.verify(token);

    //         if (!idList || idList.length === 0) {
    //             throw new Error("No se proporcionaron IDs para eliminar");
    //         }

    //         const result = await this.notificationService.deleteMultiple(idList, action);

    //         res.status(200).json({ message: "Registro eliminado correctamente", ok: true });

    //     } catch (err: any) {
    //         console.error(err);
    //         res.status(500).json({ message: err.message });
    //     }
    // }


    // updateNotificationUser = async (req, res) => {
    //     try {
    //         const { id } = req.params;
    //         const token = req.token;
    //         await this.jwtService.verify(token);

    //         const body = req.body;

    //         const result = await this.notificationService.updateNotificationUser(Number(id), body);

    //         res.status(200).json({ message: "Registro actualizado correctamente", ok: true, item: result });

    //     } catch (err: any) {
    //         console.error(err);
    //         res.status(500).json({ message: err.message });
    //     }
    // }


}