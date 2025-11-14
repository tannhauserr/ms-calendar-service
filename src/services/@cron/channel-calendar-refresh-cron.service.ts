import schedule from "node-schedule";
import prisma from "../../lib/prisma";
import CustomError from "../../models/custom-error/CustomError";

import { UtilGeneral } from "../../utils/util-general";
import { TIME_MILLISECONDS } from "../../constant/time"; // Define los milisegundos de una semana
import { CONSOLE_COLOR } from "../../constant/console-color";
// import { CalendarService } from "../@database/calendar/calendar.service";
import { CalendarGoogleApiService } from "../caledar-googleapi/calendar-googleapi.service";
import { Pagination } from "../../models/pagination";
import { ChannelCalendarGoogleApiService } from "../caledar-googleapi/channel-calendar/channel-calendar-googleapi.service";



const rule = new schedule.RecurrenceRule();
rule.dayOfWeek = [0, new schedule.Range(1, 5)];
rule.hour = 5;
rule.minute = 0;

export class CalendarChannelRefreshCronService {

    private static _instance: CalendarChannelRefreshCronService;
    public job: schedule.Job | any;
    // private calendarService: CalendarService;
    private channelCalGoogleaApiService: ChannelCalendarGoogleApiService;



    private constructor() {
        // this.calendarService = new CalendarService();
        this.channelCalGoogleaApiService = new ChannelCalendarGoogleApiService();
    }

    public static get instance() {
        return this._instance || (this._instance = new this());
    }

    start() {
        // if (!this.job) {
        //     // Programa el cron job para que se ejecute una vez por semana
        //     // this.job = schedule.scheduleJob('0 0 * * 0', async () => {
        //     this.job = schedule.scheduleJob(rule, async () => {
        //         console.log(`${CONSOLE_COLOR.FgGreen}Entrando en cron channel calendar${CONSOLE_COLOR.Reset}`)
        //         try {
        //             // Obtén el último calendario creado
        //             const pag: Pagination = {
        //                 page: 1,
        //                 itemsPerPage: 1,
        //                 orderBy: {
        //                     field: "createdDate",
        //                     order: "desc",
        //                 }
        //             };

        //             // const result: { rows: any[], pagination: Pagination } = await this.calendarService.getCalendars(pag);

        //             if (result && result?.rows?.length > 0) {
        //                 const calendar = result.rows[0];
        //                 const channelConfig = calendar.channelConfig;

        //                 // Revisa si el canal está a punto de expirar
        //                 if (channelConfig.expiration && Date.now() > channelConfig.expiration - (TIME_MILLISECONDS.DAY * 2)) {
        //                     // Refresca el canal en Google Calendar
        //                     const newExpirationMills = Date.now() + TIME_MILLISECONDS.WEEK;
        //                     const newExpirationSeconds = newExpirationMills / 1000;

        //                     const newChannelId = UtilGeneral.generateUUIDv4(); // Genera un nuevo UUID
        //                     const newResourceId = UtilGeneral.generateUUIDv4(); // Genera un nuevo Resource ID

        //                     // Actualiza la configuración del canal
        //                     calendar.channelConfig = {
        //                         ...channelConfig,
        //                         channelId: newChannelId,
        //                         resourceId: newResourceId,
        //                         expiration: newExpirationMills,
        //                     };

        //                     // Llama al servicio de Google Calendar para actualizar el canal
        //                     await this.channelCalGoogleaApiService.refreshChannel(
        //                         calendar.idGoogleCalendar,
        //                         calendar.channelConfig,
        //                         `${newExpirationSeconds}` // Se convierte a string

        //                     );

        //                     // Actualiza el calendario en tu base de datos
        //                     // await this.calendarService.updateCalendar(calendar);

        //                     console.log(`${CONSOLE_COLOR.FgGreen}Canal de calendario actualizado con éxito.${CONSOLE_COLOR.Reset}`);
        //                 }
        //             }
        //         } catch (error: any) {
        //             if (error instanceof CustomError || error?.name == "CustomError") {
        //                 console.log(`${CONSOLE_COLOR.FgRed}**********************************************${CONSOLE_COLOR.Reset}`)
        //                 console.log(`${CONSOLE_COLOR.FgRed}************* START CUSTOM ERROR *************${CONSOLE_COLOR.Reset}`)
        //                 console.error(error);
        //                 console.log(`${CONSOLE_COLOR.FgRed}**********************************************${CONSOLE_COLOR.Reset}`)
        //             } else {
        //                 console.error("Error en el cron job para refrescar el canal del calendario:", error);
        //                 this.stop();
        //                 setTimeout(() => this.start(), 1000);
        //             }
        //         }
        //     });
        // }
    }

    stop() {
        if (this.job != undefined) {
            this.job.cancel();
            this.job = undefined;
        }
    }
}
