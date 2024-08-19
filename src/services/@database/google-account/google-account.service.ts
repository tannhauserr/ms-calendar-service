import { GoogleAccount, Prisma } from "@prisma/client";
import prisma from "../../../lib/prisma";
import CustomError from "../../../models/custom-error/CustomError";
import { Pagination } from "../../../models/pagination";
import { getGeneric } from "../../../utils/get-genetic/getGenetic";
import { UtilGeneral } from "../../../utils/util-general";


export interface OAuthTokens {
    accessToken: string;
    refreshToken?: string; // Opcional, porque no siempre se recibe
    tokenExpiryDate?: number; // Puede ser undefined si no se recibe
}

export class GoogleAccountService {
    constructor() { }


    async upsertGoogleAccount(tokens: OAuthTokens, idUser: string, idGoogle: string): Promise<GoogleAccount> {
        try {
            return await prisma.googleAccount.upsert({
                where: { idUserFk: idUser },
                update: {
                    googleAccessToken: tokens.accessToken,
                    googleRefreshToken: tokens.refreshToken || "",
                    googleTokenExpiryDate: UtilGeneral.getCorrectUTCDate(new Date(tokens.tokenExpiryDate || 0)),
                    updatedDate: UtilGeneral.getCorrectUTCDate(new Date()),
                },
                create: {
                    idGoogle: idGoogle,
                    googleAccessToken: tokens.accessToken,
                    googleRefreshToken: tokens.refreshToken || "",
                    googleTokenExpiryDate: UtilGeneral.getCorrectUTCDate(new Date(tokens.tokenExpiryDate || 0)),
                    createdDate: UtilGeneral.getCorrectUTCDate(new Date()),
                    updatedDate: UtilGeneral.getCorrectUTCDate(new Date()),
                    user: { connect: { id: idUser } }
                },
            });
        } catch (error: any) {
            throw new CustomError('GoogleAccountService.upsertGoogleAccount', error);
        }
    }


    async get(pagination: Pagination) {
        try {
            let select: Prisma.GoogleAccountSelect;
            select = {
                id: true,
                idGoogle: true,
                googleAccessToken: true,
                googleRefreshToken: true,
                googleTokenExpiryDate: true,
                idUserFk: true,
                createdDate: true,
                updatedDate: true,
                deletedDate: true,
                user: {
                    select: {
                        id: true,
                    }
                }
            };

            const result = await getGeneric(pagination, "googleAccount", select);
            return result;
        } catch (error: any) {
            throw new CustomError('GoogleAccountService.get', error);
        }
    }

    async getById(id: number): Promise<GoogleAccount | null> {
        try {
            return await prisma.googleAccount.findUnique({
                where: { id: id, deletedDate: null },
                include: {
                    user: true, // Incluye la relación con el usuario si es necesario
                }
            });
        } catch (error: any) {
            throw new CustomError('GoogleAccountService.getById', error);
        }
    }

    async getByIdUserFk(id: string): Promise<GoogleAccount | null> {
        try {
            return await prisma.googleAccount.findUnique({
                where: {
                    idUserFk: id,
                    deletedDate: null
                }
            });
        } catch (error: any) {
            throw new CustomError('GoogleAccountService.getById', error);
        }
    }

    async add(item: Prisma.GoogleAccountCreateInput): Promise<GoogleAccount> {
        try {
            return await prisma.googleAccount.create({
                data: {
                    ...item,
                    createdDate: UtilGeneral.getCorrectUTCDate(new Date()),
                    updatedDate: UtilGeneral.getCorrectUTCDate(new Date()),
                },

            });
        } catch (error: any) {
            throw new CustomError('GoogleAccountService.add', error);
        }
    }

    async update(item: any): Promise<GoogleAccount> {
        try {
            const id = item.id as number;
            delete item.id;

            // En lugar de hashear, simplemente procesamos el update.
            const update = await prisma.googleAccount.update({
                where: { id: id },
                data: {
                    ...item,
                    updatedDate: UtilGeneral.getCorrectUTCDate(new Date()),
                },
                include: {
                    user: true, // Incluye la relación con el usuario si es necesario
                }
            });

            return update;
        } catch (error: any) {
            throw new CustomError('GoogleAccountService.update', error);
        }
    }

    async delete(id: number, deleteFlag: boolean = true): Promise<GoogleAccount> {
        try {
            return await prisma.googleAccount.update({
                where: { id: id },
                data: {
                    deletedDate: deleteFlag ? UtilGeneral.getCorrectUTCDate(new Date()) : null,
                },
            });
        } catch (error: any) {
            throw new CustomError('GoogleAccountService.delete', error);
        }
    }

    async deleteMultiple(ids: number[], deleteFlag: boolean = true): Promise<{ count: number }> {
        try {
            return await prisma.googleAccount.updateMany({
                where: { id: { in: ids } },
                data: {
                    deletedDate: deleteFlag ? UtilGeneral.getCorrectUTCDate(new Date()) : null,
                },
            });
        } catch (error: any) {
            throw new CustomError('GoogleAccountService.deleteMultiple', error);
        }
    }
}
