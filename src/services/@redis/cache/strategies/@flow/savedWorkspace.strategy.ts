// strategies/saved-workspace.strategy.ts
import { RedisCacheService } from "../../redis.service";
import { TIME_SECONDS } from "../../../../../constant/time";
import { Workspace } from "../../interfaces/models/workspace";
import { IRedisSavedWorkspaceStrategy } from "../../interfaces/interfaces";


// helpers centralizados para las keys
const WorkspaceKeys = {
    byId: (id: string) => `ws:${id}`,
    byCode: (code: string) => `ws:code:${code.trim().toLowerCase()}`
};

export class SavedWorkspaceStrategy implements IRedisSavedWorkspaceStrategy {
    private redisService = RedisCacheService.instance;

    public async setSavedWorkspaceByIdWorkspace(
        idWorkspace: string,
        workspace: Workspace,
        ttl: number = TIME_SECONDS.HOUR
    ): Promise<void> {
        const idKey = WorkspaceKeys.byId(idWorkspace);

        // guardamos objeto canónico
        await this.redisService.set(idKey, JSON.stringify(workspace), ttl);

        // si tiene code, guardamos índice → id
        if (workspace.code) {
            const codeKey = WorkspaceKeys.byCode(workspace.code);
            await this.redisService.set(codeKey, idWorkspace, ttl);
        }
    }

    public async updateSavedWorkspaceByIdWorkspace(
        idWorkspace: string,
        workspace: Workspace,
        ttl: number = TIME_SECONDS.HOUR
    ): Promise<void> {
        await this.setSavedWorkspaceByIdWorkspace(idWorkspace, workspace, ttl);
    }

    public async getSavedWorkspaceByIdWorkspace(
        idWorkspace: string
    ): Promise<Workspace | null> {
        const key = WorkspaceKeys.byId(idWorkspace);
        const data = await this.redisService.get(key);
        return data ? (JSON.parse(data) as Workspace) : null;
    }

    public async getSavedWorkspaceByCode(
        code: string
    ): Promise<Workspace | null> {
        const codeKey = WorkspaceKeys.byCode(code);
        const id = await this.redisService.get(codeKey);
        if (!id) return null;
        return this.getSavedWorkspaceByIdWorkspace(id);
    }

    public async deleteSavedWorkspaceByIdWorkspace(
        idWorkspace: string,
        code?: string | null
    ): Promise<void> {
        const idKey = WorkspaceKeys.byId(idWorkspace);
        await this.redisService.delete(idKey);

        if (code) {
            const codeKey = WorkspaceKeys.byCode(code);
            await this.redisService.delete(codeKey);
        }
    }
}
