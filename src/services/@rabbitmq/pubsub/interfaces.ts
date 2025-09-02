export type RequestNotificationPayload =
    | {
        operation: "create";
        data: CreateNotificationInput;
    }
    | {
        operation: "update";
        data: {
            notificationId: string;
            updateData: UpdateNotificationInput;
        };
    }
    | {
        operation: "delete";
        data: {
            deleteNotificationId: string;
        };
    };


/***********************************************
 * Enums (similares a los definidos en tu schema de Prisma)
 ***********************************************/
export enum NotificationType {
    INTERNAL = "INTERNAL",
    WHATSAPP = "WHATSAPP",
    EMAIL = "EMAIL",
}

export enum AudienceType {
    INDIVIDUAL = "INDIVIDUAL",
    GENERAL = "GENERAL",
}

// Lista simplificada de LanguageCode (puedes ponerlos todos)
// Lista amplia de códigos de idioma (ISO 639-1)
export enum LanguageCode {
    AF, // Afrikaans
    AR, // Arabic
    AZ, // Azerbaijani
    BG, // Bulgarian
    BN, // Bengali
    BS, // Bosnian
    CA, // Catalan
    CS, // Czech
    DA, // Danish
    DE, // German
    EL, // Greek
    EN, // English
    ES, // Spanish
    ET, // Estonian
    FA, // Persian
    FI, // Finnish
    FR, // French
    HE, // Hebrew
    HI, // Hindi
    HR, // Croatian
    HU, // Hungarian
    ID, // Indonesian
    IT, // Italian
    JA, // Japanese
    KO, // Korean
    LT, // Lithuanian
    LV, // Latvian
    MK, // Macedonian
    MN, // Mongolian
    MS, // Malay
    NB, // Norwegian Bokmål
    NL, // Dutch
    NN, // Norwegian Nynorsk
    PL, // Polish
    PT, // Portuguese
    RO, // Romanian
    RU, // Russian
    SK, // Slovak
    SL, // Slovenian
    SQ, // Albanian
    SR, // Serbian
    SV, // Swedish
    TH, // Thai
    TR, // Turkish
    UK, // Ukrainian
    UR, // Urdu
    VI, // Vietnamese
    ZH // Chinese
}

/***********************************************
 * Tipos para los datos de entrada (basados en tu lógica de negocio)
 ***********************************************/
export type CreateNotificationInput = {
    idClientWorkspaceFk: string;
    type: NotificationType;  // 'INTERNAL' | 'WHATSAPP' | 'EMAIL'
    audience: AudienceType;  // 'INDIVIDUAL' | 'GENERAL'
    languageCode?: LanguageCode; // Opcional, se usa el default "ES" si no se provee
    title: string;
    message: string;
    // Datos opcionales para cada tipo de notificación
    internalNotificationData?: {
        scheduledDate?: Date;
        idUserFk: string;
    };
    emailNotificationData?: {
        scheduledDate?: Date;
        subject?: string;
        body?: string;
    };
    whatsappNotificationData?: {
        scheduledDate?: Date;
        subject?: string;
        body?: string;
    };
    // Lista de destinatarios
    recipients: Array<{
        idClientWorkspaceFk?: string;
        idUserFk?: string;
    }>;
};

export type UpdateNotificationInput = {
    title?: string;
    message?: string;
    languageCode?: LanguageCode;
    // Actualización de notificaciones hijas de forma opcional
    internalNotificationData?: {
        scheduledDate?: Date;
        idUserFk?: string;
        sent?: boolean;
    };
    emailNotificationData?: {
        scheduledDate?: Date;
        subject?: string;
        body?: string;
        sent?: boolean;
    };
    whatsappNotificationData?: {
        scheduledDate?: Date;
        subject?: string;
        body?: string;
        sent?: boolean;
    };
    // Puedes agregar actualizaciones para destinatarios o gestionarlos de forma separada
};