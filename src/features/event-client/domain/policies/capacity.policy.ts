/**
 * Regla de capacidad para eventos grupales.
 */
export class CapacityPolicy {
    /**
     * Devuelve true si queda al menos una plaza disponible.
     */
    public static hasSeat(capacity: number, currentParticipants: number): boolean {
        const safeCapacity = Math.max(1, capacity || 1);
        return currentParticipants < safeCapacity;
    }
}
