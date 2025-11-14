// src/services/@redis/cache/strategies/client/client-workspace-brief.strategy.ts
import { RedisCacheService } from "../../redis.service";
import type { ClientBrief, ClientWorkspaceBrief } from "../../interfaces/models/client-brief";
import type { IRedisClientWorkspaceBriefStrategy } from "../../interfaces/interfaces";

export const REDIS_CW_PREFIX_BRIEF = "clientWS:brief";
export const REDIS_CW_PREFIX_WS2IDS = "clientWS:ws2ids";
export const REDIS_CW_PREFIX_EMAIL = "clientWS:email";
export const REDIS_CW_PREFIX_PHONE = "clientWS:phone";
export const REDIS_CW_PREFIX_ID2WS = "clientWS:id2ws";
export const REDIS_CW_PREFIX_CLIENT_WS = "clientWS:clientId2clientWSIds";
export const REDIS_CW_PREFIX_CLIENT_ALL = "clientWS:clientId2clientWSIdsGlobal";

export const DEFAULT_CW_TTL_SEC = 21600; // 6h
export const MAX_CW_TTL_SEC = 604800; // 7d

const wsTag = (wsId: string) => `{ws:${wsId}}`;
const kBrief = (wsId: string, clientWSId: string) => `${REDIS_CW_PREFIX_BRIEF}:${wsTag(wsId)}:${clientWSId}`;
const kWs2Ids = (wsId: string) => `${REDIS_CW_PREFIX_WS2IDS}:${wsTag(wsId)}`;
const kEmail = (wsId: string, email: string) => `${REDIS_CW_PREFIX_EMAIL}:${wsTag(wsId)}:${email.toLowerCase()}`;
const kPhone = (wsId: string, e164: string) => `${REDIS_CW_PREFIX_PHONE}:${wsTag(wsId)}:${e164}`;
const kId2Ws = (clientWSId: string) => `${REDIS_CW_PREFIX_ID2WS}:${clientWSId}`;
const kClientWs = (wsId: string, clientId: string) => `${REDIS_CW_PREFIX_CLIENT_WS}:${wsTag(wsId)}:${clientId}`;
const kClientAll = (clientId: string) => `${REDIS_CW_PREFIX_CLIENT_ALL}:${clientId}`;

const normEmail = (s?: string) => (s ?? "").trim().toLowerCase();
const digits = (s?: string) => (s ?? "").replace(/\D+/g, "");
const toE164 = (cc?: string, num?: string) => {
    const code = (cc || "").trim();
    const n = digits(num);
    if (!code || !n) return "";
    const plus = code.startsWith("+") ? code : `+${code}`;
    return `${plus}${n}`;
};

export class ClientWorkspaceBriefStrategy implements IRedisClientWorkspaceBriefStrategy {
    private redis = RedisCacheService.instance;

    private ttl(ttl?: number) { return Math.min(typeof ttl === "number" ? ttl : DEFAULT_CW_TTL_SEC, MAX_CW_TTL_SEC); }
    private async readList(key: string): Promise<string[]> {
        const raw = await this.redis.get(key);
        if (!raw) return [];
        try { return JSON.parse(raw) as string[]; } catch { return []; }
    }
    private async writeList(key: string, list: any[], ttl?: number) {
        await this.redis.set(key, JSON.stringify(list), this.ttl(ttl));
    }

    async setClientWorkspace(clientWS: ClientWorkspaceBrief, ttl?: number): Promise<void> {
        const wsId = clientWS.idWorkspaceFk;
        const clientWSId = clientWS.id;
        if (!wsId || !clientWSId) return;

        // Derivar email/phone preferidos (en CW)
        const email = normEmail(clientWS.email);
        const e164 = toE164(clientWS.phoneCode, clientWS.phoneNumber);

        // Índices de workspace
        const list = await this.readList(kWs2Ids(wsId));
        if (!list.includes(clientWSId)) list.push(clientWSId);

        // Índice clientId -> [clientWSIds] en este workspace
        const clientId = clientWS.idClientFk || clientWS.client?.id;
        let clientWSIdsForClientWs: string[] = [];
        if (clientId) {
            clientWSIdsForClientWs = await this.readList(kClientWs(wsId, clientId));
            if (!clientWSIdsForClientWs.includes(clientWSId)) clientWSIdsForClientWs.push(clientWSId);
        }

        // Índice global de clientId -> [{ wsId, clientWSId }]
        let allEntries: { wsId: string; clientWSId: string }[] = [];
        if (clientId) {
            const raw = await this.redis.get(kClientAll(clientId));
            if (raw) { try { allEntries = JSON.parse(raw); } catch { allEntries = []; } }
            if (!allEntries.some(x => x.wsId === wsId && x.clientWSId === clientWSId)) {
                allEntries.push({ wsId, clientWSId });
            }
        }

        // Snapshot + índices (co-localizados por {ws:<id>})
        const p = this.redis.pipeline()
            .set(kBrief(wsId, clientWSId), JSON.stringify(clientWS), this.ttl(ttl))
            .set(kId2Ws(clientWSId), wsId, this.ttl(ttl))
            .set(kWs2Ids(wsId), JSON.stringify(list), this.ttl(ttl));

        if (email) p.set(kEmail(wsId, email), clientWSId, this.ttl(ttl));
        if (e164) p.set(kPhone(wsId, e164), clientWSId, this.ttl(ttl));
        if (clientId) p.set(kClientWs(wsId, clientId), JSON.stringify(clientWSIdsForClientWs), this.ttl(ttl));

        await p.exec();

        if (clientId) {
            await this.redis.set(kClientAll(clientId), JSON.stringify(allEntries), this.ttl(ttl));
        }
    }

