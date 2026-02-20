import { Workspace } from "../../interfaces/models/workspace";

export interface IRedisSavedWorkspaceStrategy {
    setSavedWorkspaceByIdWorkspace(
        idWorkspace: string,
        codeWorkspace: Workspace,
        ttl?: number
    ): Promise<void>;

    updateSavedWorkspaceByIdWorkspace(
        idWorkspace: string,
        workspace: Workspace,
        ttl?: number
    ): Promise<void>;

    getSavedWorkspaceByIdWorkspace(idWorkspace: string): Promise<Workspace | null>;

    getSavedWorkspaceByCode(code: string): Promise<Workspace | null>;

    deleteSavedWorkspaceByIdWorkspace(idWorkspace: string, code?: string | null): Promise<void>;
}
