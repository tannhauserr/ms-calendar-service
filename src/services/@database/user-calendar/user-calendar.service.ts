// import { Prisma, UserCalendar, UserService } from "@prisma/client";
import prisma from "../../../lib/prisma";
import CustomError from "../../../models/custom-error/CustomError";
import { UtilGeneral } from "../../../utils/util-general";

export class UserCalendarService {
    constructor() { }

    // async addUserCalendar(item: any): Promise<{
    //     id: number;
    //     idUserFk: string;
    //     idCalendarFk: number;
    //     createdDate: Date;
    //     updatedDate: Date;
    //     calendar: { id: number; name: string; idGoogleCalendar: string }
    // }> {
    //     try {

    //         console.log("creando, idUserFk", item.idUserFk);
    //         console.log("creando, idCalendarFk", item.idCalendarFk);
    //         // Verifica si ya existe un registro con esa combinación
    //         const existingRecord = await prisma.userCalendar.findUnique({
    //             select: {
    //                 id: true,
    //                 idUserFk: true,
    //                 idCalendarFk: true,
    //                 createdDate: true,
    //                 updatedDate: true,
    //                 calendar: {
    //                     select: {
    //                         id: true,
    //                         name: true,
    //                         idGoogleCalendar: true,
    //                     }
    //                 }
    //             },
    //             where: {
    //                 idUserFk_idCalendarFk: {
    //                     idUserFk: item.idUserFk,
    //                     idCalendarFk: item.idCalendarFk,
    //                 },
    //             },
    //         });

    //         // Si ya existe, devuelve el registro existente
    //         if (existingRecord) {
    //             new CustomError(
    //                 'UserCalendarService.addUserCalendar',
    //                 new Error('El usuario ya está asociado a este calendario.'),
    //                 'simple'
    //             );
    //             return existingRecord;
    //         }

    //         // Si no existe, crea el nuevo registro
    //         const newRecord = await prisma.userCalendar.create({
    //             data: {
    //                 idUserFk: item.idUserFk,
    //                 idCalendarFk: item.idCalendarFk,
    //                 emailGoogle: item.emailGoogle,
    //                 createdDate: new Date(),
    //                 updatedDate: new Date(),
    //             },
    //             select: {
    //                 id: true,
    //                 idUserFk: true,
    //                 idCalendarFk: true,
    //                 createdDate: true,
    //                 updatedDate: true,
    //                 calendar: {
    //                     select: {
    //                         id: true,
    //                         name: true,
    //                         idGoogleCalendar: true,
    //                     }
    //                 }
    //             }
    //         });

    //         return newRecord;
    //     } catch (error: any) {
    //         throw new CustomError('UserCalendarService.addUserCalendar', error);
    //     }
    // }



    // async getById(id: any): Promise<UserCalendar | null> {
    //     try {
    //         return await prisma.userCalendar.findUnique({
    //             where: { id: id },
    //         });
    //     } catch (error: any) {
    //         throw new CustomError('UserCalendarService.getById', error);
    //     }
    // }


    // async getByIdUser(idUserFk: any) {
    //     try {
    //         return await prisma.userCalendar.findMany({
    //             select: {
    //                 id: true,
    //                 idUserFk: true,
    //                 idCalendarFk: true,
    //                 calendar: {
    //                     select: {
    //                         id: true,
    //                         name: true,
    //                         idGoogleCalendar: true,
    //                     }
    //                 }
    //             },
    //             where: { idUserFk },
    //         });
    //     } catch (error: any) {
    //         throw new CustomError('UserCalendarService.getById', error);
    //     }
    // }


    // async getByIdCalendar(idCalendarFk: any) {
    //     try {
    //         return await prisma.userCalendar.findMany({
    //             select: {
    //                 id: true,
    //                 idUserFk: true,
    //                 idCalendarFk: true,
    //                 calendar: {
    //                     select: {
    //                         id: true,
    //                         name: true,
    //                         idGoogleCalendar: true,
    //                     }
    //                 }
    //             },
    //             where: { idCalendarFk },
    //         });
    //     } catch (error: any) {
    //         throw new CustomError('UserCalendarService.getById', error);
    //     }
    // }


