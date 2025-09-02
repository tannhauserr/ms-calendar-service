import { Prisma } from '@prisma/client';
import CustomError from '../../../models/custom-error/CustomError';
import prisma from '../../../lib/prisma';


export class CategoryServiceService {
    constructor() { }


    async getByWorkspace(idWorkspace: string) {
        try {
            const result = await prisma.categoryService.findMany({
                where: {
                    category: {
                        idWorkspaceFk: idWorkspace,
                        deletedDate: null,
                    }
                },
                select: {
                    id: true,
                    idCategoryFk: true,
                    idServiceFk: true,
                    position: true,
                    category: {
                        select: {
                            id: true,
                            name: true,
                            position: true,
                        },
                    },
                    service: {
                        select: {
                            id: true,
                            name: true,
                            price: true,
                            duration: true,
                            userServices: {
                                select: {
                                    id: true,
                                    idUserFk: true,
                                },
                            },
                        },
                    },
                },
            });
            return result;
        } catch (error: any) {
            throw new CustomError('CategoryServiceService.getByWorkspace', error);
        }
    }

    // Obtener una relación específica por ID
    async getById(id: string) {
        try {
            const result = await prisma.categoryService.findUnique({
                where: { id },
                select: {
                    id: true,
                    idCategoryFk: true,
                    idServiceFk: true,
                    position: true,


                    // category: {
                    //     select: {
                    //         name: true,
                    //         description: true,
                    //     },
                    // },
                },
            });
            return result;
        } catch (error: any) {
            throw new CustomError('CategoryServiceService.getById', error);
        }
    }

    /**
     * @param item 
     * @returns 
     */
    async addMultipleCategoryService(
        item: Prisma.CategoryServiceCreateManyInput | Prisma.CategoryServiceCreateManyInput[]
    ): Promise<any> {
        try {
            // Convertir item a array si no lo es
            const itemsArray = Array.isArray(item) ? item : [item];

            return await prisma.categoryService.createMany({
                data: itemsArray,
                skipDuplicates: true,
            });
        } catch (error: any) {
            throw new CustomError('CategoryServiceService.addMultipleUserService', error);
        }
    }


    delete = async (id: string) => {
        try {
            return await prisma.categoryService.delete({
                where: { id },
            });
        } catch (error: any) {
            throw new CustomError('CategoryServiceService.delete', error);
        }
    };

    deleteMultiple = async (ids: string[]) => {
        try {
            return await prisma.categoryService.deleteMany({
                where: {
                    id: {
                        in: ids,
                    },
                },
            });
        } catch (error: any) {
            throw new CustomError('CategoryServiceService.deleteMultiple', error);
        }
    };

    async deleteMultipleByCategoryAndService(pairs: { idCategory: string; idService: string }[]) {
        try {

            for (const pair of pairs) {
                const found = await prisma.categoryService.findMany({
                    where: {
                        idCategoryFk: pair.idCategory,
                        idServiceFk: pair.idService,
                    },
                });
            }

            // 2) Ahora haz el borrado con OR + AND explícito:
            const result = await prisma.categoryService.deleteMany({
                where: {
                    OR: pairs.map(pair => ({
                        AND: [
                            { idCategoryFk: pair.idCategory },
                            { idServiceFk: pair.idService },
                        ]
                    }))
                }
            });
            console.log('Eliminados:', result.count);
            return result;
        } catch (error: any) {
            throw new CustomError('CategoryServiceService.deleteMultipleByCategoryAndService', error);
        }
    }




    // // Borrar todas las relaciones categoryService para una compañía
    // async deleteByCompany(idCompany: string) {
    //     try {
    //         return await prisma.categoryService.deleteMany({
    //             where: {
    //                 category: {
    //                     idCompanyFk: idCompany,
    //                 }
    //             },
    //         });
    //     } catch (error: any) {
    //         throw new CustomError('CategoryServiceService.deleteByCompany', error);
    //     }
    // }

    // // Borrar todas las relaciones categoryService para un establecimiento
    // async deleteByWorkspace(idWorkspace: string) {
    //     try {
    //         return await prisma.categoryService.deleteMany({
    //             where: { 
    //                 category: {

    //                 }
    //              },
    //         });
    //     } catch (error: any) {
    //         throw new CustomError('CategoryServiceService.deleteByWorkspace', error);
    //     }
    // }
}



