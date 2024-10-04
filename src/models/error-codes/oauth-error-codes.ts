export enum GoogleOAuthErrorCodes {
    PERMISSIONS_REVOKED = 'GL801', // El usuario ha revocado los permisos de Google
    MISSING_CREDENTIALS = 'GL802', // No se encontraron las credenciales de Google en un googleAccount existente
    ACCOUNT_NOT_FOUND = 'GL803',   // No existe registro en googleAccount
    INVALID_TOKEN = 'GL804',       // El token de Google es inválido

    // Google Calendar
    CALENDAR_NOT_FOUND = 'GL805',  // No se encontró el calendario en Google
    EVENT_NOT_FOUND = 'GL806',     // No se encontró el evento en Google
    MISSING_EVENT_ID = 'GL807',    // No se encontró el id del evento
    MISSING_CALENDAR_ID = 'GL808', // No se encontró el id del calendario
    

}