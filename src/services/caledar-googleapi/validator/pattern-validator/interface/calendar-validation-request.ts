export interface CalendarValidationRequest {
    idUser?: string;
    calendarId?: string;
    eventId?: string;
    eventData?: {
        summary: string;
        startDate: string;
        endDate: string;
        [key: string]: any; // Para otros campos personalizados del evento
    };
    // [key: string]: any; // Para campos adicionales en el futuro
}
