/**
 * Regla para asegurar que el evento pertenece al workspace esperado.
 */
export class EventWorkspacePolicy {
    /**
     * Devuelve true cuando el workspace del evento coincide con el recibido en contexto.
     */
    public static belongsToWorkspace(eventWorkspaceId: string | null | undefined, workspaceId: string): boolean {
        return typeof eventWorkspaceId === "string" && eventWorkspaceId === workspaceId;
    }
}
