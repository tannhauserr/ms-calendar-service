import { Prisma, UserColor, UserService } from "@prisma/client";
import prisma from "../../../lib/prisma";
import CustomError from "../../../models/custom-error/CustomError";
import { RedisStrategyFactory } from "../../@redis/cache/strategies/redisStrategyFactory";
import { UserColorStrategy } from "../../@redis/cache/strategies/useColor/useColor.strategy";
import { UserColorCalendar } from "../../caledar-googleapi/interfaces/user-color-calendar";
import { TIME_SECONDS } from "../../../constant/time";
import { UtilGeneral } from "../../../utils/util-general";
import { Pagination } from "../../../models/pagination";

export class UserColorService {
    constructor() { }

    // async addUserColor(item: Prisma.UserColorCreateInput): Promise<UserColor> {
    //     try {
    //         return await prisma.userColor.create({
    //             data: {
    //                 ...item,
    //                 createdDate: new Date(),
    //                 updatedDate: new Date(),
    //             },
    //         });
    //     } catch (error: any) {
    //         throw new CustomError('UserColorService.addUserColor', error);
    //     }
    // }


    // async getUserColorSimple() {
    //     try {
    //         return await prisma.userColor.findMany({
    //             select: {
    //                 id: true,
    //                 idUserFk: true,
    //                 eventColorGoogle: {
    //                     select: {
    //                         id: true,
    //                         colorHex: true,
    //                         idColorGoogle: true,
    //                     }
    //                 }
    //             },
    //             orderBy: {
    //                 createdDate: 'desc',
    //             },
    //         });
    //     } catch (error: any) {
    //         throw new CustomError('UserColorService.getUserColor', error);
    //     }
    // }

    // async addUserColor(item: any): Promise<UserColorCalendar> {
    //     try {
    //         // Crea el color de usuario en la base de datos
    //         const newUserColor = await prisma.userColor.create({
    //             select: {
    //                 id: true,
    //                 idUserFk: true,
    //                 colorHex: true,
    //                 eventColorGoogle: {
    //                     select: {
    //                         id: true,
    //                         colorHex: true,
    //                         idColorGoogle: true,
    //                     }
    //                 }
    //             },
    //             data: {
    //                 ...item,
    //                 createdDate: new Date(),
    //                 updatedDate: new Date(),
    //             },
    //         });

    //         // Guarda la información en Redis
    //         const FACTORY = RedisStrategyFactory.getStrategy('userColor') as UserColorStrategy;
    //         await FACTORY.saveUserColorByIdUser(newUserColor.idUserFk, newUserColor);

    //         // Devuelve el resultado
    //         return newUserColor;
    //     } catch (error: any) {
    //         throw new CustomError('UserColorService.addUserColor', error);
    //     }
    // }

    // async getById(id: any): Promise<UserColor | null> {
    //     try {
    //         return await prisma.userColor.findUnique({
    //             where: { id: id },
    //         });
    //     } catch (error: any) {
    //         throw new CustomError('UserColorService.getById', error);
    //     }
    // }

    // async getUserColorByIdUser(idUserFk: string, useRedis?: boolean): Promise<UserColorCalendar> {
    //     try {


    //         const fn = async () => {
    //             return await prisma.userColor.findFirst({
    //                 select: {
    //                     id: true,
    //                     idUserFk: true,
    //                     colorHex: true,
    //                     eventColorGoogle: {
    //                         select: {
    //                             id: true,
    //                             colorHex: true,
    //                             idColorGoogle: true,
    //                         }
    //                     }
    //                 },
    //                 where: { idUserFk: idUserFk },
    //             });
    //         }
    //         const FACTORY = RedisStrategyFactory.getStrategy('userColor') as UserColorStrategy;

    //         if (useRedis) {
    //             const useColorRedis: UserColorCalendar = await FACTORY.getUserColorByIdUser(idUserFk);
    //             if (useColorRedis) {
    //                 return useColorRedis;
    //             } else {
    //                 const userColor = await fn();
    //                 if (userColor) {
    //                     await FACTORY.saveUserColorByIdUser(idUserFk, userColor, TIME_SECONDS.DAY * 2);
    //                 }
    //                 return userColor;
    //             }
    //         } else {
    //             const userColor = await fn();
    //             if (userColor) {
    //                 await FACTORY.saveUserColorByIdUser(idUserFk, userColor, TIME_SECONDS.DAY * 2);
    //             }
    //             return userColor;
    //         }


    //     } catch (error: any) {
    //         throw new CustomError('UserColorService.getUserColorByIdUser', error);
    //     }
    // }

    // async updateUserColor(item: UserService): Promise<any> {
    //     try {
    //         const id = item.id as number;
    //         delete item.id;

    //         const updatedUserColor = await prisma.userColor.update({
    //             select: {
    //                 id: true,
    //                 idUserFk: true,
    //                 colorHex: true,
    //                 eventColorGoogle: {
    //                     select: {
    //                         id: true,
    //                         colorHex: true,
    //                         idColorGoogle: true,
    //                     }
    //                 }
    //             },
    //             where: { id: id },
    //             data: {
    //                 ...item,
    //                 updatedDate: new Date(),
    //             },
    //         });

    //         // Si estás utilizando Redis, considera invalidar el cache aquí
    //         const FACTORY = RedisStrategyFactory.getStrategy('userColor') as UserColorStrategy;
    //         await FACTORY.saveUserColorByIdUser(updatedUserColor.idUserFk, updatedUserColor);

    //         return updatedUserColor;

    //     } catch (error: any) {
    //         throw new CustomError('UserColorService.updateUserColor', error);
    //     }
    // }

    // async deleteUserColor(id: number): Promise<any> {
    //     try {
    //         let deletedUserColor = await prisma.userColor.delete({
    //             select: {
    //                 id: true,
    //                 idUserFk: true,
    //             },
    //             where: { id: id },
    //         });

    //         // Si estás utilizando Redis, considera invalidar el cache aquí
    //         const FACTORY = RedisStrategyFactory.getStrategy('userColor') as UserColorStrategy;
    //         await FACTORY.deleteUserColorByIdUser(deletedUserColor.idUserFk);

    //     } catch (error: any) {
    //         throw new CustomError('UserColorService.deleteUserColor', error);
    //     }
    // }
}
