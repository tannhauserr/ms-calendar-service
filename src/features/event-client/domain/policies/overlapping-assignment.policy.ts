/**
 * Regla para detectar conflictos de solape durante asignaciones de profesionales.
 */
export class OverlappingAssignmentPolicy {
    /**
     * Devuelve true cuando existe un evento que solapa con el segmento objetivo.
     */
    public static hasConflict(overlappingEvent: { id?: string } | null | undefined): boolean {
        return !!overlappingEvent?.id;
    }
}