    async getClientWorkspaceById(idClientWorkspace: string, idWorkspace?: string): Promise<ClientWorkspaceBrief | null> {
        let wsId = idWorkspace;
        if (!wsId) {
            wsId = await this.redis.get(kId2Ws(idClientWorkspace)) || undefined;
            if (!wsId) return null;
        }
        const raw = await this.redis.get(kBrief(wsId, idClientWorkspace));
        return raw ? (JSON.parse(raw) as ClientWorkspaceBrief) : null;
    }

    async getClientWorkspacesByWorkspace(idWorkspace: string): Promise<ClientWorkspaceBrief[]> {
        const ids = await this.readList(kWs2Ids(idWorkspace));
        if (!ids.length) return [];
        const items = await Promise.all(ids.map((id) => this.getClientWorkspaceById(id, idWorkspace)));
        return items.filter(Boolean) as ClientWorkspaceBrief[];
    }

    async getClientWorkspacesByClientId(idClient: string, idWorkspace?: string): Promise<ClientWorkspaceBrief[]> {
        if (idWorkspace) {
            const clientWSIds = await this.readList(kClientWs(idWorkspace, idClient));
            if (!clientWSIds.length) return [];
            const items = await Promise.all(clientWSIds.map((id) => this.getClientWorkspaceById(id, idWorkspace)));
            return items.filter(Boolean) as ClientWorkspaceBrief[];
        }
        // Global (varios workspaces)
        const raw = await this.redis.get(kClientAll(idClient));
        if (!raw) return [];
        let pairs: { wsId: string; clientWSId: string }[] = [];
        try { pairs = JSON.parse(raw); } catch { pairs = []; }
        const items = await Promise.all(pairs.map(({ wsId, clientWSId }) => this.getClientWorkspaceById(clientWSId, wsId)));
        return items.filter(Boolean) as ClientWorkspaceBrief[];
    }

    async getClientWorkspaceByEmail(idWorkspace: string, email: string): Promise<ClientWorkspaceBrief | null> {
        const clientWSId = await this.redis.get(kEmail(idWorkspace, email));
        if (!clientWSId) return null;
        return this.getClientWorkspaceById(clientWSId, idWorkspace);
    }

    async getClientWorkspaceByPhone(idWorkspace: string, e164: string): Promise<ClientWorkspaceBrief | null> {
        const clientWSId = await this.redis.get(kPhone(idWorkspace, e164));
        if (!clientWSId) return null;
        return this.getClientWorkspaceById(clientWSId, idWorkspace);
    }

    async deleteClientWorkspace(
        idClientWorkspace: string,
        idWorkspace: string,
        email?: string,
        phoneE164?: string
    ): Promise<void> {
        const ids = await this.readList(kWs2Ids(idWorkspace));
        const next = ids.filter((x) => x !== idClientWorkspace);

        // Quitar de clientId2clientWSIds en ws y global
        const snapshot = await this.getClientWorkspaceById(idClientWorkspace, idWorkspace);
        const clientId = snapshot?.idClientFk || snapshot?.client?.id;

        const p = this.redis.pipeline()
            .del(kBrief(idWorkspace, idClientWorkspace))
            .del(kId2Ws(idClientWorkspace))
            .set(kWs2Ids(idWorkspace), JSON.stringify(next));

        if (email) p.del(kEmail(idWorkspace, normEmail(email)));
        if (phoneE164) p.del(kPhone(idWorkspace, phoneE164));
        if (clientId) {
            const list = await this.readList(kClientWs(idWorkspace, clientId));
            const nextList = list.filter((x) => x !== idClientWorkspace);
            p.set(kClientWs(idWorkspace, clientId), JSON.stringify(nextList));
        }

        await p.exec();

        if (clientId) {
            const raw = await this.redis.get(kClientAll(clientId));
            let pairs: { wsId: string; clientWSId: string }[] = [];
            if (raw) { try { pairs = JSON.parse(raw); } catch { pairs = []; } }
            const nextPairs = pairs.filter(({ wsId, clientWSId }) => !(wsId === idWorkspace && clientWSId === idClientWorkspace));
            await this.redis.set(kClientAll(clientId), JSON.stringify(nextPairs));
        }
    }
}
