// import { Prisma, UserService } from "@prisma/client";
// import { Pagination } from "../../../models/pagination";
// import { getGeneric } from "../../../utils/get-genetic/getGenetic";
// import CustomError from "../../../models/custom-error/CustomError";
// import prisma from "../../../lib/prisma";


// export class UserServiceService {
//     constructor() { }

//     async getUserService(pagination: Pagination, isUserServices = true) {
//         try {
//             let select: Prisma.UserServiceSelect = {
//                 id: true,
//                 idUserFk: true,
//                 service: {
//                     select: {
//                         id: true,
//                         name: true,
//                     },

//                 },
//             };

//             const result = await getGeneric(pagination, "userService", select);
//             return result;
//         } catch (error: any) {
//             throw new CustomError('ServiceService.getServices', error);
//         }
//     }

//     // async addUserService(item: Prisma.UserServiceCreateInput): Promise<UserService> {
//     //     try {
//     //         return await prisma.userService.create({
//     //             data: {
//     //                 ...item,
//     //                 createdDate: new Date(),
//     //                 updatedDate: new Date(),
//     //             }
//     //         });
//     //     } catch (error: any) {
//     //         throw new CustomError('UserServiceService.addUserService', error);
//     //     }
//     // }

//     async addMultipleUserService(
//         item: Prisma.UserServiceCreateManyInput | Prisma.UserServiceCreateManyInput[]
//     ): Promise<any> {
//         try {
//             // Convertir item a array si no lo es
//             const itemsArray = Array.isArray(item) ? item : [item];

//             return await prisma.userService.createMany({
//                 data: itemsArray,
//                 skipDuplicates: true,
//             });
//         } catch (error: any) {
//             throw new CustomError('UserServiceService.addMultipleUserService', error);
//         }
//     }

//     async getUserServiceById(id: string): Promise<UserService | null> {
//         try {
//             return await prisma.userService.findUnique({
//                 where: { id: id },
//                 include: {
//                     service: true,
//                 },
//             });
//         } catch (error: any) {
//             throw new CustomError('UserServiceService.getUserServiceById', error);
//         }
//     }

//     async updateUserService(item: UserService): Promise<UserService> {
//         try {
//             const id = item.id as string;
//             delete item.id;

//             return await prisma.userService.update({
//                 where: { id: id },
//                 data: {
//                     ...item,
//                     updatedDate: new Date(),
//                 },
//             });
//         } catch (error: any) {
//             throw new CustomError('UserServiceService.updateUserService', error);
//         }
//     }

//     async deleteUserService(ids: string[]): Promise<Prisma.BatchPayload> {
//         try {
//             return await prisma.userService.deleteMany({
//                 where: {
//                     id: {
//                         in: ids,
//                     },
//                 },
//             });
//         } catch (error: any) {
//             throw new CustomError('UserServiceService.deleteUserService', error);
//         }
//     }
// }
