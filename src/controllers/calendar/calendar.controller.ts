import { Request, Response, NextFunction } from "express";
import { CalendarService } from "../../services/@database/calendar/calendar.service";
import { JWTService } from "../../services/jwt/jwt.service";
import { Pagination } from "../../models/pagination";
import { Response as CustomResponse } from "../../models/messages/response";

export class CalendarController {
    public calendarService: CalendarService;
    private jwtService: JWTService;

    constructor() {
        this.jwtService = JWTService.instance;
        this.calendarService = new CalendarService();
    }




    /**
     * Obtener un calendario por ID.
     */
    public getById = async (req: any, res: Response, next: NextFunction) => {
        try {
            const { id } = req.params;
            const token = req.token;
            await this.jwtService.verify(token);

            const calendar = await this.calendarService.getCalendarById(id);
            if (!calendar) {
                return res.status(404).json(CustomResponse.build("Calendario no encontrado", 404, false));
            }

            res.status(200).json(CustomResponse.build("Calendario encontrado", 200, true, calendar));
        } catch (err: any) {
            next(err);
        }
    };

    /**
     * Crear un nuevo calendario.
     */
    public create = async (req: any, res: Response, next: NextFunction) => {
        try {
            const { idCompanyFk, idWorkspaceFk } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const calendar = await this.calendarService.createCalendar({ idCompanyFk, idWorkspaceFk });
            res.status(201).json(CustomResponse.build("Calendario creado", 201, true, calendar));
        } catch (err: any) {
            next(err);
        }
    };

    /**
     * Actualizar un calendario por ID.
     */
    public update = async (req: any, res: Response, next: NextFunction) => {
        try {
            const { id } = req.params;
            const body = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const updatedCalendar = await this.calendarService.updateCalendar(id, body);
            res.status(200).json(CustomResponse.build("Calendario actualizado", 200, true, updatedCalendar));
        } catch (err: any) {
            next(err);
        }
    };

    /**
     * Eliminar varios calendarios.
     */
    public delete = async (req: any, res: Response, next: NextFunction) => {
        try {
            const { ids } = req.body; // Array de IDs
            const token = req.token;
            await this.jwtService.verify(token);

            if (!Array.isArray(ids) || ids.length === 0) {
                return res
                    .status(400)
                    .json(CustomResponse.build("IDs de calendarios no proporcionados o inválidos", 400, false));
            }

            const deletedCalendars = await this.calendarService.deleteCalendars(ids);
            res.status(200).json(CustomResponse.build("Calendarios eliminados correctamente", 200, true, deletedCalendars));
        } catch (err: any) {
            next(err);
        }
    };

    /**
     * Obtener todos los calendarios con paginación.
     */
    // public getAll = async (req: any, res: Response, next: NextFunction) => {
    //     try {
    //         const { page = 1, itemsPerPage = 10, orderBy } = req.query;
    //         const token = req.token;
    //         await this.jwtService.verify(token);

    //         const pagination: Pagination = {
    //             page: Number(page),
    //             itemsPerPage: Number(itemsPerPage),
    //             orderBy: orderBy
    //                 ? JSON.parse(orderBy as string) 
    //                 : { field: "createdDate", order: "desc" },
    //         };

    //         const calendars = await this.calendarService.getAllCalendars(pagination);
    //         res.status(200).json(CustomResponse.build("Calendarios encontrados", 200, true, calendars));
    //     } catch (err: any) {
    //         next(err);
    //     }
    // };

    /**
     * Buscar o crear un calendario por compañía y establecimiento.
     */
    public findOrCreate = async (req: any, res: Response, next: NextFunction) => {
        try {
            const { idCompanyFk, idWorkspaceFk } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const calendar = await this.calendarService.findOrCreateCalendar(idCompanyFk, idWorkspaceFk);
            res.status(200).json(CustomResponse.build("Calendario encontrado o creado", 200, true, calendar));
        } catch (err: any) {
            next(err);
        }
    };

    public findOrCreateWithData = async (req: any, res: Response, next: NextFunction) => {

        try {
            const { idCompanyFk, idWorkspaceFk } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const calendar = await this.calendarService.findOrCreateCalendar(
                idCompanyFk,
                idWorkspaceFk);


           const item = {
                calendar,
                workspaceData : req.workspaceData 
            }


            res.status(200).json(CustomResponse.build("Calendario encontrado o creado", 200, true, item));
        } catch (err: any) {
            next(err);
        }
    }

    /**
 * Obtener calendarios por compañía y establecimiento.
 */
    public getByCompanyAndWorkspace = async (req: any, res: Response, next: NextFunction) => {
        try {
            const { idCompanyFk, idWorkspaceFk } = req.body;

            console.log(idCompanyFk, idWorkspaceFk);
            const token = req.token;
            await this.jwtService.verify(token);

            if (!idCompanyFk) {
                return res.status(400).json(
                    CustomResponse.build("El parámetro 'idCompanyFk' es requerido", 400, false)
                );
            }

            if (!idWorkspaceFk) {
                return res.status(400).json(
                    CustomResponse.build("El parámetro 'idWorkspaceFk' es requerido", 400, false)
                );
            }

            const calendars = await this.calendarService.getCalendarsByCompanyAndWorkspace(
                String(idCompanyFk),
                String(idWorkspaceFk)
            );

            res.status(200).json(
                CustomResponse.build(
                    "Calendarios encontrados",
                    200,
                    true,
                    calendars
                )
            );
        } catch (err: any) {
            next(err);
        }
    };

}
