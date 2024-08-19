import { Prisma } from "@prisma/client";
import prisma from "../../../lib/prisma";
import CustomError from "../../../models/custom-error/CustomError";
import { Pagination } from "../../../models/pagination";
import { getGeneric } from "../../../utils/get-genetic/getGenetic";


export class NotificationService {




    // async getAllV2(pagination: Pagination, idUser: any) {
    //     try {


    //         let select: Prisma.NotificationSelect = {};
    //         select = {
    //             id: true,
    //             title: true,
    //             message: true,
    //             email: true,
    //             replyto: true,
    //             cc: true,
    //             bcc: true,
    //             priority: true,
    //             sent: true,
    //             trying: true,
    //             leadJson: true,
    //             notificationType: true,
    //             createdDate: true,
    //             updatedDate: true,
    //             deletedDate: true,
    //             notificationUsers: {
    //                 select: {
    //                     id: true,
    //                     idUserFk: true,
    //                     revised: true,
    //                 },
    //                 where: {
    //                     idUserFk: idUser,
    //                 }
    //             }
    //         }

    //         // filters?: {
    //         //     [key: string]: {
    //         //       value: any | any[];
    //         //       relation?: string; 
    //         //     };
    //         //   };



    //         /**
    //          * La versión de plataforma solo devuelve las rutas creadas por el usuario
    //          */
    //         pagination.filters = {
    //             ...pagination.filters,
    //             // idUserFk: {
    //             //     value: idUser,
    //             //     relation: "notificationUsers",
    //             //     relationType: "some"
    //             // }
    //         }

    //         pagination.orderBy = pagination.orderBy || { field: "id", order: "desc" };


    //         console.log("mirta esta es la paginacion 88");
    //         console.log(pagination);

    //         const result = await getGeneric(pagination, "notification", select);
    //         return result;
    //     } catch (error: any) {
    //         throw new CustomError('NotificationService.getAll', error);
    //     }
    // }

    // async getById(id: number) {
    //     try {
    //         let select: Prisma.NotificationSelect = {
    //             id: true,

    //         };

    //         const result = await prisma.notification.findUnique({
    //             where: { id },
    //             // select,
    //         });
    //         return result;
    //     } catch (error: any) {
    //         throw new CustomError('NotificationService.getById', error);
    //     }
    // }

    // async update(id: number, updateDetails: any) {
    //     try {
    //         delete updateDetails.id;
    //         const result = await prisma.notification.update({
    //             where: { id },
    //             data: updateDetails,
    //         });


    //         return result;
    //     } catch (error: any) {
    //         throw new CustomError('NotificationService.update', error);
    //     }
    // }

    // async deleteMultiple(ids: number[], deleteFlag: boolean = true): Promise<{ count: number }> {
    //     try {


    //         return await prisma.notification.updateMany({
    //             where: { id: { in: ids } },
    //             data: {
    //                 deletedDate: deleteFlag ? new Date() : null,
    //             },
    //         });
    //     } catch (error: any) {
    //         throw new CustomError('NotificationService.deleteMultiple', error);
    //     }
    // }


    // async markAllAsRevised(idUser: any): Promise<{ count: number }> {
    //     try {

    //         const result = await prisma.notificationUser.updateMany({
    //             where: { revised: false },
    //             data: { revised: true },
    //         });

    //         return result; // Devuelve el resultado de la operación
    //     } catch (error: any) {
    //         throw new CustomError('NotificationService.markAllAsRevised_NotificationUser', error);
    //     }
    // }

    // async updateNotificationUser(id: number, updateDetails: any) {
    //     try {
    //         delete updateDetails.id;
    //         const result = await prisma.notificationUser.update({
    //             where: { id },
    //             data: updateDetails,
    //         });


    //         return result;
    //     } catch (error: any) {
    //         throw new CustomError('NotificationService.update_NotificationUser', error);
    //     }
    // }


}