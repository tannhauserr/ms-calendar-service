/**
 * Regla de límites máximos de servicios por reserva.
 */
export class MaxServicesPerBookingPolicy {
    /**
     * Devuelve true cuando la cantidad de servicios no supera el máximo configurado.
     */
    public static isWithinLimit(attendeesCount: number, maxPerBooking: number): boolean {
        return attendeesCount <= maxPerBooking;
    }
}
