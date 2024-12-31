import prisma from "../../lib/prisma";
import { GoogleOAuthErrorCodes } from "../../models/error-codes/oauth-error-codes";
import { Response } from "../../models/messages/response";
import { Pagination } from "../../models/pagination";
import { CalendarService } from "../../services/@database/calendar/calendar.service";
import { UserCalendarService } from "../../services/@database/user-calendar/user-calendar.service";
import { CalendarGoogleApiService } from "../../services/caledar-googleapi/calendar-googleapi.service";
import { JWTService } from "../../services/jwt/jwt.service";


export class CalendarController {
    // public calendarService: CalendarService;
    // public calGoogleApiService: CalendarGoogleApiService;
    // private jwtService: JWTService;

    // constructor() {
    //     this.jwtService = JWTService.instance;
    //     this.calendarService = new CalendarService();
    //     this.calGoogleApiService = new CalendarGoogleApiService();
    // }

    // public add = async (req: any, res: any, next: any) => {
    //     try {

    //         const { idUserFk, idGoogleCalendar, name, ownerEmailGoogle } = req.body;

    //         const token = req.token;
    //         await this.jwtService.verify(token);

    //         const newCalendar = await this.calGoogleApiService.addCalendarByCredentials(idUserFk, "[RBC] Calendario " + new Date().getTime(), "Creado desde Frontend");


    //         const existCalendar = await this.calendarService.getLastCalendarWithoutGoogle();


    //         let result;
    //         if (existCalendar) {
    //             result = await this.calendarService.updateCalendar({
    //                 id: existCalendar.id,
    //                 idGoogleCalendar: newCalendar.id,
    //             });
    //         } else {
    //             result = await this.calendarService.addCalendar({
    //                 idUserFk: idUserFk,
    //                 ownerEmailGoogle: ownerEmailGoogle,
    //                 idGoogleCalendar: newCalendar.id,
    //                 name: "[RBC] Calendario " + new Date().getTime(),
    //             });

    //             // this._addUserCalendar(result.id);


    //         }


    //         res.status(200).json(Response.build("Calendario creado", 200, true, result));
    //     } catch (err: any) {
    //         console.log("error", err);
    //         res.status(402).json({ message: err.message });
    //     }
    // }

    // public get = async (req: any, res: any, next: any) => {
    //     try {
    //         const { pagination } = req.body;
    //         const token = req.token;
    //         await this.jwtService.verify(token);

    //         // Calendarios siempre devolverá uno
    //         let pag: Pagination = {
    //             ...pagination,
    //             page: 1,
    //             itemsPerPage: 1,
    //             orderBy: {
    //                 field: "createdDate",
    //                 order: "desc",
    //             }
    //         }

    //         const result = await this.calendarService.getCalendars(pag);
    //         res.status(200).json({ message: "Calendarios encontrados", ok: true, item: result });
    //     } catch (err: any) {
    //         res.status(500).json({ message: err.message });
    //     }
    // }

    // public getById = async (req: any, res: any, next: any) => {
    //     try {
    //         const { id } = req.params;
    //         const token = req.token;
    //         await this.jwtService.verify(token);

    //         const result = await this.calendarService.getCalendarById(id);
    //         res.status(200).json(Response.build("Calendario encontrado", 200, true, result));
    //     } catch (err: any) {
    //         res.status(500).json({ message: err.message });
    //     }
    // }

    // public update = async (req: any, res: any, next: any) => {
    //     try {
    //         const body = req.body;
    //         const token = req.token;
    //         await this.jwtService.verify(token);

    //         // const result = await this.calendarService.updateCalendar(body);
    //         // res.status(200).json(Response.build("Calendario actualizado", 200, true, result));
    //     } catch (err: any) {
    //         res.status(401).json({ message: err.message });
    //     }
    // }

    // public deleteGoogleTotal = async (req: any, res: any, next: any) => {
    //     try {
    //         const { id } = req.body;
    //         const token = req.token;
    //         await this.jwtService.verify(token);

    //         // const calendarExist = await this.calendarService.getCalendarById(id);
    //         // if (!calendarExist) {
    //         //     res.status(404).json(Response.build("Calendario no encontrado", 404, false));
    //         //     return;
    //         // }

    //         const userCalendarService = new UserCalendarService();
    //         // const result = await this.calendarService.deleteCalendar(id);

    //         // const [response1, response2, response3, response4] = await Promise.all([
    //             // TODO: Si fuera un hard delete, se debería de eliminar después de eliminar los userCalendars
    //             // Es un soft delete
    //             // this.calendarService.deleteCalendar(id),
    //             // // Es un Hard delete
    //             // userCalendarService.deleteAllUserCalendarByCalendar(id),
    //             // this.calGoogleApiService.deleteCalendarByCredentials(calendarExist.idGoogleCalendar),

    //             // // TODO: 07/09/2024 Ahora siempre tiene que haber un calendario, aunque no esté vinculado
    //             // // una vez se cree el de google, se tiene que editar el último calendario creado
    //             // this.calendarService.addCalendar({
    //             //     // idUserFk: calendarExist.idUserFk,
    //             //     ownerEmailGoogle: calendarExist.ownerEmailGoogle,
    //             //     idGoogleCalendar: null,
    //             //     name: "[RBC] Calendario " + new Date().getTime
    //             // })


    //         // ]);

    //         // this._addUserCalendar(response4.id);

    //         // El calendario de google solo lo puede eliminar el usuario que haya creado el calendario. En este caso siempre es un admin

    //         // await this.calGoogleService
    //         //     .deleteCalendar(
    //         //         calendarExist.idUserFk,
    //         //         calendarExist.idGoogleCalendar
    //         //     );


    //         // await this.calGoogleApiService
    //         //     .deleteCalendarByCredentials(calendarExist.idGoogleCalendar);



    //         res.status(200).json(Response.build("Calendario eliminado", 200, true, {
    //             calendar: response1,
    //             userCalendars: response2,
    //         }));
    //     } catch (err: any) {
    //         if (err?.message.includes("Invalid Credential")) {
    //             res.status(404).json(Response.build("El token es inválido", 404, false, { code: GoogleOAuthErrorCodes.INVALID_TOKEN }));
    //         } else if (err?.message.includes("Calendario no encontrado")) {
    //             res.status(200).json(Response.build("Calendario no encontrado para borrar", 404, false));
    //         } else {
    //             res.status(401).json({ message: err.message });
    //         }
    //     }
    // }



}
