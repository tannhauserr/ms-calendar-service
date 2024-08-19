import { GoogleOauthService } from "../../services/google-oauth/google-outh.service";
import { JWTService } from "../../services/jwt/jwt.service";
import { Response } from "../../models/messages/response";
import { GoogleAccountService } from "../../services/@database/google-account/google-account.service";
import { google } from 'googleapis';
import CustomError from "../../models/custom-error/CustomError";

export class GoogleOauthController {
    public googleOauthService: GoogleOauthService;
    public jwtService: JWTService;


    constructor() {
        this.googleOauthService = GoogleOauthService.instance;
        this.jwtService = JWTService.instance;
    }

    getAuthUrl = async (req: any, res: any) => {
        try {
            const token = req.token;
            const { redirectUrl } = req.query;
            const decode = await this.jwtService.verify(token);
            const { role, idUser } = decode;

            console.log("decode", decode);

            if (!role || !idUser) {
                res.status(401).json(Response.build("No tiene permisos para acceder a esta ruta", 401, false));
                return;
            }

            console.log("1")
            const state = await this.jwtService.sign({ idUser, role, redirectFrontUrl: redirectUrl, nowDate: new Date() });
            console.log("2", state)
            const url = this.googleOauthService.getAuthUrl(role, state);
            console.log("3", url)

            // Redirige al usuario a la URL de Google para que autorice
            res.status(200).json(Response.build("URL de autenticación obtenida", 200, true, { url }));

        } catch (err) {
            console.error(err);
            res.status(500).json({ message: "Hubo un error al obtener la URL de autenticación" });
        }
    }

    // Este es el callback donde manejas el intercambio del código por tokens
    googleCallback = async (req: any, res: any) => {


        const url = process.env.URL_FRONT;

        try {
            const { code, state } = req.query; // Código de autorización devuelto por Google

            // Verifica que el estado sea el mismo que el que se envió
            const stateDecode = await this.jwtService.verify(state);

            console.log("stateDecode", stateDecode);

            if (!stateDecode
                || !stateDecode.idUser
                || !stateDecode.role
                || !stateDecode.nowDate
                || !stateDecode.redirectFrontUrl) {
                res.redirect(302, url);
                // res.status(401).json(Response.build("No tiene permisos para acceder a esta ruta", 401, false));
                return;
            }

            const googleOauthService = GoogleOauthService.instance;
            const tokens = await googleOauthService.handleCallback(code);

            const googleAccountService = new GoogleAccountService();
            // const exist = await googleAccountService.getByIdUserFk(stateDecode.idUser);
            let response = await googleAccountService.upsertGoogleAccount(tokens, stateDecode.idUser, "");

            console.log("mira que es response", response);

            let redirectUrl = stateDecode.redirectFrontUrl + "?googleAuth=true";
            res.redirect(302, redirectUrl);
            // res.status(200).json(Response.build("Autenticación exitosa", 200, true, response));
        } catch (err) {
            console.error(err);
            res.redirect(302, url);

        }
    }


    // Función para comprobar los scopes del usuario
    // Función para comprobar los scopes del usuario
    // checkUserScopes = async (req: any, res: any) => {
    //     try {
    //         const { idUser } = req.body;  // Supongamos que el idUser se pasa como parámetro en la URL

    //         // Inicializar el servicio de Google Account
    //         const googleAccountService = new GoogleAccountService();

    //         // Llamar a refreshAccessTokenIfNeeded para obtener el token actualizado
    //         const googleOauthService = GoogleOauthService.instance;
    //         const { isNew, tokenData } = await googleOauthService.refreshAccessTokenIfNeeded(googleAccountService, idUser);

    //         if (!tokenData.accessToken) {
    //             return res.status(401).json(Response.build("El usuario no ha autorizado a la aplicación", 401, false));
    //         }

    //         let credentialsAux = {
    //             access_token: tokenData.accessToken,
    //             refresh_token: tokenData.refreshToken,
    //         };

    //         console.log("Credenciales a usar:", credentialsAux);

    //         if (isNew) {
    //             console.log("Se ha generado un nuevo token");

    //             // Actualizar el token en la base de datos
    //             const googleAccount = await googleAccountService.upsertGoogleAccount(tokenData, idUser, "");
    //             credentialsAux = {
    //                 access_token: googleAccount.googleAccessToken,
    //                 refresh_token: googleAccount.googleRefreshToken,
    //             };

    //             console.log("googleAccount actualizado", googleAccount);
    //         } else {
    //             console.log("Se está utilizando el token antiguo");
    //         }

    //         // Verificar que los tokens no son undefined o null
    //         if (!credentialsAux.access_token || !credentialsAux.refresh_token) {
    //             throw new CustomError("Las credenciales del token son inválidas", new Error("access_token o refresh_token es undefined o null"));
    //         }

    //         // Configurar el cliente OAuth2 de Google con el token actualizado o existente
    //         const oauth2Client = new google.auth.OAuth2();
    //         oauth2Client.setCredentials({
    //             access_token: credentialsAux.access_token,
    //             refresh_token: credentialsAux.refresh_token,
    //         });

    //         // console.log("oauth2Client configurado:", oauth2Client.credentials);

    //         try {
    //             // Intentar obtener los scopes del usuario
    //             const tokenInfo = await oauth2Client.getTokenInfo(oauth2Client.credentials.access_token);
    //             return res.status(200).json(Response.build("Scopes del usuario obtenidos", 200, true, { scopes: tokenInfo.scopes }));
    //         } catch (err: any) {
    //             throw new CustomError("El token de acceso ha expirado", err);
    //         }

