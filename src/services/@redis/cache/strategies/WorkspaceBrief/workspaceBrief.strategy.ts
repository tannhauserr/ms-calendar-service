
import { IRedisWorkspaceBriefStrategy } from "../../interfaces/interfaces";
import { WorkspaceBrief } from "../../interfaces/models/workspace-brief";
import { RedisCacheService } from "../../redis.service";

const PREFIX_WS = "workspace:brief";

export class WorkspaceBriefStrategy implements IRedisWorkspaceBriefStrategy {
    private redis = RedisCacheService.instance;

    async setWorkspace(workspace: WorkspaceBrief, ttl?: number): Promise<void> {
        const key = `${PREFIX_WS}:${workspace.id}`;
        await this.redis.set(key, JSON.stringify(workspace), ttl);
    }

    async getWorkspaceById(idWorkspace: string): Promise<WorkspaceBrief | null> {
        const key = `${PREFIX_WS}:${idWorkspace}`;
        const raw = await this.redis.get(key);
        return raw ? (JSON.parse(raw) as WorkspaceBrief) : null;
    }

    async deleteWorkspace(idWorkspace: string): Promise<void> {
        const key = `${PREFIX_WS}:${idWorkspace}`;
        await this.redis.delete(key);
    }
}
