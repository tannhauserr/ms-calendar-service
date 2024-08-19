import { GoogleAccount, RoleType } from '@prisma/client';
import { google } from 'googleapis';
import CustomError from '../../models/custom-error/CustomError';
import { UtilGeneral } from '../../utils/util-general';
import { GoogleAccountService } from '../@database/google-account/google-account.service';
import exp from 'constants';

export class GoogleOauthService {
    private static _instance: GoogleOauthService;

    private readonly oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );
    private readonly scopes = {
        [RoleType.ROLE_ADMIN]: process.env.GOOGLE_SCOPES_ADMIN,
        [RoleType.ROLE_USER]: process.env.GOOGLE_SCOPES_USER
    };

    // Hacemos el constructor privado para evitar que se instancie directamente
    private constructor() { }

    public static get instance(): GoogleOauthService {
        return this._instance || (this._instance = new this());
    }

    getAuthUrl(roleType: RoleType, state: any) {
        try {
            console.log('scopes', this.scopes[roleType]);
            console.log("ahora esto", this.oauth2Client);
            return this.oauth2Client.generateAuthUrl({
                access_type: 'offline',
                scope: JSON.parse(this.scopes[roleType] || '[]'),
                state: state,
            });
        } catch (err: any) {
            new CustomError('GoogleOauthService.getAuthUrl', err);
        }
    }


    async handleCallback(code: string) {
        try {
            const { tokens } = await this.oauth2Client.getToken(code);
            this.oauth2Client.setCredentials(tokens);

            const { access_token, refresh_token, expiry_date } = tokens;

            return {
                accessToken: access_token,
                refreshToken: refresh_token,
                tokenExpiryDate: expiry_date,
            };
        } catch (error: any) {
            throw new CustomError('GoogleOauthService.handleCallback', error);
        }
    }


    async refreshAccessTokenIfNeeded(
        googleAccountService: GoogleAccountService,
        idUser: string
    ): Promise<{
        isNew: boolean; tokenData: {
            accessToken: string,
            refreshToken: string,
            tokenExpiryDate?: number
        }
    }> {
        const googleAccount = await googleAccountService.getByIdUserFk(idUser);

        if (!googleAccount || !googleAccount.googleAccessToken || !googleAccount.googleTokenExpiryDate) {
            throw new CustomError("GoogleOauthService.refreshAccessTokenIfNeeded", new Error("No se encontraron las credenciales de Google para este usuario"));
        }

        const currentTime = new Date();
        const expiryDate = new Date(googleAccount.googleTokenExpiryDate.getTime());
        const timeDifference = expiryDate.getTime() - currentTime.getTime();

        // Verificar si el token expira en los próximos 10 minutos (600000 ms)
        if (timeDifference <= 600000) {
            // if (true) {

            console.log('El access_token está cerca de expirar, refrescando...');

            const oauth2Client = new google.auth.OAuth2(
                process.env.GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET,
                process.env.GOOGLE_REDIRECT_URI
            );

            oauth2Client.setCredentials({
                refresh_token: googleAccount.googleRefreshToken,
            });

            const newTokens = await oauth2Client.refreshAccessToken();
            const { access_token, refresh_token, expiry_date } = newTokens.credentials;

            return {
                isNew: true,
                tokenData: {
                    accessToken: access_token!,
                    refreshToken: refresh_token || googleAccount.googleRefreshToken!,
                    tokenExpiryDate: expiry_date || 0,
                },
            };
        } else {
            console.log('El access_token aún es válido.');
            return {
                isNew: false,
                tokenData: {
                    accessToken: googleAccount.googleAccessToken!,
                    refreshToken: googleAccount.googleRefreshToken!,
                },
            };
        }
    }



    private async refreshAccessToken(googleAccount: GoogleAccount, googleAccountService: GoogleAccountService): Promise<void> {
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );

        oauth2Client.setCredentials({
            refresh_token: googleAccount.googleRefreshToken,
        });

        const newTokens = await oauth2Client.refreshAccessToken();
        const { access_token, refresh_token, expiry_date } = newTokens.credentials;

        await googleAccountService.update({
            id: googleAccount.id,
            googleAccessToken: access_token,
            googleRefreshToken: refresh_token || googleAccount.googleRefreshToken,
            googleTokenExpiryDate: UtilGeneral.getCorrectUTCDate(new Date(expiry_date || 0)),
        });

        console.log('access_token actualizado exitosamente.');
    }
}
