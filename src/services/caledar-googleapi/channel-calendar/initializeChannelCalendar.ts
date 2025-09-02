// import { TIME_MILLISECONDS, TIME_SECONDS } from "../../../constant/time";
// import { Pagination } from "../../../models/pagination";
// import { UtilGeneral } from "../../../utils/util-general";
// import { CalendarService } from "../../@database/calendar/calendar.service";
// import { ChannelCalendarStrategy } from "../../@redis/cache/strategies/channelCalendar/channelCalendar.strategy";
// import { RedisStrategyFactory } from "../../@redis/cache/strategies/redisStrategyFactory";
// import { ChannelCalendar } from "../interfaces/channel-calendar";
// import { ChannelCalendarGoogleApiService } from "./channel-calendar-googleapi.service";
// import CustomError from "../../../models/custom-error/CustomError";

// export const initializeChannels = async () => {
//     const calendarService = new CalendarService();
//     const channelCalGoogleApiService = new ChannelCalendarGoogleApiService();
//     const channelStrategy = RedisStrategyFactory.getStrategy('channelCalendar') as ChannelCalendarStrategy;

//     try {
//         const pag: Pagination = {
//             page: 1,
//             itemsPerPage: 1,
//             orderBy: {
//                 field: "createdDate",
//                 order: "desc",
//             }
//         };

//         // Obtén el calendario más reciente
//         const result: { rows: any[], pagination: Pagination } = await calendarService.getCalendars(pag);


//         console.log("He encontrado resultados: ", result);
//         if (result && result?.rows?.length > 0) {
//             const calendar = result.rows[0];
//             let channelConfig = calendar.channelConfig as ChannelCalendar;

//             console.log("Channel config: ", channelConfig);
//             // Revisa si el canal está a punto de expirar
//             // if (channelConfig && channelConfig.expiration && Date.now() > channelConfig.expiration - (TIME_MILLISECONDS.DAY * 2)) {

//             // Este es solo para inicializarlo siempre sin importar el tiempo de expiración de arriba
//             if (channelConfig) {
//                 console.log("Channel is about to expire. Refreshing channel...");
//                 const newExpirationMills = Date.now() + TIME_MILLISECONDS.WEEK;
//                 const newExpirationSeconds = Date.now() + TIME_SECONDS.WEEK;

//                 const newChannelId = UtilGeneral.generateUUIDv4(); // Genera un nuevo UUID
//                 const newResourceId = UtilGeneral.generateUUIDv4(); // Genera un nuevo Resource ID

//                 console.log("justo antes de refrescar el canal");
//                 // Refresca el canal en Google Calendar
//                 const refreshedChannelConfig = await channelCalGoogleApiService.refreshChannel(calendar.idGoogleCalendar,
//                     {
//                         ...channelConfig,
//                         channelId: newChannelId,
//                         resourceId: newResourceId,
//                         expiration: newExpirationMills,
//                     },
//                     `${newExpirationSeconds}`);

//                 console.log("Channel refreshed: ", refreshedChannelConfig);
//                 // Actualiza el calendario en tu base de datos
//                 calendar.channelConfig = refreshedChannelConfig;


//                 // console.log("tengo que actualizar 111")
//                 // console.log("calendario", calendar)
//                 const calendarAux = { id: calendar.id, channelConfig: refreshedChannelConfig };
//                 const calendarUpdated = await calendarService.updateCalendar(calendarAux as any);
//                 // console.log("tengo que actualizar 222")

//                 // console.log("calendario actualizado", calendarUpdated);
//                 // Guarda la nueva configuración del canal en Redis
//                 await channelStrategy.saveChannelCalendar(refreshedChannelConfig);

//                 console.log("Channel refreshed, saved to DB, and cached.");
//             } else {
//                 console.log("Channel is still valid.");
//             }
//         } else {
//             console.log("No calendar found. Cannot create or refresh a channel.");
//             // Aquí podrías tomar alguna acción adicional, como notificar que no hay calendarios
//             // o iniciar un proceso para crear un calendario nuevo si eso es apropiado.
//         }
//     } catch (error: any) {
//         // Manejo de errores usando CustomError
//         new CustomError('initializeChannels', error);
//     }
// }
