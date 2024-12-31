import { Prisma, PrismaClient } from '@prisma/client';
import CustomError from '../../../models/custom-error/CustomError';
import { Pagination } from '../../../models/pagination';
import { getGeneric } from '../../../utils/get-genetic/getGenetic';

const prisma = new PrismaClient();

export class CategoryEstablishmentService {
    constructor() { }

    // Obtener todas las relaciones con paginación
    async get(pagination: Pagination) {
        try {
            const select: Prisma.CategoryEstablishmentSelect = {
                id: true,
                idCategoryFk: true,
                idEstablishmentFk: true,
                category: {
                    select: {
                        name: true,
                        description: true,
                    },
                },
            };

            const result = await getGeneric(pagination, 'categoryEstablishment', select);

            return result;
        } catch (error: any) {
            throw new CustomError('CategoryEstablishmentService.get', error);
        }
    }

    // Obtener una relación específica por ID
    async getById(id: number) {
        try {
            const result = await prisma.categoryEstablishment.findUnique({
                where: { id },
                select: {
                    id: true,
                    idCategoryFk: true,
                    idEstablishmentFk: true,
                    category: {
                        select: {
                            name: true,
                            description: true,
                        },
                    },
                },
            });
            return result;
        } catch (error: any) {
            throw new CustomError('CategoryEstablishmentService.getById', error);
        }
    }



    // Crear una nueva relación
    // async add(item: any) {
    //     try {
    //         const result = await prisma.categoryEstablishment.create({
    //             data: item,
    //             select: {
    //                 id: true,
    //                 idCategoryFk: true,
    //                 idEstablishmentFk: true,
    //             },
    //         });
    //         return result;
    //     } catch (error: any) {
    //         throw new CustomError('CategoryEstablishmentService.add', error);
    //     }
    // }

    async addMultipleCategoryEstablishment(
        item: Prisma.CategoryEstablishmentCreateManyInput | Prisma.CategoryEstablishmentCreateManyInput[]
    ): Promise<any> {
        try {
            // Convertir item a array si no lo es
            const itemsArray = Array.isArray(item) ? item : [item];

            return await prisma.categoryEstablishment.createMany({
                data: itemsArray,
                skipDuplicates: true,
            });
        } catch (error: any) {
            throw new CustomError('UserServiceService.addMultipleUserService', error);
        }
    }

    // Eliminar múltiples relaciones
    async deleteMultiple(ids: number[]) {
        try {
            console.log(ids);
            console.log(ids);
            console.log(ids);
            console.log(ids);
            console.log(ids);
            console.log(ids);

            return await prisma.categoryEstablishment.deleteMany({
                where: { id: { in: ids } },
            });
        } catch (error: any) {
            throw new CustomError('CategoryEstablishmentService.deleteMultiple', error);
        }
    }
}



