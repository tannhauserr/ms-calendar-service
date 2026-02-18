/**
 * Regla para revalidar disponibilidad tras el cálculo secuencial.
 */
export class AvailabilityRecheckPolicy {
    /**
     * Devuelve true cuando la revalidación indica que el slot sigue disponible.
     */
    public static isAvailable(recheckResult: boolean): boolean {
        return recheckResult === true;
    }
}
