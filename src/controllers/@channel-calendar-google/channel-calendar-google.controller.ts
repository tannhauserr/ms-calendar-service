import { Request, Response } from 'express';
import { google } from 'googleapis';
import { CalendarService } from '../../services/@database/calendar/calendar.service';
import { EventService } from '../../services/@database/event/event.service';
import { RedisStrategyFactory } from '../../services/@redis/cache/strategies/redisStrategyFactory';
import { AvoidSameEventStrategy } from '../../services/@redis/cache/strategies/avoidSameEvent/avoidSameEvent.strategy';
import { TIME_SECONDS } from '../../constant/time';
import { EventSourceType } from '@prisma/client';
import { UserCalendarService } from '../../services/@database/user-calendar/user-calendar.service';

export class ChannelCalendarGoogleController {
    private calendarService = new CalendarService();
    private eventService = new EventService();
    private userCalendarService = new UserCalendarService();
    private avoidSameEventStrategy = RedisStrategyFactory.getStrategy('avoidSameEvent') as AvoidSameEventStrategy;

    public handleWebhookNotification = async (req: Request, res: Response): Promise<void> => {
        try {
            const { channelId, resourceId, resourceUri, state } = this.extractHeaders(req);
            const calendarId = this.extractCalendarId(resourceUri);

            if (!calendarId) {
                console.error('No se pudo extraer calendarId del resourceUri');
                res.status(400).send('No se pudo extraer calendarId');
                return;
            }

            // const calendarData = await this.calendarService.getLastCalendarSyncWithGoogle();
            // const eventsResponse = await this.fetchCalendarEvents(calendarId, calendarData?.syncToken);
            // const events = eventsResponse.data.items;
            // const newSyncToken = eventsResponse.data.nextSyncToken;

            // await this.processEvents(events, calendarData);

            // if (newSyncToken && calendarData?.id) {
            //     // await this.calendarService.updateSyncToken(calendarData.id, newSyncToken);
            // }

            res.status(200).send('Notificación recibida y procesada.');
        } catch (error) {
            console.error('Error al procesar la notificación de Google Calendar:', error);
            res.status(500).send('Error procesando la notificación.');
        }
    }


    private extractHeaders(req: Request) {
        const channelId = req.headers['x-goog-channel-id'];
        const resourceId = req.headers['x-goog-resource-id'];
        let resourceUri = req.headers['x-goog-resource-uri'] as string | string[];
        const state = req.headers['x-goog-resource-state'];

        if (Array.isArray(resourceUri)) {
            resourceUri = resourceUri[0];
        }

        return { channelId, resourceId, resourceUri, state };
    }

    private extractCalendarId(resourceUri: string): string | null {
        const calendarIdMatch = resourceUri.match(/calendars\/([^\/]+)/);
        return calendarIdMatch ? calendarIdMatch[1] : null;
    }

    private async fetchCalendarEvents(calendarId: string, syncToken?: string) {
        const auth = await this.getGoogleAuthByCredentials();
        const calendar = google.calendar({ version: 'v3', auth });

        const params: any = {
            calendarId: decodeURIComponent(calendarId),
            maxResults: 2500,
            singleEvents: true,
        };

        if (syncToken) {
            params.syncToken = syncToken;
        }

        const eventsResponse = await calendar.events.list(params);
        return eventsResponse;  // Devuelve el objeto completo de la respuesta
    }


    private async processEvents(events: any[], calendarData: any) {
        for (const event of events) {
            const existingEvent = await this.avoidSameEventStrategy.getEventFromGoogle(event.id);

            if (existingEvent) {
                console.log(`Evento ya procesado: ${event.id}`);
                continue;
            }

            await this.avoidSameEventStrategy.setEventFromGoogle(event.id, TIME_SECONDS.MINUTE - 50);
            console.log(`Procesando evento: ${event.id}`);

            console.log("mira que es event de google", event)


            if (event.status === 'cancelled') {
                await this.handleCancelledEvent(event.id);
            } else {
                
                // const userCalendar = await this.userCalendarService.getByIdCalendarAndEmailGoogle(calendarData.id, event.creator.email);

                // if (!userCalendar) {
                //     console.log(`No se encontró registro en userCalendar para el evento: ${event.id}`);
                //     continue;
                // }

                // await this.handleUpsertEvent(event, userCalendar, calendarData.id);
            }
        }
    }

    private async handleCancelledEvent(eventId: string) {
        // const existingEvent = await this.eventService.getEventByIdGoogleEvent(eventId);
        // if (existingEvent) {
        //     // await this.eventService.deleteEvent(existingEvent.id);
        //     // console.log(`Evento eliminado: ${eventId}`);
        // }
    }

    private async handleUpsertEvent(event: any, userCalendar: any, calendarId: number) {
        // const existingEvent = await this.eventService.getEventByIdGoogleEvent(event.id);
        // const eventData = {
        //     title: event.summary || '',
        //     description: event.description || '',
        //     startDate: new Date(event.start.dateTime || event.start.date),
        //     endDate: new Date(event.end.dateTime || event.end.date),
        //     idGoogleEvent: event.id,
        //     idUserPlatformFk: userCalendar.idUserFk,
        //     eventSourceType: EventSourceType.GOOGLE,
        // };

        // if (existingEvent) {
        //     await this.eventService.updateEvent({ id: existingEvent.id, ...eventData });
        //     console.log(`Evento actualizado: ${event.id}`);
        // } else {
        //     await this.eventService.addEvent({ ...eventData, eventPurposeType: 'APPOINTMENT', idCalendarFk: calendarId });
        //     console.log(`Evento creado: ${event.id}`);
        // }
    }

    private async getGoogleAuthByCredentials() {
        const auth = new google.auth.GoogleAuth({
            keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
            scopes: ['https://www.googleapis.com/auth/calendar'],
        });
        return auth;
    }
}

