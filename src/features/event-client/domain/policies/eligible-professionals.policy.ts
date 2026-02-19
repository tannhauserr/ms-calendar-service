/**
 * Reglas para verificar si existe al menos un profesional elegible.
 */
export class EligibleProfessionalsPolicy {
    /**
     * Devuelve true cuando la lista final de profesionales no está vacía.
     */
    public static hasAny(userIds: string[]): boolean {
        return Array.isArray(userIds) && userIds.length > 0;
    }
}
