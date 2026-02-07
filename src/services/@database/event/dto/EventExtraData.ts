import { EventStatusType, RecurrenceStatusType } from "@prisma/client";

/**
 * DTO para los datos extra de un evento.
 */
export interface EventExtraData {
    id: string;
    idServiceFk?: string | null;
    description?: string | null;
    commentClient?: string | null;
    isCommentRead?: boolean | null;
    serviceNameSnapshot?: string;
    servicePriceSnapshot?: number;
    serviceDiscountSnapshot?: number;
    serviceDurationSnapshot?: number; // duración en minutos
    serviceMaxParticipantsSnapshot?: number;

    // Participantes
    eventParticipant: {
        id: string;
        idClientWorkspaceFk: string | null;
        idClientFk: string | null;
        eventStatusType: EventStatusType;
    }[];

    // Regla de recurrencia (puede no existir)
    recurrenceRule?: {
        id: string;
        dtstart: Date;
        until: Date | null;
        rrule: string;
        rdates: any[];
        tzid: string;
        recurrenceStatusType: RecurrenceStatusType;
    };

    // Servicio (puede no existir)
    service?: {
        id: string;
        name: string;
        duration: number;
        price: number;
        discount: number;
        serviceType: any;
        color: string;
    };
}