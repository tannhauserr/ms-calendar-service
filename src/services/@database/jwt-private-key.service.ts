


import { JWTPrivateKey, PrismaClient } from '@prisma/client';
import { Request, Response } from 'express';
import prisma from '../../lib/prisma';
import CustomError from '../../models/custom-error/CustomError';
import { NodeCacheService } from '../@cache/node-cache.service';
import moment from "moment";
import { UtilGeneral } from '../../utils/util-general';


export class JWTPrivateKeyService {


    constructor() { }

    async add(key: string): Promise<JWTPrivateKey> {
        try {
            return await prisma.jWTPrivateKey.create({
                data: {
                    key: key,
                    available: true,
                },
            });
        } catch (error: any) {
            throw new CustomError('JWTPrivateKeyService.add', error);
        }
    }

    async getById(id: number): Promise<JWTPrivateKey | null> {
        try {
            return await prisma.jWTPrivateKey.findUnique({
                where: { id: id },
            });
        } catch (error: any) {
            throw new CustomError('JWTPrivateKeyService.getById', error);
        }
    }

    async update(id: number, key: string): Promise<JWTPrivateKey> {
        try {
            return await prisma.jWTPrivateKey.update({
                where: { id: id },
                data: {
                    key: key,
                    updatedDate: new Date(),
                },
            });
        } catch (error: any) {
            throw new CustomError('JWTPrivateKeyService.update', error);
        }
    }

    async delete(id: number, deleteFlag: boolean = true): Promise<JWTPrivateKey> {
        try {
            return await prisma.jWTPrivateKey.update({
                where: { id: id },
                data: {
                    deletedDate: deleteFlag ? new Date() : null,
                },
            });
        } catch (error: any) {
            throw new CustomError('JWTPrivateKeyService.delete', error);
        }
    }

    async deleteMultiple(ids: number[], deleteFlag: boolean = true): Promise<{ count: number }> {
        try {
            return await prisma.jWTPrivateKey.updateMany({
                where: { id: { in: ids } },
                data: {
                    deletedDate: deleteFlag ? new Date() : null,
                },
            });
        } catch (error: any) {
            throw new CustomError('JWTPrivateKeyService.deleteMultiple', error);
        }
    }



    /**
    * Crea una nueva clave y devuelve la antigua
    * @param key 
    * @returns 
    */
    handleAddPrivateKey = async (key: string) => {

        const prismaTx = await prisma.$transaction(async (tx) => {

            let attempt = 0;
            // Número máximo de intentos
            let maxAttempts = 3;
            let success = false;
            let jwtpkCreated;
            let lastJwtpk;


            while (attempt < maxAttempts && !success) {


                try {
                    lastJwtpk = await tx.jWTPrivateKey.findFirst({
                        orderBy: {
                            createdDate: 'desc',
                        },
                        where: {
                            available: true,
                            deletedDate: null,
                        },
                    })

                    await tx.jWTPrivateKey.updateMany({
                        where: {
                            OR: [
                                { available: true },
                                { deletedDate: null },
                            ],
                        },
                        data: {
                            available: false,
                            deletedDate: new Date(),
                        },
                    });



                    // Creamos nuevo token en base de datos

                    jwtpkCreated = await tx.jWTPrivateKey.create({
                        data: {
                            key: key,
                            available: true,
                        },
                    });

                    success = true;


                } catch (txError) {
                    attempt++;
                    await UtilGeneral.sleep(2000);

                    if (attempt >= maxAttempts) {
                        // Lanza el error si se alcanza el máximo de intentos
                        throw txError;
                    }
                }
            }
            return {
                created: jwtpkCreated,
                last: lastJwtpk,
            };
        });

        return prismaTx
    }
}
