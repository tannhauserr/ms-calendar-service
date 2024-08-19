import { Prisma, User } from "@prisma/client";
import prisma from "../../lib/prisma";
import CustomError from "../../models/custom-error/CustomError";
import { UtilGeneral } from "../../utils/util-general";
import { Pagination } from "../../models/pagination";
import { getGeneric } from "../../utils/get-genetic/getGenetic";




export class UserService {
    constructor() { }


    async get(pagination: Pagination) {
        try {

            let select: Prisma.UserSelect;
            select = {
                id: true,
                email: true,
                name: true,
                idRoleFk: true,
                image: true,
                isBlocked: true,
                createdDate: true,
                role: {
                    select: {
                        roleType: true,
                    }
                }
            }


            const result = await getGeneric(pagination, "user", select);

            return result;

        } catch (error: any) {
            throw new CustomError('UserService.get', error);
        }
    }


    async getClient(pagination: Pagination) {
        try {

            let select: Prisma.UserSelect;
            select = {
                id: true,
                email: true,
                name: true,
                phoneNumber: true,
                idRoleFk: true,
                image: true,
                isBlocked: true,
                createdDate: true,
                role: {
                    select: {
                        roleType: true,
                    }
                },
            }


            const result = await getGeneric(pagination, "user", select);

            return result;

        } catch (error: any) {
            throw new CustomError('UserService.get', error);
        }
    }



    async getById(id: string): Promise<User | null> {
        try {
            return await prisma.user.findUnique({
                where: { id: id, deletedDate: null },
            });
        } catch (error: any) {
            throw new CustomError('UserService.getById', error);
        }
    }

    async getByUsername(email: string): Promise<any> {
        try {
            return await prisma.user.findFirst({
                select: {
                    id: true,
                    email: true,
                    phoneNumber: true,
                    idRoleFk: true,
                    image: true,
                    createdDate: true,
                    role: {
                        select: {
                            roleType: true,
                        }
                    }
                },
                where: { email, deletedDate: null },
            });
        } catch (error: any) {
            throw new CustomError('UserService.getByUsername', error);
        }
    }

    async getByEmail(email: string): Promise<any> {
        try {
            return await prisma.user.findFirst({
                select: {
                    id: true,
                    email: true,
                    idRoleFk: true,
                    image: true,
                    createdDate: true,
                    role: {
                        select: {
                            roleType: true,
                        }
                    }
                },
                where: { email: email, deletedDate: null },
            });
        } catch (error: any) {
            throw new CustomError('UserService.getByUsername', error);
        }
    }


    getByUsernameAndPassword = async (email: string, password: string): Promise<User | null> => {
        try {

            // Primero, busca el usuario solo por email
            const user = await prisma.user.findUnique({
                where: {
                    email: email,
                    deletedDate: null
                },
                select: {
                    id: true,
                    email: true,
                    name: true,
                    phoneNumber: true,
                    idRoleFk: true,
                    image: true,
                    password: true,
                    isBlocked: true,

                    // createdDate: true,
                    // updatedDate: true,
                    // deletedDate: true,
                    role: {
                        select: {
                            roleType: true,
                        }
                    }
                }
            });

            // Si no encontramos usuario, retornamos null
            if (!user) return null;

            // Comparamos la contraseña ingresada con el hash almacenado
            const isValidPassword = UtilGeneral.compareHashPassword(password, user.password);

            if (isValidPassword) {
                // Si la contraseña es correcta, retornamos el usuario (sin el hash de la contraseña)
                const { password, ...userWithoutPassword } = user;
                return userWithoutPassword as any;
            } else {
                // Si la contraseña no es correcta, retornamos null
                return null;
            }
        } catch (error: any) {
            throw new CustomError('WebAppAuthService.getByUsernameAndPassword', error);
        }
    }


    async getUserListForPromotionPage(idUserList: string[]): Promise<any[]> {
        try {
            const users = await prisma.user.findMany({
                where: {
                    id: { in: idUserList },
                    deletedDate: null,
                },
                select: {
                    id: true,
                    email: true,
                    name: true,
                    phoneNumber: true,
                    idRoleFk: true,
                    image: true,
                    isBlocked: true,
                    createdDate: true,
                    role: {
                        select: {
                            roleType: true,
                        }
                    }
                }
            });

            return users;
        } catch (error: any) {
            throw new CustomError('UserService.getUserListForPromotionPage', error);
        }
    }


    // ///////////

    async add(item: User): Promise<User> {
        try {
            return await prisma.user.create({
                data: item,
            });
        } catch (error: any) {
            throw new CustomError('UserService.add', error);
        }
    }


    async update(item): Promise<User> {
        try {
            const id = item.id;
            delete item.id;



            if (item.password && item.password !== '') {
                item.password = UtilGeneral.createHashPassword(item.password);
            }


            console.log("que es item user", item)

            const { myId, ...updateData } = item;

            const update = await prisma.user.update({
                where: { id: id },
                data: {
                    ...updateData,
                    updatedDate: new Date(),
                },
                include: {
                    role: {
                        select: {
                            roleType: true,
                        }
                    },
                }
            });

            console.log("que es update", update)


            return update;
        } catch (error: any) {
            throw new CustomError('UserService.update', error);
        }
    }


    async delete(id: string, deleteFlag: boolean = true): Promise<User> {
        try {
            return await prisma.user.update({
                where: { id: id },
                data: {
                    deletedDate: deleteFlag ? new Date() : null,
                },
            });
        } catch (error: any) {
            throw new CustomError('UserService.delete', error);
        }
    }

    async deleteMultiple(ids: string[], deleteFlag: boolean = true): Promise<{ count: number }> {
        try {
            return await prisma.user.updateMany({
                where: { id: { in: ids } },
                data: {
                    deletedDate: deleteFlag ? new Date() : null,
                },
            });
        } catch (error: any) {
            throw new CustomError('UserService.deleteMultiple', error);
        }
    }



    /**
     * Para usarlo sobre todo en el middleware
     * @param id 
     * @param password 
     * @returns 
     */
    async checkPassword(id: string, password: string): Promise<boolean> {
        const user = await prisma.user.findUnique({
            where: { id: id, deletedDate: null },
            select: { password: true },
        });

        if (!user) {
            throw new Error('Usuario no encontrado o eliminado.');
        }

        return await UtilGeneral.compareHashPassword(password, user.password);
    }

}