import { WorkspaceBrief } from "../../interfaces/models/workspace-brief";

export interface IRedisWorkspaceBriefStrategy {
    /**
     * Guarda snapshot de workspace por id.
     */
    setWorkspace(workspace: WorkspaceBrief, ttl?: number): Promise<void>;

    /**
     * Recupera snapshot por id.
     */
    getWorkspaceById(idWorkspace: string): Promise<WorkspaceBrief | null>;

    /**
     * Elimina snapshot.
     */
    deleteWorkspace(idWorkspace: string): Promise<void>;
}