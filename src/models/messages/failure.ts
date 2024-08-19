export namespace Message {

    export namespace Failure {

        // relacionado con el token del usuario
        export const TOKEN_FORBIDDEN = "No se ha mandado ningún token";
        export const TOKEN_NECCESARY = "Es necesario el uso del token";
        export const TOKEN_EXPIRED = "Token expirado";
        export const TOKEN_INVALID = "Token erróneo";

        export const ERROR_GENERIC = "Hubo un error en el servidor";

        // bot
        export const BOT_OFF = "Bot desconectado";
        export const BOT_EXCLUSION = "Exclusión de servicios";

    }
}