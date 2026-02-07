
// import { EventPurposeType, EventSourceType, EventStatusType } from "./event"
// import { RecurrenceStatusType } from "./recurrence-rule"

import { EventPurposeType, EventSourceType, EventStatusType, RecurrenceStatusType } from "@prisma/client"
import { RecurrenceRuleUpdate } from "../../recurrence-rule/types"
import { Service } from "../../../../models/rabbitmq/getCateroiesAndServicesResponse";



// export interface RecurrenceRuleUpdate {
//     /** El id de la regla original (si existía) */
//     id?: string;
//     /** Nueva fecha de inicio (si se ha modificado) */
//     dtstart?: Date | string;
//     /** Nuevo “hasta” (si se ha modificado o para anular final) */
//     until?: Date | string | null;
//     /** Cadena iCal rrule (frecuencia/días/etc) */
//     rrule?: string;
//     /** Zona horaria (si ha cambiado) */
//     tzid?: string;
//     /** Estado de la recurrencia (normalmente unchanged o updated) */
//     recurrenceStatusType?: RecurrenceStatusType;
//     /**
//      * Ámbito de aplicación del cambio:
//      * - 'THIS' → solo esta cita
//      * - 'FUTURE' → esta y las siguientes
//      * - 'ALL' → toda la serie
//      */
//     scope: 'THIS' | 'FUTURE' | 'ALL';
// }


/**
 * Interfaz para crear/editar un evento en el backend.
 */
export interface EventForBackend {
    skipMainEvent?: boolean;
    event: {
        id?: string
        title: string
        description?: string | null
        startDate: Date
        endDate: Date
        idUserPlatformFk?: string | null
        commentClient?: string | null
        idRecurrenceRuleFk?: string | null
        eventSourceType?: EventSourceType
        eventPurposeType: EventPurposeType
        isEditableByClient?: boolean
        numberUpdates?: number | null
        eventStatusType?: EventStatusType,
        // idCalendarFk: string,
        idWorkspaceFk: string,
        idCompanyFk: string,
        idServiceFk?: string | null
        idGroup?: string | null
        // Se puede meter service, pero vendria del MS-BookingPage
        service?: {
            id: string,
            name: string,
            duration: number,
            price: number,
            discount: number,
            serviceType: string | null,
            color: string,
            image?: string | null,
            maxParticipants?: number | null
        },


        serviceNameSnapshot?: string | null
        servicePriceSnapshot?: number | null
        serviceDiscountSnapshot?: number | null
        serviceDurationSnapshot?: number | null // duración en minutos
        serviceMaxParticipantsSnapshot?: number | null



        createdDate?: Date
        updatedDate?: Date
    },
    // recurrenceRule?: Prisma.RecurrenceRuleCreateInput | null
    recurrenceRule?: {
        id?: string
        dtstart: Date | string
        until?: Date | string | null
        rrule: string
        rdates?: string[] | null
        tzid: string
        recurrenceStatusType?: RecurrenceStatusType
        idCalendarFk?: string | null
    },
    recurrenceRuleUpdate?: RecurrenceRuleUpdate;
    eventParticipant?: {
        id?: string;
        idEventFk?: string;
        idClientWorkspaceFk?: string;
        idClientFk?: string;
    }[]
    eventParticipantDelete?: {
        id?: string;
    }[]
}