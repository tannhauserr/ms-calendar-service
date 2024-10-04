import { google, calendar_v3 } from 'googleapis';
import { UtilGeneral } from '../../../utils/util-general';
import { ChannelCalendar } from '../interfaces/channel-calendar';
import { RedisCacheService } from '../../@redis/cache/redis.service';
import { TokenKeys } from '../../@redis/cache/keys/token.keys';
import CustomError from '../../../models/custom-error/CustomError';

export class ChannelCalendarGoogleApiService {
    private redisService = RedisCacheService.instance;

    private async getGoogleAuthByCredentials() {
        const auth = new google.auth.GoogleAuth({
            keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
            scopes: ['https://www.googleapis.com/auth/calendar'],
        });
        return auth;
    }

    async saveChannelCalendar(channelConfig: ChannelCalendar): Promise<void> {
        try {
            const key = TokenKeys.channelConfigCalendar();
            await this.redisService.set(key, JSON.stringify(channelConfig));
            console.log("Channel configuration saved to Redis.");
        } catch (error: any) {
            throw new CustomError('ChannelCalendarGoogleApiService.saveChannelCalendar', error);
        }
    }

    async stopChannel(channelId: string, resourceId: string): Promise<void> {
        try {
            const credentials = await this.getGoogleAuthByCredentials();
            const calendar = google.calendar({
                version: 'v3',
                auth: credentials,
            });

            await calendar.channels.stop({
                requestBody: {
                    id: channelId,
                    resourceId: resourceId,
                },
            });

            console.log(`Canal ${channelId} ha sido cerrado.`);
        } catch (error: any) {
            if (error.message.includes('Channel') && error.message.includes('not found')) {
                // Si el canal no se encuentra, solo se registra y no se lanza un error.
                console.log(`El canal ${channelId} no se encontró y no pudo ser cerrado.`);
                // Guardamos el error en el log, pero no lanzamos nada
                new CustomError('ChannelCalendarGoogleApiService.stopChannel', error, 'simple');

            } else {
                // Si es otro tipo de error, lo lanzamos como CustomError.
                throw new CustomError('ChannelCalendarGoogleApiService.stopChannel', error);
            }
        }
    }

    async startChannel(calendarId: string, configChannel: ChannelCalendar, ttl_seconds: string): Promise<ChannelCalendar> {
        try {
            const credentials = await this.getGoogleAuthByCredentials();
            const calendar = google.calendar({
                version: 'v3',
                auth: credentials,
            });


            console.log("que es ttl_seconds: ", ttl_seconds);
            const response = await calendar.events.watch({
                calendarId: calendarId,
                requestBody: {
                    id: configChannel.channelId,
                    type: configChannel.type,
                    address: configChannel.address,
                    params: {
                        ttl: ttl_seconds,
                    },
                },
            });

            console.log(`Nuevo canal iniciado para el calendario ${calendarId}.`);

            const responseData = response.data;

            const newChannelConfig = {
                ...configChannel,
                resourceId: responseData.resourceId || '',
                expiration: responseData.expiration && +responseData.expiration ? +responseData.expiration : 0,
            };

            // Guarda la nueva configuración del canal en Redis
            await this.saveChannelCalendar(newChannelConfig);

            return newChannelConfig;
        } catch (error: any) {
            throw new CustomError('ChannelCalendarGoogleApiService.startChannel', error);
        }
    }

    async refreshChannel(calendarId: string, channelConfig: ChannelCalendar, ttl_seconds: string): Promise<ChannelCalendar> {
        try {
            // Detén el canal existente
            if (channelConfig.channelId && channelConfig.resourceId) {
                await this.stopChannel(channelConfig.channelId, channelConfig.resourceId);
            }

            // Inicia un nuevo canal
            const newChannel = await this.startChannel(calendarId, channelConfig, ttl_seconds);

            // Guarda la nueva configuración del canal en Redis
            await this.saveChannelCalendar(newChannel);

            return newChannel;
        } catch (error: any) {
            throw new CustomError('ChannelCalendarGoogleApiService.refreshChannel', error);
        }
    }
}
