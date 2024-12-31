import { Prisma, PrismaClient } from '@prisma/client';
import CustomError from '../../../models/custom-error/CustomError';
import { Pagination } from '../../../models/pagination';
import { getGeneric } from '../../../utils/get-genetic/getGenetic';

const prisma = new PrismaClient();

export class CategoryService {
    constructor() { }

    // Obtener todos los establecimientos con paginación
    async get(pagination: Pagination) {
        try {
            const select: Prisma.CategorySelect = {
                id: true,
                idCompanyFk: true,
                name: true,
                color: true,
                description: true,
            };

            const result = await getGeneric(pagination, "category", select);

            return result;
        } catch (error: any) {
            throw new CustomError('CategoryService.get', error);
        }
    }


    // Obtener un establecimiento por ID
    async getById(id: number) {
        try {
            const result = await prisma.category.findUnique({
                where: { id },
                select: {
                    id: true,
                    idCompanyFk: true,
                    color: true,

                    name: true,
                    description: true,

                },
            });
            return result;
        } catch (error: any) {
            throw new CustomError('CategoryService.getById', error);
        }
    }





    // Crear una nueva categoría
    async add(item: any) {
        try {
            const result = await prisma.category.create({
                data: item,
                select: {
                    id: true,
                    idCompanyFk: true,

                    name: true,
                    description: true,
                    color: true,
                },
            });
            return result;
        } catch (error: any) {
            throw new CustomError('CategoryService.add', error);
        }
    }

    // Actualizar un establecimiento
    async update(item: any) {
        try {
            const id = item.id;
            delete item.id;

            const result = await prisma.category.update({
                where: { id },
                data: {
                    ...item,
                    updatedDate: new Date(),
                },
                select: {
                    id: true,
                    idCompanyFk: true,

                    name: true,
                    description: true,
                    color: true,
                },
            });
            return result;
        } catch (error: any) {
            throw new CustomError('CategoryService.update', error);
        }
    }

    async updateMultipleById(idList: number[], dataNew: any) {
        try {
            delete dataNew?.id;
            dataNew.updatedDate = new Date();


            const result = await prisma.category.updateMany({
                data: dataNew,
                where: {
                    id: {
                        in: idList,
                    },
                },
            });
            return result;
        } catch (error: any) {
            throw new CustomError('CategoryService.updateMultipleById', error);
        }
    }

    // // Eliminar un establecimiento (borrado lógico)
    // async delete(id: number, deleteFlag: boolean = true) {
    //     try {
    //         return await prisma.category.update({
    //             where: { id },
    //             data: {
    //                 deletedDate: deleteFlag ? new Date() : null,
    //             },
    //         });
    //     } catch (error: any) {
    //         throw new CustomError('CategoryService.delete', error);
    //     }
    // }

    // Eliminar múltiples establecimientos (borrado lógico)
    async deleteMultiple(ids: number[]) {
        try {
            return await prisma.category.deleteMany({
                where: { id: { in: ids } },
            });
        } catch (error: any) {
            throw new CustomError('CategoryService.deleteMultiple', error);
        }
    }

    // Obtener todos los usuarios de un establecimiento específico
    // Obtener todos los servicios asociados a una categoría específica
    async getServiceByCategoryId(idCategory: number) {
        try {
            const result = await prisma.service.findMany({
                where: {
                    idCategoryFk: idCategory, // Buscar servicios asociados a la categoría
                    deletedDate: null,       // Filtrar servicios no eliminados
                },
                select: {
                    id: true,
                    name: true,
                    description: true,
                    price: true,
                },
            });

            return result; // Retornar directamente los servicios encontrados
        } catch (error: any) {
            throw new CustomError('CategoryService.getServiceByCategoryId', error);
        }
    }


    /**
     * Manda todas las categorias de una empresa con sus servicios y el id de los usuarios que tienen ese servicio
     * @param idCompany 
     * @returns 
     */
    getCategoriesWithServicesAndUsers = async (idCompany: string) => {
        try {
            const result = await prisma.category.findMany({
                where: {
                    idCompanyFk: idCompany,
                },
                select: {
                    id: true,
                    name: true,
                    color: true,
                    service: {
                        where: {
                            deletedDate: null,
                        },
                        select: {
                            id: true,
                            name: true,
                            duration: true,
                            userServices: {
                                select: {
                                    idUserFk: true,
                                }
                            },
                        },
                    },
                },
            });

            return result;
        } catch (error: any) {
            throw new CustomError('CategoryService.getCategoriesWithServicesAndUsers', error);
        }
    }







}
