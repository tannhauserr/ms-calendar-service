import { calendar_v3, google } from 'googleapis';
import axios, { AxiosResponse } from 'axios';
import { TIME_SECONDS } from '../../../constant/time';
import CustomError from '../../../models/custom-error/CustomError';
import { GoogleOAuthStrategy } from '../../@redis/cache/strategies/googleOAuth/googleOAuth.strategy';
import { CalendarValidationRequest } from './pattern-validator/interface/calendar-validation-request';
import { ResponseValidator } from './pattern-validator/interface/response-validation';


export class ValidatorCalendarGoogleApiService {

    private static googleOAuthStrategy = new GoogleOAuthStrategy();

    /**
     * Obtiene un cliente OAuth2 autenticado para el usuario especificado.
     * @param idUser - ID del usuario para obtener las credenciales.
     * @returns OAuth2Client autenticado.
     */
    private static async getOAuth2Client(idUser: string) {
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
    private static async refreshAccessToken(idUser: string): Promise<string> {
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


    private static getGoogleAuthByCredentials() {
        const auth = new google.auth.GoogleAuth({
            keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE, // archivo JSON descargado de Google Cloud
            scopes: ['https://www.googleapis.com/auth/calendar'],
        });
        return auth;
    }

    // 1. Validar si el usuario tiene acceso al calendario
    public static async hasAccessToCalendar(idUser: string, calendarId: string): Promise<ResponseValidator> {
        try {
            // Primero obtenemos el OAuth2Client del usuario
            const oauth2Client = await this.getOAuth2Client(idUser);

            // Usamos el OAuth2Client del usuario para obtener su email
            const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
            const userInfoResponse = await oauth2.userinfo.get();
            const userEmail = userInfoResponse.data.email;

            if (!userEmail) {
                return {
                    isValid: false,
                    message: 'No se pudo obtener el email del usuario en Google',
                };
            }

            // Ahora usamos las credenciales del servicio para verificar el acceso al calendario
            const auth = this.getGoogleAuthByCredentials();
            const calendar = google.calendar({ version: 'v3', auth });

            const response = await calendar.acl.list({ calendarId });

            // Verificamos si el email del usuario está en la lista de ACLs del calendario
            const hasAccess = response.data.items?.some(acl => acl.scope?.value === userEmail);

            if (hasAccess) {
                return { isValid: true };
            } else {
                return {
                    isValid: false,
                    message: 'El usuario no tiene acceso al calendario',
                };
            }
        } catch (error: any) {
            console.error('Error al verificar acceso al calendario:', error);
            new CustomError('EventsGoogleService.hasAccessToCalendar', error);
            return {
                isValid: false,
                message: 'Error al verificar acceso al calendario',
                item: error,
            };
        }
    }

    // 2. Validar si un evento existe en el calendario
    public static async existEvent(idUser: string, calendarId: string, eventId: string): Promise<ResponseValidator> {
        try {
            const oauth2Client = await this.getOAuth2Client(idUser);
            const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

            const response = await calendar.events.get({ calendarId, eventId });

            if (response.data.id) {
                return { isValid: true };
            } else {
                return {
                    isValid: false,
                    message: 'El evento no existe en el calendario',
                };
            }
        } catch (error: any) {
            console.error('Error al verificar la existencia del evento:', error);
            new CustomError('EventsGoogleService.existEvent', error);
            return {
                isValid: false,
                message: 'Error al verificar la existencia del evento',
                item: error,
            };
        }
    }

    // 3. Validar si el calendario existe
    public static async existCalendar(calendarId: string): Promise<ResponseValidator> {
        try {
            const auth = this.getGoogleAuthByCredentials();
            const calendar = google.calendar({ version: 'v3', auth });

            const response = await calendar.calendars.get({ calendarId });

            if (response.data.id) {
                return { isValid: true };
            } else {
                return {
                    isValid: false,
                    message: 'El calendario no existe',
                };
            }
        } catch (error: any) {
            console.error('Error al verificar la existencia del calendario:', error);
            new CustomError('EventsGoogleService.existCalendar', error);
            return {
                isValid: false,
                message: 'Error al verificar la existencia del calendario',
                item: error,
            };
        }
    }

    // 7. Validar la integridad de los datos del evento
    public static validateEventData({ eventData }: CalendarValidationRequest): ResponseValidator {
        try {
            // Validar que los campos requeridos están presentes
            if (!eventData.summary || !eventData.startDate || !eventData.endDate) {
                return {
                    isValid: false,
                    message: 'Faltan campos requeridos: summary, startDate o endDate',
                };
            }

            // Validar que las fechas de inicio y fin son válidas
            if (!eventData.startDate || !eventData.endDate) {
                return {
                    isValid: false,
                    message: 'Las fechas de inicio o fin no son válidas',
                };
            }

            // Validar que la fecha de inicio es anterior a la fecha de fin
            const startDate = new Date(eventData.startDate);
            const endDate = new Date(eventData.endDate);

            if (startDate >= endDate) {
                return {
                    isValid: false,
                    message: 'La fecha de inicio es posterior o igual a la fecha de fin',
                };
            }

            // Si todas las validaciones pasan
            return { isValid: true };
        } catch (error: any) {
            console.error('Error al validar los datos del evento:', error);
            new CustomError('EventsGoogleService.validateEventData', error);
            return {
                isValid: false,
                message: 'Error al validar los datos del evento',
                item: error,
            };
        }
    }

}
