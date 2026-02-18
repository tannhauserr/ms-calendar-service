/**
 * Regla de anticipación mínima para permitir una reserva.
 */
export class LeadTimePolicy {
    /**
     * Devuelve true si la fecha de inicio cumple el margen mínimo requerido.
     */
    public static canBook(
        startDate: Date,
        now: Date,
        minLeadMinutes = 0
    ): boolean {
        const minStartTime = now.getTime() + minLeadMinutes * 60 * 1000;
        return startDate.getTime() >= minStartTime;
    }
}
