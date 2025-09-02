// import { Prisma, Calendar } from "@prisma/client";
import prisma from "../../../lib/prisma";
import CustomError from "../../../models/custom-error/CustomError";
import { Pagination } from "../../../models/pagination";
import { getGeneric } from "../../../utils/get-genetic/getGenetic";
import { UtilGeneral } from "../../../utils/util-general";
import { v4 as uuidv4 } from 'uuid';
import { TIME_MILLISECONDS } from "../../../constant/time";

export class CalendarService {
    constructor() { }

    // async addCalendar(item: any): Promise<Calendar> {
    //     try {

    //         const channelId = uuidv4(); // Genera un ID único para el canal
    //         const resourceId = uuidv4(); // Genera un ID único para el recurso
    //         const address = process.env.WEBHOOK_URL_CHANNEL_CALENDAR || '';

    //         const expiration = Date.now() + TIME_MILLISECONDS.WEEK; // 7 días en milisegundos

    //         return await prisma.calendar.create({
    //             data: {
    //                 ...item,
    //                 channelConfig: {
    //                     channelId: channelId,
    //                     resourceId: resourceId,
    //                     type: 'web_hook',
    //                     address: address,
    //                     expiration: expiration,
    //                 },
    //                 createdDate: new Date(),
    //                 updatedDate: new Date(),
    //             },
    //         });
    //     } catch (error: any) {
    //         throw new CustomError('CalendarService.addCalendar', error);
    //     }
    // }

    // async getCalendarById(id: string): Promise<Calendar | null> {
    //     try {
    //         return await prisma.calendar.findUnique({
    //             where: { id: id, deletedDate: null },
    //         });
    //     } catch (error: any) {
    //         throw new CustomError('CalendarService.getCalendarById', error);
    //     }
    // }

    // async updateCalendar(item: Partial<Calendar>): Promise<Calendar> {
    //     try {
    //         const id = item.id as string;
    //         delete item.id;

    //         return await prisma.calendar.update({
    //             where: { id: id },
    //             data: {
    //                 ...item,
    //                 updatedDate: new Date(),
    //             },
    //         });
    //     } catch (error: any) {
    //         throw new CustomError('CalendarService.updateCalendar', error);
    //     }
    // }

    // // async deleteCalendar(id: string): Promise<Calendar> {
    // //     try {
    // //         return await prisma.calendar.delete({
    // //             where: { id: id },
    // //         });
    // //     } catch (error: any) {
    // //         throw new CustomError('CalendarService.deleteCalendar', error);
    // //     }
    // // }

    // async deleteCalendar(id: string): Promise<Calendar> {
    //     try {
    //         return await prisma.calendar.update({
    //             data: {
    //                 deletedDate: new Date(),
    //             },
    //             where: { id: id },
    //         });
    //     } catch (error: any) {
    //         throw new CustomError('CalendarService.deleteCalendar', error);
    //     }
    // }

    // async getCalendars(pagination: Pagination) {
    //     try {
    //         let select: Prisma.CalendarSelect = {
    //             id: true,
    //             name: true,
    //             // idUserFk: true,
    //             idGoogleCalendar: true,
    //             channelConfig: true,
    //             createdDate: true,
    //             updatedDate: true,
    //             // events: true,
    //         };

    //         const result = await getGeneric(pagination, "calendar", select);
    //         return result;
    //     } catch (error: any) {
    //         throw new CustomError('CalendarService.getCalendars', error);
    //     }
    // }


    // getLastCalendarSyncWithGoogle = async () => {
    //     try {

    //         const calendar = await prisma.calendar.findFirst({
    //             select: {
    //                 id: true,
    //                 idGoogleCalendar: true,
    //                 syncToken: true,
    //             },
    //             where: { deletedDate: null, idGoogleCalendar: { not: null } },
    //             orderBy: {
    //                 createdDate: 'desc',
    //             },
    //         });

    //         return calendar;

    //     } catch (error: any) {
    //         throw new CustomError('CalendarService.getLastCalendar', error);
    //     }
    // }

    // getLastCalendarWithoutGoogle = async () => {
    //     try {

    //         const calendar = await prisma.calendar.findFirst({
    //             select: {
    //                 id: true,
    //                 idGoogleCalendar: true,
    //                 syncToken: true,
    //             },
    //             where: { deletedDate: null, idGoogleCalendar: null },
    //             orderBy: {
    //                 createdDate: 'desc',
    //             },
    //         });

    //         return calendar;

    //     } catch (error: any) {
    //         throw new CustomError('CalendarService.getLastCalendar', error);
    //     }
    // }

    // async updateSyncToken(id: string, syncToken: string): Promise<void> {
    //     try {
    //         await prisma.calendar.update({
    //             where: { id: id },
    //             data: {
    //                 syncToken: syncToken,
    //                 updatedDate: new Date(),
    //             },
    //         });
    //     } catch (error: any) {
    //         throw new CustomError('CalendarService.updateSyncToken', error);
    //     }
    // }





}
