import { CalendarGoogleRoleType } from "../../models/interfaces/calendar-google-role";
import { googleCalendarColors } from "../../models/interfaces/google-events-color";
import { Response } from "../../models/messages/response";
import { UserCalendarService } from "../../services/@database/user-calendar/user-calendar.service";
import { UserColorService } from "../../services/@database/user-color/user-color.service";
import { CalendarGoogleApiService } from "../../services/caledar-googleapi/calendar-googleapi.service";
import { JWTService } from "../../services/jwt/jwt.service";


export class UserCalendarController {
    public userCalendarService: UserCalendarService;
    private jwtService: JWTService;

    constructor() {
        this.jwtService = JWTService.instance;
        this.userCalendarService = new UserCalendarService();
    }

    public add = async (req: any, res: any, next: any) => {
        try {
            const body = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.userCalendarService.addUserCalendar(body);
            res.status(200).json(Response.build("Calendar de usuario creado", 200, true, result));
        } catch (err: any) {
            res.status(401).json({ message: err.message });
        }
    }

    public addGoogleTotal = async (req: any, res: any, next: any) => {
        try {
            const { emailUserGoogle, idUserFk, roleType, idCalendarFk } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            console.log("*************************");
            console.log("mira que es body", req.body);
            console.log("*************************");

            // const userCalendarRegister = await this.userCalendarService.addUserCalendar({
            //     idUserFk,
            //     idCalendarFk
            // });

            console.log("mira que es emailUserGoogle", emailUserGoogle);
            console.log("mira que es emailUserGoogle", emailUserGoogle);
            console.log("mira que es emailUserGoogle", emailUserGoogle);
            console.log("mira que es emailUserGoogle", emailUserGoogle);


            const userColorService = new UserColorService();
            const response = await Promise.all([
                this.userCalendarService.addUserCalendar({
                    idUserFk,
                    emailGoogle: emailUserGoogle,
                    idCalendarFk
                }),
                userColorService.getUserColorByIdUser(idUserFk)
            ])

            const userCalendarRegister = response[0];
            const userColorExist = response[1];

            // let userColorExist = await userColorService.getUserColorByIdUser(idUserFk);
            if (!userColorExist) {
                const randomColorId = Math.floor(Math.random() * 11) + 1;
                const selectedColor = googleCalendarColors.get(randomColorId.toString());
                await userColorService.addUserColor({
                    idUserFk,
                    idEventColorGoogleFk: +selectedColor?.id || 1,
                });
            }

            // Agregar al usuario al calendario de Google
            const calGoogleApiService = new CalendarGoogleApiService();
            let roleCalendar: CalendarGoogleRoleType = (roleType === 'ROLE_DEVELOPER') ? 'owner' : 'writer';
            calGoogleApiService.inviteUserToCalendar(userCalendarRegister?.calendar?.idGoogleCalendar, emailUserGoogle, roleCalendar);


            res.status(200).json(Response.build("Relación con el calendario creado", 200, true, userCalendarRegister));
        } catch (err: any) {
            res.status(401).json(Response.build("Error al crear la relación con el calendario", 401, false, err.message));
        }
    }

    public getById = async (req: any, res: any, next: any) => {
        try {
            const { id } = req.params;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.userCalendarService.getById(id);
            res.status(200).json(Response.build("Calendar de usuario encontrado", 200, true, result));
        } catch (err: any) {
            res.status(401).json({ message: err.message });
        }
    }

    public getByIdUser = async (req: any, res: any, next: any) => {
        try {
            const { idUserFk } = req.params;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.userCalendarService.getByIdUser(idUserFk);
            res.status(200).json(Response.build("Calendar de usuario encontrado", 200, true, result));
        } catch (err: any) {
            res.status(401).json({ message: err.message });
        }
    }

    public getByIdCalendar = async (req: any, res: any, next: any) => {
        try {
            const { idCalendarFk } = req.params;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.userCalendarService.getByIdCalendar(idCalendarFk);
            res.status(200).json(Response.build("Calendar de usuario encontrado", 200, true, result));
        } catch (err: any) {
            res.status(401).json({ message: err.message });
        }
    }

    public update = async (req: any, res: any, next: any) => {
        try {
            const body = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.userCalendarService.updateUserCalendar(body);
            res.status(200).json(Response.build("Calendar de usuario actualizado", 200, true, result));
        } catch (err: any) {
            res.status(401).json({ message: err.message });
        }
    }

    public delete = async (req: any, res: any, next: any) => {
        try {
            const { id } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.userCalendarService.deleteUserCalendar(id);
            res.status(200).json(Response.build("Calendar de usuario eliminado", 200, true, result));
        } catch (err: any) {
            res.status(401).json({ message: err.message });
        }
    }

    public deleteGoogleTotal = async (req: any, res: any, next: any) => {
        try {
            const { idUserFk, idCalendarFk, idCalendarGoogle, emailUserGoogle } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            console.log("*************************");
            console.log("mira que es body", req.body);

            // Eliminar el usuario del servicio de calendario de usuario
            const result = await this.userCalendarService.deleteByIdCalendarAndUser(idCalendarFk, idUserFk);

            // Eliminar el usuario del Google Calendar
            const calendarGoogleService = new CalendarGoogleApiService();
            await calendarGoogleService.removeUserFromCalendar(idCalendarGoogle, emailUserGoogle);

            res.status(200).json(Response.build("Relación del calendario eliminada", 200, true, result));
        } catch (err: any) {
            res.status(401).json({ message: err.message });
        }
    }
}
