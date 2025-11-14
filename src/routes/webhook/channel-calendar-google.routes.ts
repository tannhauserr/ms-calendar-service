import express from 'express';
import { google } from 'googleapis';
// import { CalendarService } from '../../services/@database/calendar/calendar.service';
import { EventService } from '../../services/@database/event/event.service';
import { RedisStrategyFactory } from '../../services/@redis/cache/strategies/redisStrategyFactory';
import { AvoidSameEventStrategy } from '../../services/@redis/cache/strategies/avoidSameEvent/avoidSameEvent.strategy';
import { TIME_SECONDS } from '../../constant/time';
import { EventSourceType } from '@prisma/client';
import { UserCalendarService } from '../../services/@database/user-calendar/user-calendar.service';
// import { ChannelCalendarGoogleController } from '../../controllers/@channel-calendar-google/channel-calendar-google.controller';

const router = express.Router();

// router.post('/webhook/channel/google-calendar', async (req, res) => {
//     try {
//         const channelId = req.headers['x-goog-channel-id'];
//         const resourceId = req.headers['x-goog-resource-id'];
//         let resourceUri = req.headers['x-goog-resource-uri'];
//         const state = req.headers['x-goog-resource-state'];

//         if (Array.isArray(resourceUri)) {
//             resourceUri = resourceUri[0];
//         }

//         console.log("cuantas veces entro aquí")

//         const calendarIdMatch = resourceUri.match(/calendars\/([^\/]+)/);
//         const calendarId = calendarIdMatch ? calendarIdMatch[1] : null;

//         if (!calendarId) {
//             console.log('No se pudo extraer calendarId del resourceUri');
//             return res.status(400).send('No se pudo extraer calendarId');
//         }

//         const calendarService = new CalendarService();
//         const calendarData = await calendarService.getLastCalendar();

//         const auth = await getGoogleAuthByCredentials();
//         const calendar = google.calendar({ version: 'v3', auth });

//         const params: any = {
//             calendarId: decodeURIComponent(calendarId),
//             maxResults: 2500,
//             singleEvents: true,
//         };

//         // Si hay un syncToken, no se debe incluir `orderBy`
//         if (calendarData?.syncToken) {
//             params.syncToken = calendarData.syncToken;
//         }

//         const eventsResponse = await calendar.events.list(params);
//         const events = eventsResponse.data.items;
//         const newSyncToken = eventsResponse.data.nextSyncToken;

//         const eventService = new EventService();

//         const FACTORY = RedisStrategyFactory.getStrategy('avoidSameEvent') as AvoidSameEventStrategy;





//         // Procesa cada evento recibido
//         for (const event of events) {

//             const existingEvent = await FACTORY.getEventFromGoogle(event.id);

//             if (existingEvent) {
//                 console.log(`Evento ya procesado: ${event.id}`);
//                 continue;
//             } else {
//                 FACTORY.setEventFromGoogle(event.id, TIME_SECONDS.MINUTE - 50);
//                 console.log(`Procesando evento: ${event.id}`);
//             }


//             // Obtener registro de userCalendar
//             const userCalendarService = new UserCalendarService();
//             const userCalendar = await userCalendarService.getByIdCalendarAndEmailGoogle(calendarData.id, event.creator.email);

//             if (!userCalendar) {
//                 console.log(`No se encontró registro en userCalendar para el evento: ${event.id}`);
//                 continue;
//             }






//             if (event.status === 'cancelled') {
//                 // Eliminar evento si existe en la base de datos
//                 const existingEvent = await eventService.getEventByIdGoogleEvent(event.id);
//                 if (existingEvent) {
//                     await eventService.deleteEvent(existingEvent.id);
//                     console.log(`Evento eliminado: ${event.id}`);
//                 }
//             } else {
//                 // Crear o actualizar evento
//                 const existingEvent = await eventService.getEventByIdGoogleEvent(event.id);
//                 if (existingEvent) {
//                     // Actualizar evento existente
//                     await eventService.updateEvent({
//                         id: existingEvent.id,
//                         title: event.summary || '',
//                         description: event.description || '',
//                         startDate: new Date(event.start.dateTime || event.start.date),
//                         endDate: new Date(event.end.dateTime || event.end.date),
//                         idGoogleEvent: event.id,
//                         idUserPlatformFk: userCalendar?.idUserFk,
//                         eventSourceType: EventSourceType.GOOGLE

//                     });
//                     console.log(`Evento actualizado: ${event.id}`);
//                 } else {
//                     // Crear nuevo evento
//                     await eventService.addEvent({
//                         title: event.summary || '',
//                         description: event.description || '',
//                         startDate: new Date(event.start.dateTime || event.start.date),
//                         endDate: new Date(event.end.dateTime || event.end.date),
//                         idGoogleEvent: event.id,
//                         eventPurposeType: 'APPOINTMENT', // Ajusta según tu lógica
//                         idCalendarFk: calendarData.id, // Asociar con el calendario
//                         idUserPlatformFk: userCalendar?.idUserFk,
//                         eventSourceType: EventSourceType.GOOGLE
//                     });
//                     console.log(`Evento creado: ${event.id}`);
//                 }
//             }

//         }

//         // Guardar el nuevo syncToken en la base de datos
//         if (newSyncToken && calendarData?.id) {
//             await calendarService.updateSyncToken(calendarData.id, newSyncToken);
//         }

//         res.status(200).send('Notificación recibida y procesada.');

//     } catch (error) {
//         console.error('Error al procesar la notificación de Google Calendar:', error);
//         res.status(500).send('Error procesando la notificación.');
//     }
// });

// const controller = new ChannelCalendarGoogleController();
// router.post('/webhook/channel/google-calendar', controller.handleWebhookNotification);

// module.exports = router;

// const getGoogleAuthByCredentials = async () => {
//     const auth = new google.auth.GoogleAuth({
//         keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
//         scopes: ['https://www.googleapis.com/auth/calendar'],
//     });
//     return auth;
// }