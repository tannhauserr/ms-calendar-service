import axios, { AxiosResponse } from 'axios';
import { google, calendar_v3 } from 'googleapis';
import { TIME_SECONDS } from '../../constant/time';
import CustomError from '../../models/custom-error/CustomError';
import { GoogleOAuthStrategy } from '../@redis/cache/strategies/googleOAuth/googleOAuth.strategy';
import { CalendarGoogleRoleType } from '../../models/interfaces/calendar-google-role';



export class CalendarGoogleApiService {
    private googleOAuthStrategy = new GoogleOAuthStrategy();

    // Si es necesario hacer una acción con el calendario de un usuario, se debe obtener el accessToken del usuario
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

        // Configura el cliente OAuth con el accessToken
        oauth2Client.setCredentials({
            access_token: accessToken,
            // refresh_token: refreshToken,
        });

        return oauth2Client;
    }


    // Si es necesario hacer una acción con la API de Google Calendar, se debe obtener las credenciales de Google Cloud
    private getGoogleAuthByCredentials() {
        const auth = new google.auth.GoogleAuth({
            keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE, // archivo JSON descargado de Google Cloud
            scopes: ['https://www.googleapis.com/auth/calendar'],
        });
        return auth;
    }

    private async refreshAccessToken(idUser: string): Promise<string> {
        try {
            console.log('Refrescando token de Google...', `${process.env.URL_BACK_MS_AUTH}/auth/google/refresh-token`, idUser);
            const { data }: AxiosResponse<any, any> = await axios.post(`${process.env.URL_BACK_MS_AUTH}/api/auth/google/refresh-token`, { idUser: idUser }, { withCredentials: true });

            console.log("mira el response desde aqui", data?.item);
            if (data && data?.item && data?.item?.ok) {
                const { access_token } = data?.item;
                return access_token;

            } else {
                throw new CustomError('CalendarGoogleService.refreshAccessToken', data?.item?.message);
            }

            // // Guardar el nuevo accessToken en Redis
            // TODO: Esto se comenta porque ya se hace en el endpoint de refresh
            // await this.googleOAuthStrategy.setAccessToken(idUser, access_token, TIME_SECONDS.DAY);
        } catch (error: any) {
            console.error('Error al refrescar el token:', error);
            throw new CustomError('CalendarGoogleService.refreshAccessToken_cacth', error);
        }
    }


    /**
     * Antigua versión donde el crear lo hacias con el accessToken del usuario
     * @param idUser 
     * @param summary 
     * @param description 
     * @returns 
     */
    // async addCalendar(idUser: string, summary: string, description: string): Promise<calendar_v3.Schema$Calendar> {
    //     const oauth2Client = await this.getOAuth2Client(idUser);
    //
    //     const calendar = google.calendar({
    //         version: 'v3',
    //         auth: oauth2Client,
    //     });
    //
    //     const newCalendar = await calendar.calendars.insert({
    //         requestBody: {
    //             summary: summary,
    //             description: description,
    //         },
    //     });
    //
    //     return newCalendar.data;
    // }

    async addCalendarByCredentials(idUser: string, summary: string, description: string): Promise<calendar_v3.Schema$Calendar> {

        const credentials = this.getGoogleAuthByCredentials();

        const calendar = google.calendar({
            version: 'v3',
            auth: credentials,
        });

        const newCalendar = await calendar.calendars.insert({
            requestBody: {
                summary: summary,
                description: description,
            },
        });


        console.log("El calendario ha sido creado con éxito.");
        console.log("El calendario ha sido creado con éxito.");

        console.log(newCalendar.data)

        console.log("vas a ver un bonito listado de calendarios")
        this.listCalendars();

        return newCalendar.data;
    }


    async listCalendars() {
        const oauth2Client2 = this.getGoogleAuthByCredentials();


        const calendar = google.calendar({ version: 'v3', auth: oauth2Client2 });

        const response = await calendar.calendarList.list();
        const calendars = response.data.items;

        if (calendars && calendars.length > 0) {
            calendars.forEach((cal) => {
                console.log(`Calendar Summary: ${cal.summary}, Calendar ID: ${cal.id}`);
            });
        } else {
            console.log('No calendars found.');
        }
    }


    async deleteCalendarByCredentials(idCalendar: string): Promise<void> {
        try {
            const credentials = await this.getGoogleAuthByCredentials();

            const calendar = google.calendar({
                version: 'v3',
                auth: credentials,
            });

            await calendar.calendars.delete({
                calendarId: idCalendar,
            });

            console.log("El calendario ha sido eliminado con éxito.");

        } catch (error: any) {
            console.error("Error al eliminar el calendario:", error);

            // Puedes manejar diferentes tipos de errores según el código de estado HTTP
            if (error.code === 404) {
                console.error("Calendario no encontrado.");
                new CustomError('CalendarGoogleService.deleteCalendarByCredentials', error);
                throw new Error('Calendario no encontrado');
            } else if (error.code === 403) {
                console.error("Permisos insuficientes para eliminar el calendario.");
            } else if (error.code === 401) {
                console.error("No autenticado correctamente.");
            } else {
                console.error("Ocurrió un error inesperado.");
            }

            throw new CustomError('CalendarGoogleService.deleteCalendarByCredentials', error);
        }
    }

    /**
     * Antigua versión donde el usuario borraba su propio calendario
     * @param userId 
     * @param idCalendar 
     */
    // async deleteCalendar(userId: string, idCalendar: string): Promise<void> {
    //     try {
    //         const oauth2Client = await this.getOAuth2Client(userId);

    //         const calendar = google.calendar({
    //             version: 'v3',
    //             auth: oauth2Client,
    //         });

    //         await calendar.calendars.delete({
    //             calendarId: idCalendar,
    //         });

    //         console.log("El calendario ha sido eliminado con éxito.");

    //     } catch (error: any) {
    //         console.error("Error al eliminar el calendario:", error);

    //         // Puedes manejar diferentes tipos de errores según el código de estado HTTP
    //         if (error.code === 404) {
    //             console.error("Calendario no encontrado.");
    //         } else if (error.code === 403) {
    //             console.error("Permisos insuficientes para eliminar el calendario.");
    //         } else if (error.code === 401) {
    //             console.error("No autenticado correctamente.");
    //         } else {
    //             console.error("Ocurrió un error inesperado.");
    //         }

    //         throw new CustomError('CalendarGoogleService.deleteCalendar', error);
    //     }
    // }


    async inviteUserToCalendar(
        // idUser: string,
        idCalendarGoogle: string,
        emailUserGoogle: string,
        roleCalendarGoogle: CalendarGoogleRoleType): Promise<void> {
        try {
            // const oauth2Client = await this.getOAuth2Client(idUser);

            const credentials = this.getGoogleAuthByCredentials();

            const calendar = google.calendar({
                version: 'v3',
                auth: credentials,
            });

            await calendar.acl.insert({
                calendarId: idCalendarGoogle,
                requestBody: {
                    role: roleCalendarGoogle,
                    scope: {
                        type: 'user',
                        value: emailUserGoogle,
                    },
                },
            });


            // const response = await calendar.acl.list({
            //     calendarId: idCalendarGoogle,
            // });

            // const aclRules = response.data.items || [];
            // const users = aclRules
            //     .filter(rule => rule.scope?.type === 'user')
            //     .map(rule => ({
            //         email: rule.scope?.value || '',
            //         role: rule.role || '',
            //     }));


            // console.log("mira los usuarios que tiene el calendario", users);

            console.log(`Usuario ${emailUserGoogle} ha sido invitado al calendario ${idCalendarGoogle} con rol ${roleCalendarGoogle}.`);

        } catch (error: any) {
            console.error("Error al invitar usuario al calendario:", error);

            if (error.code === 404) {
                console.error("Calendario no encontrado.");
            } else if (error.code === 403) {
                console.error("Permisos insuficientes para invitar usuarios al calendario.");
            } else if (error.code === 401) {
                console.error("No autenticado correctamente.");
            } else {
                console.error("Ocurrió un error inesperado.");
            }

            throw new CustomError('CalendarGoogleService.inviteUserToCalendar', error);
        }
    }


    async removeUserFromCalendar(
        idCalendarGoogle: string,
        emailUserGoogle: string
    ): Promise<void> {
        try {
            // Obtén las credenciales OAuth2 necesarias
            const credentials = this.getGoogleAuthByCredentials();

            // Crea una instancia del cliente de la API de Google Calendar
            const calendar = google.calendar({
                version: 'v3',
                auth: credentials,
            });

            // Elimina el usuario de la lista de control de acceso (ACL) del calendario
            await calendar.acl.delete({
                calendarId: idCalendarGoogle,
                ruleId: `user:${emailUserGoogle}`,
            });

            console.log(`Usuario ${emailUserGoogle} ha sido eliminado del calendario ${idCalendarGoogle}.`);

        } catch (error: any) {
            console.error("Error al eliminar usuario del calendario:", error);

            if (error.code === 404) {
                console.error("Calendario o usuario no encontrado.");
            } else if (error.code === 403) {
                console.error("Permisos insuficientes para eliminar usuarios del calendario.");
            } else if (error.code === 401) {
                console.error("No autenticado correctamente.");
            } else {
                console.error("Ocurrió un error inesperado.");
            }

            throw new CustomError('CalendarGoogleService.removeUserFromCalendar', error);
        }
    }

}
