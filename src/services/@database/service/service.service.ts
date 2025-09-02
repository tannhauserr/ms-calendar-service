import { ModerationStatusType, Prisma, Service } from "@prisma/client";
import prisma from "../../../lib/prisma";
import CustomError from "../../../models/custom-error/CustomError";
import { Pagination } from "../../../models/pagination";
import { getGeneric } from "../../../utils/get-genetic/getGenetic";
import { UtilGeneral } from "../../../utils/util-general";

export class ServiceService {
    constructor() { }

    async addService(item: Prisma.ServiceCreateInput): Promise<Service> {
        try {

            if (item?.duration) {
                item.duration = Number(item?.duration || 0);
            }
            if (item?.price) {
                item.price = Number(item?.price || 0);
            }


            return await prisma.service.create({
                data: {
                    ...item,
                    createdDate: new Date(),
                    updatedDate: new Date(),
                },
            });
        } catch (error: any) {
            throw new CustomError('ServiceService.addService', error);
        }
    }

    async getServiceById(id: string): Promise<Partial<Service> | null> {
        try {
            id = String(id);
            return await prisma.service.findUnique({
                where: { id: id },
                select: {
                    id: true,
                    idCompanyFk: true,
                    idWorkspaceFk: true,
                    image: true,
                    name: true,
                    description: true,
                    duration: true,
                    price: true,
                    discount: true,
                    color: true,
                    isVisible: true,
                    maxParticipants: true,
                    serviceType: true,
                    // moderationStatusType: true,
                    categoryServices: {
                        select: {
                            id: true,
                            idCategoryFk: true,
                            position: true,
                            category: {
                                select: {
                                    name: true,
                                }
                            }
                        }
                    },
                },
            });
        } catch (error: any) {
            throw new CustomError('ServiceService.getServiceById', error);
        }
    }

    // async updateService(item: Service): Promise<Service> {
    //     try {
    //         const id = item.id as string;
    //         if (item?.duration) {
    //             item.duration = Number(item?.duration || 0);
    //         }
    //         if (item?.price) {
    //             item.price = Number(item?.price || 0);
    //         }
    //         delete item.id;

    //         return await prisma.service.update({
    //             where: { id: id },
    //             data: {
    //                 ...item,
    //                 updatedDate: new Date(),
    //             },
    //         });
    //     } catch (error: any) {
    //         throw new CustomError('ServiceService.updateService', error);
    //     }
    // }


    async updateService(item: Service): Promise<Service> {
        try {
            const id = item.id as string;

            delete (item as any)?.userServices; // Eliminar la propiedad userServices del objeto item

            // 1. Obtener el registro original para comparar los campos
            const oldRecord = await prisma.service.findUnique({
                where: { id },
                select: {
                    name: true,
                    description: true,
                    duration: true,
                    price: true,
                    discount: true,
                },
            });

            // 2. Comparar los campos relevantes y marcar si han cambiado
            let fieldsChanged = false;
            if (item.name !== undefined && item.name !== oldRecord?.name) {
                fieldsChanged = true;
            }
            if (item.description !== undefined && item.description !== oldRecord?.description) {
                fieldsChanged = true;
            }
            // Convertir a número para comparar campos numéricos
            // if (item.duration !== undefined && Number(item.duration) !== oldRecord?.duration) {
            //     fieldsChanged = true;
            // }
            // if (item.price !== undefined && Number(item.price) !== oldRecord?.price) {
            //     fieldsChanged = true;
            // }
            // if (item.discount !== undefined && Number(item.discount) !== oldRecord?.discount) {
            //     fieldsChanged = true;
            // }

            // 3. Convertir los campos numéricos y asignar 0 en caso de valores falsy
            if (item?.duration) {
                item.duration = Number(item.duration) || 0;
            }
            if (item?.price) {
                item.price = Number(item.price) || 0;
            }
            // Para discount: si no viene definido o es nulo, se asigna 0
            if (item?.discount === undefined || item.discount === null) {
                item.discount = 0;
            } else {
                item.discount = Number(item.discount) || 0;
            }

            // 4. Si alguno de los campos ha cambiado, se marca la moderación a 'PENDING'
            if (fieldsChanged) {
                item.moderationStatusType = 'PENDING';
            }

            delete item.id;

            // 5. Actualizar el servicio y establecer la fecha de actualización
            return await prisma.service.update({
                where: { id },
                data: {
                    ...item,
                    updatedDate: new Date(),
                },
            });
        } catch (error: any) {
            throw new CustomError('ServiceService.updateService', error);
        }
    }


