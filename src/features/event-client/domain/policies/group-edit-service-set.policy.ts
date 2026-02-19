/**
 * Regla de edición grupal: no permite cambiar el conjunto de servicios.
 */
export class GroupEditServiceSetPolicy {
    /**
     * Devuelve true cuando el cambio solicitado respeta el conjunto original de servicios.
     */
    public static canEdit(mode: "single" | "group", sameServiceSet: boolean): boolean {
        return mode !== "group" || sameServiceSet;
    }
}