    // async getByIdCalendarAndIdUser(idCalendarFk: any, idUserFk: any) {
    //     try {
    //         return await prisma.userCalendar.findUnique({
    //             select: {
    //                 id: true,
    //                 idUserFk: true,
    //                 idCalendarFk: true,
    //                 calendar: {
    //                     select: {
    //                         id: true,
    //                         name: true,
    //                         idGoogleCalendar: true,
    //                     }
    //                 }
    //             },
    //             where: {
    //                 idUserFk_idCalendarFk: {
    //                     idUserFk: idUserFk,
    //                     idCalendarFk: idCalendarFk,
    //                 },
    //             },
    //         });
    //     } catch (error: any) {
    //         throw new CustomError('UserCalendarService.getById', error);
    //     }
    // }


    // async getByIdCalendarAndEmailGoogle(idCalendarFk: any, emailGoogle: any) {
    //     try {
    //         return await prisma.userCalendar.findFirst({
    //             select: {
    //                 id: true,
    //                 idUserFk: true,
    //                 idCalendarFk: true,
    //                 calendar: {
    //                     select: {
    //                         id: true,
    //                         name: true,
    //                         idGoogleCalendar: true,
    //                     }
    //                 }
    //             },
    //             where: {
    //                 emailGoogle,
    //                 idCalendarFk: idCalendarFk,
    //             },
    //         });
    //     } catch (error: any) {
    //         throw new CustomError('UserCalendarService.getById', error);
    //     }
    // }

    // async updateUserCalendar(item: UserService): Promise<UserCalendar> {
    //     try {
    //         const id = item.id as number;
    //         delete item.id;

    //         return await prisma.userCalendar.update({
    //             where: { id: id },
    //             data: {
    //                 ...item,
    //                 updatedDate: new Date(),
    //             },
    //         });
    //     } catch (error: any) {
    //         throw new CustomError('UserCalendarService.updateUserCalendar', error);
    //     }
    // }

    // // async deleteUserCalendarMassive(idList: any[], idCalendar: any) {
    // //     try {

    // //         let idCalendarFk = idCalendar ? { idCalendarFk: idCalendar } : {};

    // //         const value = await prisma.userCalendar.deleteMany({
    // //             where: {
    // //                 idUserFk: {
    // //                     in: idList
    // //                 },
    // //                 ...idCalendarFk
    // //             },
    // //         });

    // //         return value;

    // //     } catch (error: any) {
    // //         throw new CustomError('UserCalendarService.deleteUserCalendar', error);
    // //     }
    // // }

    // /**
    //  * Elimina todos los usuarios de un calendario
    //  * @param idCalendarFk 
    //  * @returns 
    //  */
    // async deleteAllUserCalendarByCalendar(idCalendarFk: any) {
    //     try {

    //         const value = await prisma.userCalendar.deleteMany({
    //             where: {
    //                 idCalendarFk
    //             },
    //         });

    //         return value;

    //     } catch (error: any) {
    //         throw new CustomError('UserCalendarService.deleteUserCalendar', error);
    //     }
    // }

    // async deleteUserCalendar(id: any) {
    //     try {

    //         const value = await prisma.userCalendar.delete({
    //             where: {
    //                 id: id
    //             },
    //         });
    //         return value;

    //     } catch (error: any) {
    //         throw new CustomError('UserCalendarService.deleteUserCalendar', error);
    //     }
    // }

    // async deleteByIdCalendarAndUser(idCalendarFk: any, idUserFk: any) {
    //     try {

    //         console.log("estoy en deleteByIdCalendarAndUser", idCalendarFk, idUserFk);
    //         const value = await prisma.userCalendar.delete({
    //             where: {
    //                 idUserFk_idCalendarFk: {
    //                     idUserFk: idUserFk,
    //                     idCalendarFk: idCalendarFk,
    //                 },
    //             },
    //         });
    //         return value;
    //     } catch (error: any) {
    //         throw new CustomError('UserCalendarService.deleteUserCalendar', error);
    //     }
    // }


}
