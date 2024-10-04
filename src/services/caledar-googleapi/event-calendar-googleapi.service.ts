import axios, { AxiosResponse } from 'axios';
import { google, calendar_v3 } from 'googleapis';
import { TIME_SECONDS } from '../../constant/time';
import CustomError from '../../models/custom-error/CustomError';
import { GoogleOAuthStrategy } from '../@redis/cache/strategies/googleOAuth/googleOAuth.strategy';

export class EventCalendarGoogleService {
    private googleOAuthStrategy = new GoogleOAuthStrategy();

    /**
     * Obtiene un cliente OAuth2 autenticado para el usuario especificado.
     * @param idUser - ID del usuario para obtener las credenciales.
     * @returns OAuth2Client autenticado.
     */
    private async getOAuth2Client(idUser: string) {
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );

        let accessToken = await this.googleOAuthStrategy.getAccessToken(idUser);
        if (!accessToken) {
            accessToken = await this.refreshAccessToken(idUser);
        }

        oauth2Client.setCredentials({
            access_token: accessToken,
        });

        return oauth2Client;
    }

    /**
     * Refresca el token de acceso del usuario.
     * @param idUser - ID del usuario para refrescar el token.
     * @returns Nuevo token de acceso.
     */
    private async refreshAccessToken(idUser: string): Promise<string> {
        try {
            console.log('Refrescando token de Google...');
            const { data }: AxiosResponse<any> = await axios.post(
                `${process.env.URL_BACK_MS_AUTH}/api/auth/google/refresh-token`,
                { idUser: idUser },
                { withCredentials: true }
            );

            if (data && data?.item && data?.item?.ok) {
                const { access_token } = data.item;
                // Actualiza el token en Redis
                await this.googleOAuthStrategy.setAccessToken(idUser, access_token, TIME_SECONDS.HOUR);
                return access_token;
            } else {
                throw new CustomError('EventsGoogleService.refreshAccessToken', data?.item?.message || 'Error al refrescar el token');
            }
        } catch (error: any) {
            console.error('Error al refrescar el token:', error);
            throw new CustomError('EventsGoogleService.refreshAccessToken_catch', error);
        }
    }

    /**
     * Crea un nuevo evento en el calendario especificado.
     * @param idUser - ID del usuario que crea el evento.
     * @param calendarId - ID del calendario donde se creará el evento.
     * @param eventData - Datos del evento a crear.
     * @returns Datos del evento creado.
     */
    // async createEvent(
    //     idUser: string,
    //     calendarId: string,
    //     eventData: calendar_v3.Schema$Event
    // ): Promise<calendar_v3.Schema$Event> {
    //     try {
    //         const oauth2Client = await this.getOAuth2Client(idUser);
    //         const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    //         const response = await calendar.events.insert({
    //             calendarId,
    //             requestBody: eventData,
    //         });

    //         console.log(`Evento creado con ID: ${response.data.id}`);
    //         return response.data;
    //     } catch (error: any) {
    //         console.error('Error al crear el evento:', error);
    //         throw new CustomError('EventsGoogleService.createEvent', error);
    //     }
    // }

    async createEvent(
        idUser: string,
        calendarId: string,
        title: string,
        startDate: string,
        endDate: string,
        description?: string,
        colorIdGoogle?: string
    ): Promise<calendar_v3.Schema$Event> {
        try {
            const oauth2Client = await this.getOAuth2Client(idUser);
            const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

            const eventData: calendar_v3.Schema$Event = {
                summary: title,
                description: description || '',
                start: {
                    dateTime: startDate,
                    timeZone: 'UTC',
                },
                end: {
                    dateTime: endDate,
                    timeZone: 'UTC',
                },
                colorId: colorIdGoogle || '1',
            };

            const response = await calendar.events.insert({
                calendarId,
                requestBody: eventData,
            });

            console.log(`Evento creado con ID: ${response.data.id}`);
            return response.data;
        } catch (error: any) {
            console.error('Error al crear el evento:', error);
            throw new CustomError('EventsGoogleService.createEvent', error);
        }
    }

    /**
     * Obtiene los detalles de un evento específico.
     * @param idUser - ID del usuario que solicita el evento.
     * @param calendarId - ID del calendario donde se encuentra el evento.
     * @param eventId - ID del evento a obtener.
     * @returns Datos del evento solicitado.
     */
    async getEvent(
        idUser: string,
        calendarId: string,
        eventId: string
    ): Promise<calendar_v3.Schema$Event> {
        try {
            const oauth2Client = await this.getOAuth2Client(idUser);
            const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

            const response = await calendar.events.get({
                calendarId,
                eventId,
            });

            console.log(`Evento obtenido con ID: ${response.data.id}`);
            return response.data;
        } catch (error: any) {
            console.error('Error al obtener el evento:', error);
            throw new CustomError('EventsGoogleService.getEvent', error);
        }
    }

    /**
     * Actualiza un evento existente en el calendario.
     * @param idUser - ID del usuario que actualiza el evento.
     * @param calendarId - ID del calendario donde se encuentra el evento.
     * @param eventId - ID del evento a actualizar.
     * @param updatedEventData - Datos actualizados del evento.
     * @returns Datos del evento actualizado.
     */
    // async updateEvent(
    //     idUser: string,
    //     calendarId: string,
    //     eventId: string,
    //     updatedEventData: calendar_v3.Schema$Event
    // ): Promise<calendar_v3.Schema$Event> {
    //     try {
    //         const oauth2Client = await this.getOAuth2Client(idUser);
    //         const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    //         const response = await calendar.events.update({
    //             calendarId,
    //             eventId,
    //             requestBody: updatedEventData,
    //         });

    //         console.log(`Evento actualizado con ID: ${response.data.id}`);
    //         return response.data;
    //     } catch (error: any) {
    //         console.error('Error al actualizar el evento:', error);
    //         throw new CustomError('EventsGoogleService.updateEvent', error);
    //     }
    // }



    async updateEvent(
        idUser: string,
        calendarId: string,
        eventId: string,
        title: string,
        startDate: string,
        endDate: string,
        description?: string,
        colorIdGoogle?: string
    ): Promise<calendar_v3.Schema$Event> {
        try {
            const oauth2Client = await this.getOAuth2Client(idUser);
            const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

            const updatedEventData: calendar_v3.Schema$Event = {
                summary: title,
                description: description || '',
                start: {
                    dateTime: startDate,
                    timeZone: 'UTC',
                },
                end: {
                    dateTime: endDate,
                    timeZone: 'UTC',
                },
                colorId: colorIdGoogle || '1',
                
            };

            const response = await calendar.events.update({
                calendarId,
                eventId,
                requestBody: updatedEventData,
            });

            console.log(`Evento actualizado con ID: ${response.data.id}`);
            return response.data;
        } catch (error: any) {
            throw new CustomError('EventsGoogleService.updateEvent', error);
        }
    }

    /**
     * Elimina un evento existente del calendario.
     * @param idUser - ID del usuario que elimina el evento.
     * @param calendarId - ID del calendario donde se encuentra el evento.
     * @param eventId - ID del evento a eliminar.
     */
    async deleteEvent(
        idUser: string,
        calendarId: string,
        eventId: string
    ): Promise<void> {
        try {
            const oauth2Client = await this.getOAuth2Client(idUser);
            const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

            await calendar.events.delete({
                calendarId,
                eventId,
            });

            console.log(`Evento con ID ${eventId} eliminado correctamente.`);
        } catch (error: any) {
            console.error('Error al eliminar el evento:', error);
            throw new CustomError('EventsGoogleService.deleteEvent', error);
        }
    }

    /**
     * Lista los eventos en un rango de fechas específico.
     * @param idUser - ID del usuario que solicita la lista de eventos.
     * @param calendarId - ID del calendario de donde obtener los eventos.
     * @param timeMin - Fecha y hora de inicio del rango (ISO string).
     * @param timeMax - Fecha y hora de fin del rango (ISO string).
     * @returns Lista de eventos en el rango especificado.
     */
    async listEvents(
        idUser: string,
        calendarId: string,
        timeMin: string,
        timeMax: string
    ): Promise<calendar_v3.Schema$Event[]> {
        try {
            const oauth2Client = await this.getOAuth2Client(idUser);
            const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

            const response = await calendar.events.list({
                calendarId,
                timeMin,
                timeMax,
                singleEvents: true,
                orderBy: 'startTime',
            });

            const events = response.data.items || [];
            console.log(`Se encontraron ${events.length} eventos.`);
            return events;
        } catch (error: any) {
            console.error('Error al listar los eventos:', error);
            throw new CustomError('EventsGoogleService.listEvents', error);
        }
    }
}