    //     } catch (error: any) {
    //         console.error(error);
    //         if (error.originalError?.response?.data?.error === 'invalid_token') {
    //             return res.status(404).json(Response.build("El token de google es inválido", 404, false));
    //         } else {
    //             return res.status(404).json(Response.build("Hubo un error al comprobar los scopes del usuario", 404, false));
    //         }
    //     }
    // }



    // Refactorización de la función checkUserScopes
    checkUserScopes = async (req: any, res: any) => {
        try {
            const { idUser } = req.body;
            const googleAccountService = new GoogleAccountService();
            const googleOauthService = GoogleOauthService.instance;

            // Inicializar y obtener los tokens
            const credentialsAux = await this._initializeAndRefreshTokens(idUser, googleAccountService, googleOauthService);

            // Configurar el cliente OAuth2
            const oauth2Client = this._configureOAuthClient(credentialsAux);

            // Intentar obtener los scopes del usuario
            const scopes = await this._getUserScopes(oauth2Client);
            return res.status(200).json(Response.build("Scopes del usuario obtenidos", 200, true, { scopes }));

        } catch (error: any) {
            console.error(error);
            if (error.originalError?.response?.data?.error === 'invalid_token') {
                try {
                    // Intentar refrescar el token y obtener los scopes de nuevo
                    const { idUser } = req.body;
                    const googleAccountService = new GoogleAccountService();
                    const googleOauthService = GoogleOauthService.instance;
                    const scopes = await this._refreshTokenAndRetrieveScopes(idUser, googleAccountService, googleOauthService);
                    return res.status(200).json(Response.build("Scopes del usuario obtenidos tras refrescar el token", 200, true, { scopes }));
                } catch (refreshError) {
                    console.error(refreshError);
                    return res.status(404).json(Response.build("El token de google es inválido y no se pudo refrescar", 404, false));
                }
            } else {
                return res.status(404).json(Response.build("Hubo un error al comprobar los scopes del usuario", 404, false));
            }
        }
    }


    /**
     * Refresca el token y obtiene los scopes del usuario
     * @param idUser 
     * @param googleAccountService 
     * @param googleOauthService 
     * @returns 
     */
    private async _refreshTokenAndRetrieveScopes(idUser: string, googleAccountService: GoogleAccountService, googleOauthService: GoogleOauthService): Promise<string[]> {
        try {
            const credentialsAux = await this._initializeAndRefreshTokens(idUser, googleAccountService, googleOauthService);
            const oauth2Client = this._configureOAuthClient(credentialsAux);
            const scopes = await this._getUserScopes(oauth2Client);
            return scopes;
        } catch (err: any) {
            throw new CustomError("Fallo al refrescar el token y obtener los scopes", err);
        }
    }


    /**
     * Inicializa y refresca los tokens de Google
     * @param idUser
     * @param googleAccountService
     * @param googleOauthService
     * @returns
     */
    private async _initializeAndRefreshTokens(idUser: string, googleAccountService: GoogleAccountService, googleOauthService: GoogleOauthService) {
        const { isNew, tokenData } = await googleOauthService.refreshAccessTokenIfNeeded(googleAccountService, idUser);

        if (!tokenData.accessToken) {
            throw new CustomError("El usuario no ha autorizado a la aplicación", new Error("No access token available"));
        }

        let credentialsAux = {
            access_token: tokenData.accessToken,
            refresh_token: tokenData.refreshToken,
        };

        if (isNew) {
            console.log("Se ha generado un nuevo token");
            const googleAccount = await googleAccountService.upsertGoogleAccount(tokenData, idUser, "");
            credentialsAux = {
                access_token: googleAccount.googleAccessToken,
                refresh_token: googleAccount.googleRefreshToken,
            };
        } else {
            console.log("Se está utilizando el token antiguo");
        }

        return credentialsAux;
    }


    /**
     * Configura el cliente OAuth2 de Google
     * @param credentials 
     * @returns
     */
    private _configureOAuthClient(credentials: { access_token: string, refresh_token: string }) {
        if (!credentials.access_token || !credentials.refresh_token) {
            throw new CustomError("Las credenciales del token son inválidas", new Error("access_token o refresh_token es undefined o null"));
        }

        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({
            access_token: credentials.access_token,
            refresh_token: credentials.refresh_token,
        });

        return oauth2Client;
    }

    /**
     * Devuelve los scopes del usuario
     * @param oauth2Client 
     * @returns 
     */
    private async _getUserScopes(oauth2Client: any) {
        try {
            const tokenInfo = await oauth2Client.getTokenInfo(oauth2Client.credentials.access_token);
            return tokenInfo.scopes;
        } catch (err: any) {
            throw new CustomError("El token de acceso ha expirado", err);
        }
    }

    // Nueva función para manejar el intento de refrescar el token en caso de error
    // private async _handleInvalidTokenError(idUser: string, googleAccountService: GoogleAccountService, googleOauthService: GoogleOauthService) {
    //     try {
    //         const credentialsAux = await this._initializeAndRefreshTokens(idUser, googleAccountService, googleOauthService);
    //         const oauth2Client = this._configureOAuthClient(credentialsAux);
    //         const scopes = await this._getUserScopes(oauth2Client);
    //         return scopes;
    //     } catch (err: any) {
    //         throw new CustomError("Fallo al refrescar el token", err);
    //     }
    // }



}