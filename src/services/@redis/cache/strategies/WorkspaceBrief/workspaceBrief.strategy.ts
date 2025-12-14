// src/services/@cache/strategies/WorkspaceBriefStrategy.ts
import { WorkspaceBrief } from "../../interfaces/models/workspace-brief";
import { RedisCacheService } from "../../redis.service";
import { IRedisWorkspaceBriefStrategy } from "./interfaces";



/** ────────────────────────────────────────────────────────────────────────────
 *  Prefijos exportados (cluster-ready con hash tag {ws:<id>})
 *  ──────────────────────────────────────────────────────────────────────────── */
export const REDIS_WS_PREFIX_BRIEF = "workspace:brief"; // workspace:brief:{ws:<idWorkspace>}

/** TTLs */
export const DEFAULT_WS_BRIEF_TTL_SEC = Number(process.env.REDIS_TTL_WORKSPACE_BRIEF_SEC ?? 21600); // 6h
export const MAX_WS_BRIEF_TTL_SEC = 604800; // 7d

/** Helpers */
const sanitizeId = (s: string) => s.replace(/[{}]/g, ""); // por si acaso
const tagWs = (wsId: string) => `{ws:${sanitizeId(wsId)}}`;
const keyWsBrief = (wsId: string) => `${REDIS_WS_PREFIX_BRIEF}:${tagWs(wsId)}`;

export class WorkspaceBriefStrategy implements IRedisWorkspaceBriefStrategy {
    private redis = RedisCacheService.instance;

    private resolveTtl(ttl?: number): number {
        if (typeof ttl !== "number") return DEFAULT_WS_BRIEF_TTL_SEC;
        return Math.min(ttl, MAX_WS_BRIEF_TTL_SEC);
    }

    async setWorkspace(workspace: WorkspaceBrief, ttl?: number): Promise<void> {
        const key = keyWsBrief(workspace.id);
        await this.redis.set(key, JSON.stringify(workspace), this.resolveTtl(ttl));
    }

    async getWorkspaceById(idWorkspace: string): Promise<WorkspaceBrief | null> {
        const key = keyWsBrief(idWorkspace);
        const raw = await this.redis.get(key);
        return raw ? (JSON.parse(raw) as WorkspaceBrief) : null;
    }

    async deleteWorkspace(idWorkspace: string): Promise<void> {
        const key = keyWsBrief(idWorkspace);
        await this.redis.delete(key);
    }
}
