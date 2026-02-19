/**
 * Regla para validar que el evento original de una actualización exista y siga activo.
 */
export class OriginalEventExistsPolicy {
    /**
     * Devuelve true cuando el evento existe y no tiene borrado lógico.
     */
    public static exists(event: { deletedDate?: Date | null } | null | undefined): boolean {
        return !!event && !event.deletedDate;
    }
}
