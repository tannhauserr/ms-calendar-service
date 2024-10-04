import { Prisma, UserService } from "@prisma/client";
import prisma from "../../../lib/prisma";
import CustomError from "../../../models/custom-error/CustomError";

export class UserServiceService {
    constructor() { }

    async addUserService(item: Prisma.UserServiceCreateInput): Promise<UserService> {
        try {
            return await prisma.userService.create({
                data: {
                    ...item,
                    createdDate: new Date(),
                    updatedDate: new Date(),
                },
            });
        } catch (error: any) {
            throw new CustomError('UserServiceService.addUserService', error);
        }
    }

    async getUserServiceById(id: number): Promise<UserService | null> {
        try {
            return await prisma.userService.findUnique({
                where: { id: id },
                include: {
                    service: true,
                },
            });
        } catch (error: any) {
            throw new CustomError('UserServiceService.getUserServiceById', error);
        }
    }

    async updateUserService(item: UserService): Promise<UserService> {
        try {
            const id = item.id as number;
            delete item.id;

            return await prisma.userService.update({
                where: { id: id },
                data: {
                    ...item,
                    updatedDate: new Date(),
                },
            });
        } catch (error: any) {
            throw new CustomError('UserServiceService.updateUserService', error);
        }
    }

    async deleteUserService(id: number): Promise<UserService> {
        try {
            return await prisma.userService.delete({
                where: { id: id },
            });
        } catch (error: any) {
            throw new CustomError('UserServiceService.deleteUserService', error);
        }
    }
}
