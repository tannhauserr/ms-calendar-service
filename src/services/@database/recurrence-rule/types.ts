import { RecurrenceStatusType } from "@prisma/client";

/** Ámbito de edición */
export type RecurrenceScope = 'THIS' | 'FUTURE' | 'ALL' | 'NEW';


export interface RecurrenceRuleUpdate {
    /** El id de la regla original (si existía) */
    id?: string;
    /** Nueva fecha de inicio (si se ha modificado) */
    dtstart?: Date | string;
    /** Nuevo “hasta” (si se ha modificado o para anular final) */
    until?: Date | string | null;
    /** Cadena iCal rrule (frecuencia/días/etc) */
    rrule?: string;
    /** Fechas adicionales (rdates) */
    rdates?: string[] | null
    /** Zona horaria (si ha cambiado) */
    tzid?: string;
    /** Estado de la recurrencia (normalmente unchanged o updated) */
    recurrenceStatusType?: RecurrenceStatusType;
    /**
     * Ámbito de aplicación del cambio:
     * - 'THIS' → solo esta cita
     * - 'FUTURE' → esta y las siguientes
     * - 'ALL' → toda la serie
     */
    scope: RecurrenceScope;
}