    async updateModerationStatus(id: any, moderationStatusType: ModerationStatusType) {
        try {
            return await prisma.service.update({
                where: { id },
                data: {
                    moderationStatusType,
                    updatedDate: new Date(),
                },
            });
        } catch (error: any) {
            throw new CustomError('CompanyService.updateModerationStatus', error);
        }
    }


    updatePosition = async (positionList: string[], idCategoryFk: string) => {
        try {


            // 1) Recuperar las asignaciones que existen realmente
            const existing = await prisma.categoryService.findMany({
                where: {
                    idCategoryFk,
                    idServiceFk: { in: positionList },
                },
                select: {
                    id: true,
                    idServiceFk: true,
                }
            });

            // 2) Crear solo los updates para los que sí existen
            const updates = existing.map((row) => {
                const idx = positionList.indexOf(row.idServiceFk);
                return prisma.categoryService.update({
                    where: { id: row.id },
                    data: { position: idx + 1 },
                });
            });

            // 3) Ejecutar en transacción
            const result = await prisma.$transaction(updates);



            return result;
        } catch (error: any) {
            throw new CustomError('CategoryService.updatePosition', error);
        }
    };



    /**
     * Se elimina el servicio y sus relaciones con usuarios y categorías
     * @param id 
     * @returns 
     */
    async deleteService(id: string): Promise<Service> {
        try {
            // 1) Eliminar relaciones con usuarios
            await prisma.userService.deleteMany({
                where: { idServiceFk: id }
            });

            // 2) Eliminar relaciones con categorías
            await prisma.categoryService.deleteMany({
                where: { idServiceFk: id }
            });

            // 3) Eliminar el servicio
            return await prisma.service.delete({
                where: { id }
            });
        } catch (error: any) {
            throw new CustomError('ServiceService.deleteService', error);
        }
    }

    async getServices(pagination: Pagination): Promise<any> {
        try {
            let select: Prisma.ServiceSelect = {
                id: true,
                duration: true,
                price: true,
                name: true,
                description: true,
                moderationStatusType: true,
                image: true,
                discount: true,
                color: true,
                isVisible: true,
                maxParticipants: true,
                serviceType: true,

                // createdDate: true,
                // updatedDate: true,
                // userServices: isUserServices,
                // categoryServices: {
                //     select: {
                //         category: {
                //             select: {
                //                 id: true,
                //                 name: true,
                //                 color: true,

                //             },
                //         }
                //     }
                // }
            };

            const result = await getGeneric(pagination, "service", select);
            return result;
        } catch (error: any) {
            throw new CustomError('ServiceService.getServices', error);
        }
    }


    orderedServicesByCategory = async (
        idCategory: string
    ): Promise<any[]> => {
        try {
            // 1) Busca en la tabla pivot, filtrando por tu categoría y ordenando por position
            const pivots = await prisma.categoryService.findMany({
                where: {
                    idCategoryFk: idCategory,
                },
                take: 50,
                orderBy: {
                    position: 'asc',
                },
                include: {
                    service: {
                        select: {
                            id: true,
                            duration: true,
                            price: true,
                            name: true,
                            description: true,
                            moderationStatusType: true,
                            image: true,
                            discount: true,
                            color: true,
                            isVisible: true,
                            serviceType: true,
                            // añade aquí cualquier otro campo de Service que necesites...
                        },
                    },
                },
            });

            // 2) Extrae el Service de cada fila pivot en el mismo orden
            const services = pivots.map((p) => p.service);

            return services;
        } catch (error: any) {
            throw new CustomError('ServiceService.orderedServicesByCategory', error);
        }
    };
}
