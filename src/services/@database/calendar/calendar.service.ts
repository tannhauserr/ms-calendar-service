// import prisma from "../../../lib/prisma";
// import CustomError from "../../../models/custom-error/CustomError";
// import { Pagination } from "../../../models/pagination";

// export class CalendarService {
//     constructor() { }

//     /**
//      * Crea un nuevo calendario.
//      * @param data - Datos del calendario a crear.
//      * @returns Calendario creado.
//      */
//     async createCalendar(data: { idCompanyFk: string; idWorkspaceFk?: string }) {
//         try {
//             return await prisma.calendar.create({
//                 data: {
//                     idCompanyFk: data.idCompanyFk,
//                     idWorkspaceFk: data.idWorkspaceFk || null,
//                     createdDate: new Date(),
//                     updatedDate: new Date(),
//                 },
//             });
//         } catch (error: any) {
//             throw new CustomError("CalendarService.createCalendar", error);
//         }
//     }

//     /**
//      * Obtiene un calendario por ID.
//      * @param id - ID del calendario.
//      * @returns Calendario encontrado o null.
//      */
//     async getCalendarById(id: string) {
//         try {
//             return await prisma.calendar.findUnique({
//                 where: { id },
//             });
//         } catch (error: any) {
//             throw new CustomError("CalendarService.getCalendarById", error);
//         }
//     }

//     /**
//      * Busca calendarios por compañía y establecimiento.
//      * @param idCompanyFk - ID de la compañía.
//      * @param idWorkspaceFk - ID del establecimiento (opcional).
//      * @returns Lista de calendarios.
//      */
//     async getCalendarsByCompanyAndWorkspace(idCompanyFk: string, idWorkspaceFk?: string) {
//         try {
//             return await prisma.calendar.findMany({
//                 select: {
//                     id: true,
//                     event: true,
//                 },
//                 where: {
//                     idCompanyFk,
//                     idWorkspaceFk: idWorkspaceFk,
//                 },
//                 orderBy: { createdDate: "desc" },
//             });
//         } catch (error: any) {
//             throw new CustomError("CalendarService.getCalendarsByCompanyAndWorkspace", error);
//         }
//     }

//     /**
//      * Actualiza un calendario.
//      * @param id - ID del calendario.
//      * @param data - Datos a actualizar.
//      * @returns Calendario actualizado.
//      */
//     async updateCalendar(id: string, data: Partial<{ idCompanyFk: string; idWorkspaceFk: string }>) {
//         try {
//             return await prisma.calendar.update({
//                 where: { id },
//                 data: {
//                     ...data,
//                     updatedDate: new Date(),
//                 },
//             });
//         } catch (error: any) {
//             throw new CustomError("CalendarService.updateCalendar", error);
//         }
//     }

//     /**
//      * Elimina calendarios de forma permanente por sus IDs.
//      * @param ids - Array de IDs de calendarios a eliminar.
//      * @returns Resultado de las eliminaciones.
//      */
//     async deleteCalendars(ids: string[]) {
//         try {
//             return await prisma.$transaction(
//                 ids.map((id) =>
//                     prisma.calendar.delete({
//                         where: { id },
//                     })
//                 )
//             );
//         } catch (error: any) {
//             throw new CustomError("CalendarService.deleteCalendars", error);
//         }
//     }

//     /**
//   * Comprueba si existe un calendario por compañía y establecimiento.
//   * Si no existe, lo crea y lo devuelve junto con los eventos en el rango de fechas especificado.
//   * @param idCompanyFk - ID de la compañía.
//   * @param idWorkspaceFk - ID del establecimiento (opcional).
//   * @param startDate - Fecha inicial del rango (opcional).
//   * @param endDate - Fecha final del rango (opcional).
//   * @returns Calendario existente o recién creado con eventos en el rango.
//   */
//     async findOrCreateCalendar(
//         idCompanyFk: string,
//         idWorkspaceFk: string,
//         startDate?: Date,
//         endDate?: Date
//     ) {
//         try {
//             // Ajustar fechas para incluir todo el día
//             const adjustedStartDate = startDate
//                 ? new Date(startDate.setHours(0, 0, 0, 0)) // 00:00:00
//                 : null;
//             const adjustedEndDate = endDate
//                 ? new Date(endDate.setHours(23, 59, 59, 999)) // 23:59:59
//                 : null;

//                 console.log("idWorkspaceFk", idWorkspaceFk);
//                 console.log("idWorkspaceFk", idWorkspaceFk);
//                 console.log("idWorkspaceFk", idWorkspaceFk);
//                 console.log("idWorkspaceFk", idWorkspaceFk);
//                 console.log("idWorkspaceFk", idWorkspaceFk);

//             // Buscar calendario existente
//             const calendar = await prisma.calendar.findFirst({
//                 where: {
//                     idCompanyFk,
//                     idWorkspaceFk: idWorkspaceFk || null,
//                 },
//                 // select: {
//                 //     id: true,
//                 //     event: adjustedStartDate && adjustedEndDate
//                 //         ? {
//                 //             where: {
//                 //                 startDate: {
//                 //                     gte: adjustedStartDate,
//                 //                 },
//                 //                 endDate: {
//                 //                     lte: adjustedEndDate,
//                 //                 },
//                 //             },
//                 //         }
//                 //         : true, // Si no se especifica rango, devolver todos los eventos
//                 // },
//             });

//             if (calendar) {
//                 return calendar; // Si existe, devolverlo directamente
//             }

//             // Si no existe, crear el calendario
//             const newCalendar = await prisma.calendar.create({
//                 data: {
//                     idCompanyFk,
//                     idWorkspaceFk: idWorkspaceFk || null,
//                     createdDate: new Date(),
//                     updatedDate: new Date(),
//                 },
//                 // select: {
//                 //     id: true,
//                 //     event: adjustedStartDate && adjustedEndDate
//                 //         ? {
//                 //             where: {
//                 //                 startDate: {
//                 //                     gte: adjustedStartDate,
//                 //                 },
//                 //                 endDate: {
//                 //                     lte: adjustedEndDate,
//                 //                 },
//                 //             },
//                 //         }
//                 //         : true, // Si no se especifica rango, devolver todos los eventos
//                 // },
//             });

//             return newCalendar;
//         } catch (error: any) {
//             throw new CustomError("CalendarService.findOrCreateCalendar", error);
//         }
//     }


//     /**
//      * Obtiene todos los calendarios con paginación.
//      * @param pagination - Objeto de paginación.
//      * @returns Lista de calendarios.
//      */
//     async getAllCalendars(pagination: Pagination) {
//         try {
//             const { page, itemsPerPage, orderBy } = pagination;
//             const skip = (page - 1) * itemsPerPage;
//             const order = orderBy || { field: "createdDate", order: "desc" };

//             return await prisma.calendar.findMany({
//                 skip,
//                 take: itemsPerPage,
//                 orderBy: {
//                     [order.field]: order.order,
//                 },
//             });
//         } catch (error: any) {
//             throw new CustomError("CalendarService.getAllCalendars", error);
//         }
//     }
// }
