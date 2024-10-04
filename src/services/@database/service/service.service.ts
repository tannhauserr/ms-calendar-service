import { Prisma, Service } from "@prisma/client";
import prisma from "../../../lib/prisma";
import CustomError from "../../../models/custom-error/CustomError";
import { Pagination } from "../../../models/pagination";
import { getGeneric } from "../../../utils/get-genetic/getGenetic";
import { UtilGeneral } from "../../../utils/util-general";

export class ServiceService {
    constructor() { }

    async addService(item: Prisma.ServiceCreateInput): Promise<Service> {
        try {
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

    async getServiceById(id: number): Promise<Service | null> {
        try {
            return await prisma.service.findUnique({
                where: { id: id },
                include: {
                    userServices: true,
                },
            });
        } catch (error: any) {
            throw new CustomError('ServiceService.getServiceById', error);
        }
    }

    async updateService(item: Service): Promise<Service> {
        try {
            const id = item.id as number;
            delete item.id;

            return await prisma.service.update({
                where: { id: id },
                data: {
                    ...item,
                    updatedDate: new Date(),
                },
            });
        } catch (error: any) {
            throw new CustomError('ServiceService.updateService', error);
        }
    }

    async deleteService(id: number): Promise<Service> {
        try {
            return await prisma.service.delete({
                where: { id: id },
            });
        } catch (error: any) {
            throw new CustomError('ServiceService.deleteService', error);
        }
    }

    async getServices(pagination: Pagination, isUserServices = true) {
        try {
            let select: Prisma.ServiceSelect = {
                id: true,
                name: true,
                duration: true,
                description: true,
                // createdDate: true,
                // updatedDate: true,
                userServices: isUserServices,
            };

            const result = await getGeneric(pagination, "service", select);
            return result;
        } catch (error: any) {
            throw new CustomError('ServiceService.getServices', error);
        }
    }

}
