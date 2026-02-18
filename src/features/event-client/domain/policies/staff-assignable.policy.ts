/**
 * Regla para validar el resultado de asignación de profesional.
 */
export class StaffAssignablePolicy {
    /**
     * Devuelve true cuando la estrategia de asignación devolvió un profesional válido.
     */
    public static canAssign(staffId: string | null | undefined): boolean {
        return typeof staffId === "string" && staffId.length > 0;
    }
}
