import { Prisma, WaitList } from "@prisma/client";
import prisma from "../../../../lib/prisma";
import CustomError from "../../../../models/custom-error/CustomError";
import { Pagination } from "../../../../models/pagination";
import { getGeneric } from "../../../../utils/get-genetic/getGenetic";

export class WaitListService {
    constructor() { }

    async addWaitList(item: Prisma.WaitListCreateInput): Promise<WaitList> {
        try {
            return await prisma.waitList.create({
                data: {
                    ...item,
                    createdDate: new Date(),
                    updatedDate: new Date(),
                },
            });
        } catch (error: any) {
            throw new CustomError("WaitListService.addWaitList", error);
        }
    }

    async getWaitLists(pagination: Pagination) {
        try {
            const select: Prisma.WaitListSelect = {
                id: true,
                idClientFk: true,
                idWorkspaceFk: true,
                startDate: true,
                endDate: true,
                messageWasSent: true,
                messageSentDate: true,
                vipLevel: true,
                createdDate: true,
                updatedDate: true,
                deletedDate: true,
            };

            const result = await getGeneric(pagination, "waitList", select);
            return result;
        } catch (error: any) {
            throw new CustomError("WaitListService.getWaitLists", error);
        }
    }

    async getWaitListById(id: string): Promise<WaitList | null> {
        try {
            return await prisma.waitList.findUnique({
                where: { id },
                select: {
                    id: true,
                    idClientFk: true,
                    idWorkspaceFk: true,
                    startDate: true,
                    endDate: true,
                    messageWasSent: true,
                    messageSentDate: true,
                    vipLevel: true,
                    createdDate: true,
                    updatedDate: true,
                    deletedDate: true,
                },
            });
        } catch (error: any) {
            throw new CustomError("WaitListService.getWaitListById", error);
        }
    }

    async getWaitListByWorkspace(idWorkspaceFk: string): Promise<WaitList[]> {
        try {
            return await prisma.waitList.findMany({
                where: {
                    idWorkspaceFk,
                    deletedDate: null,
                },
                orderBy: [
                    { vipLevel: "desc" },
                    { createdDate: "asc" },
                ],
            });
        } catch (error: any) {
            throw new CustomError("WaitListService.getWaitListByWorkspace", error);
        }
    }

    async updateWaitList(item: WaitList): Promise<WaitList> {
        try {
            const { id, createdDate, ...data } = item;
            const updateData: Prisma.WaitListUpdateInput = {
                ...data,
                updatedDate: new Date(),
            };

            if (updateData.messageWasSent === true && !updateData.messageSentDate) {
                updateData.messageSentDate = new Date();
            }

            return await prisma.waitList.update({
                where: { id },
                data: updateData,
            });
        } catch (error: any) {
            throw new CustomError("WaitListService.updateWaitList", error);
        }
    }

    async deleteWaitList(idList: string[]): Promise<Prisma.BatchPayload> {
        try {
            const listAux = Array.isArray(idList) ? idList : [idList];
            return await prisma.waitList.updateMany({
                where: {
                    id: { in: listAux },
                },
                data: {
                    deletedDate: new Date(),
                    updatedDate: new Date(),
                },
            });
        } catch (error: any) {
            throw new CustomError("WaitListService.deleteWaitList", error);
        }
    }

    async getPendingWaitList(limit: number): Promise<WaitList[]> {
        try {
            const now = new Date();
            return await prisma.waitList.findMany({
                where: {
                    deletedDate: null,
                    messageWasSent: false,
                    endDate: { gte: now },
                },
                orderBy: [
                    { vipLevel: "desc" },
                    { createdDate: "asc" },
                ],
                take: limit,
            });
        } catch (error: any) {
            throw new CustomError("WaitListService.getPendingWaitList", error);
        }
    }

    async countCurrentWindowByClientAndWorkspace(idClientFk: string, idWorkspaceFk: string): Promise<number> {
        try {
            const now = new Date();
            return await prisma.waitList.count({
                where: {
                    idClientFk,
                    idWorkspaceFk,
                    deletedDate: null,
                    startDate: { lte: now },
                    endDate: { gte: now },
                },
            });
        } catch (error: any) {
            throw new CustomError("WaitListService.countCurrentWindowByClientAndWorkspace", error);
        }
    }

    async getPendingCountByClientAndWorkspace(idClientFk: string, idWorkspaceFk: string): Promise<number> {
        try {
            const now = new Date();
            return await prisma.waitList.count({
                where: {
                    idClientFk,
                    idWorkspaceFk,
                    deletedDate: null,
                    messageWasSent: false,
                    endDate: { gte: now },
                },
            });
        } catch (error: any) {
            throw new CustomError("WaitListService.getPendingCountByClientAndWorkspace", error);
        }
    }

    async hasAvailability(item: WaitList): Promise<boolean> {
        try {
            const now = new Date();
            if (item.endDate < now) return false;

            const overlap = await prisma.event.findFirst({
                where: {
                    deletedDate: null,
                    startDate: { lt: item.endDate },
                    endDate: { gt: item.startDate },
                    ...(item.idClientFk ? { idUserPlatformFk: item.idClientFk } : {}),
                    groupEvents: {
                        is: {
                            idWorkspaceFk: item.idWorkspaceFk,
                            deletedDate: null,
                        },
                    },
                },
                select: { id: true },
            });

            return !overlap;
        } catch (error: any) {
            throw new CustomError("WaitListService.hasAvailability", error);
        }
    }

    async markMessageSent(id: string): Promise<WaitList> {
        try {
            return await prisma.waitList.update({
                where: { id },
                data: {
                    messageWasSent: true,
                    messageSentDate: new Date(),
                    updatedDate: new Date(),
                },
            });
        } catch (error: any) {
            throw new CustomError("WaitListService.markMessageSent", error);
        }
    }
}
