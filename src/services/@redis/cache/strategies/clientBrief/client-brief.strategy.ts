import { ClientWorkspaceBrief } from "../../interfaces/models/client-brief";
import { RedisCacheService } from "../../redis.service";


/**
 * Estrategia Redis para ClientBrief (cache de clientes por compañía)
 */
export interface IRedisClientWorkspaceBriefStrategy {
    setClientWorkspace(cw: ClientWorkspaceBrief, ttlSec?: number): Promise<void>;

    getClientWorkspaceById(idClientWorkspace: string, idCompany?: string): Promise<ClientWorkspaceBrief | null>;
    getClientWorkspacesByCompany(idCompany: string): Promise<ClientWorkspaceBrief[]>;

    // Índices útiles
    getClientWorkspacesByClientId(idClient: string, idCompany?: string): Promise<ClientWorkspaceBrief[]>;
    getClientWorkspaceByEmail(idCompany: string, email: string): Promise<ClientWorkspaceBrief | null>;
    getClientWorkspaceByPhone(idCompany: string, e164Phone: string): Promise<ClientWorkspaceBrief | null>;

    deleteClientWorkspace(
        idClientWorkspace: string,
        idCompany: string,
        email?: string,
        phoneE164?: string
    ): Promise<void>;
}


export const REDIS_CW_PREFIX_BRIEF = "clientWS:brief";
export const REDIS_CW_PREFIX_COMPANY2IDS = "clientWS:company2ids";
export const REDIS_CW_PREFIX_EMAIL = "clientWS:email";
export const REDIS_CW_PREFIX_PHONE = "clientWS:phone";
export const REDIS_CW_PREFIX_ID2COMPANY = "clientWS:id2company";
export const REDIS_CW_PREFIX_CLIENT_COMPANY = "clientWS:clientId2clientWSIds";
export const REDIS_CW_PREFIX_CLIENT_ALL = "clientWS:clientId2clientWSIdsGlobal";

export const DEFAULT_CW_TTL_SEC = 21600; // 6h
export const MAX_CW_TTL_SEC = 604800; // 7d

const companyTag = (companyId: string) => `{company:${companyId}}`;
const kBrief = (companyId: string, clientWSId: string) => `${REDIS_CW_PREFIX_BRIEF}:${companyTag(companyId)}:${clientWSId}`;
const kCompany2Ids = (companyId: string) => `${REDIS_CW_PREFIX_COMPANY2IDS}:${companyTag(companyId)}`;
const kEmail = (companyId: string, email: string) => `${REDIS_CW_PREFIX_EMAIL}:${companyTag(companyId)}:${email.toLowerCase()}`;
const kPhone = (companyId: string, e164: string) => `${REDIS_CW_PREFIX_PHONE}:${companyTag(companyId)}:${e164}`;
const kId2Company = (clientWSId: string) => `${REDIS_CW_PREFIX_ID2COMPANY}:${clientWSId}`;
const kClientCompany = (companyId: string, clientId: string) => `${REDIS_CW_PREFIX_CLIENT_COMPANY}:${companyTag(companyId)}:${clientId}`;
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
        const companyId = clientWS.idCompanyFk;
        const clientWSId = clientWS.id;
        if (!companyId || !clientWSId) return;

        // Derivar email/phone preferidos (en CW)
        const email = normEmail(clientWS.email);
        const e164 = toE164(clientWS.phoneCode, clientWS.phoneNumber);

        // Índices de compañía
        const list = await this.readList(kCompany2Ids(companyId));
        if (!list.includes(clientWSId)) list.push(clientWSId);

        // Índice clientId -> [clientWSIds] en esta compañía
        const clientId = clientWS.idClientFk || clientWS.client?.id;
        let clientWSIdsForClientCompany: string[] = [];
        if (clientId) {
            clientWSIdsForClientCompany = await this.readList(kClientCompany(companyId, clientId));
            if (!clientWSIdsForClientCompany.includes(clientWSId)) clientWSIdsForClientCompany.push(clientWSId);
        }

        // Índice global de clientId -> [{ companyId, clientWSId }]
        let allEntries: { companyId: string; clientWSId: string }[] = [];
        if (clientId) {
            const raw = await this.redis.get(kClientAll(clientId));
            if (raw) { try { allEntries = JSON.parse(raw); } catch { allEntries = []; } }
            if (!allEntries.some(x => x.companyId === companyId && x.clientWSId === clientWSId)) {
                allEntries.push({ companyId, clientWSId });
            }
        }

        // Snapshot + índices (co-localizados por {company:<id>})
        const p = this.redis.pipeline()
            .set(kBrief(companyId, clientWSId), JSON.stringify(clientWS), this.ttl(ttl))
            .set(kId2Company(clientWSId), companyId, this.ttl(ttl))
            .set(kCompany2Ids(companyId), JSON.stringify(list), this.ttl(ttl));

        if (email) p.set(kEmail(companyId, email), clientWSId, this.ttl(ttl));
        if (e164) p.set(kPhone(companyId, e164), clientWSId, this.ttl(ttl));
        if (clientId) p.set(kClientCompany(companyId, clientId), JSON.stringify(clientWSIdsForClientCompany), this.ttl(ttl));

        await p.exec();

        if (clientId) {
            await this.redis.set(kClientAll(clientId), JSON.stringify(allEntries), this.ttl(ttl));
        }
    }

    async getClientWorkspaceById(idClientWorkspace: string, idCompany?: string): Promise<ClientWorkspaceBrief | null> {
        let companyId = idCompany;
        if (!companyId) {
            companyId = await this.redis.get(kId2Company(idClientWorkspace)) || undefined;
            if (!companyId) return null;
        }
        const raw = await this.redis.get(kBrief(companyId, idClientWorkspace));
        return raw ? (JSON.parse(raw) as ClientWorkspaceBrief) : null;
    }

    async getClientWorkspacesByCompany(idCompany: string): Promise<ClientWorkspaceBrief[]> {
        const ids = await this.readList(kCompany2Ids(idCompany));
        if (!ids.length) return [];
        const items = await Promise.all(ids.map((id) => this.getClientWorkspaceById(id, idCompany)));
        return items.filter(Boolean) as ClientWorkspaceBrief[];
    }

    async getClientWorkspacesByClientId(idClient: string, idCompany?: string): Promise<ClientWorkspaceBrief[]> {
        if (idCompany) {
            const clientWSIds = await this.readList(kClientCompany(idCompany, idClient));
            if (!clientWSIds.length) return [];
            const items = await Promise.all(clientWSIds.map((id) => this.getClientWorkspaceById(id, idCompany)));
            return items.filter(Boolean) as ClientWorkspaceBrief[];
        }
        // Global (varias compañías)
        const raw = await this.redis.get(kClientAll(idClient));
        if (!raw) return [];
        let pairs: { companyId: string; clientWSId: string }[] = [];
        try { pairs = JSON.parse(raw); } catch { pairs = []; }
        const items = await Promise.all(pairs.map(({ companyId, clientWSId }) => this.getClientWorkspaceById(clientWSId, companyId)));
        return items.filter(Boolean) as ClientWorkspaceBrief[];
    }

    async getClientWorkspaceByEmail(idCompany: string, email: string): Promise<ClientWorkspaceBrief | null> {
        const clientWSId = await this.redis.get(kEmail(idCompany, email));
        if (!clientWSId) return null;
        return this.getClientWorkspaceById(clientWSId, idCompany);
    }

    async getClientWorkspaceByPhone(idCompany: string, e164: string): Promise<ClientWorkspaceBrief | null> {
        const clientWSId = await this.redis.get(kPhone(idCompany, e164));
        if (!clientWSId) return null;
        return this.getClientWorkspaceById(clientWSId, idCompany);
    }

    async deleteClientWorkspace(
        idClientWorkspace: string,
        idCompany: string,
        email?: string,
        phoneE164?: string
    ): Promise<void> {
        const ids = await this.readList(kCompany2Ids(idCompany));
        const next = ids.filter((x) => x !== idClientWorkspace);

        // Quitar de clientId2clientWSIds en company y global
        const snapshot = await this.getClientWorkspaceById(idClientWorkspace, idCompany);
        const clientId = snapshot?.idClientFk || snapshot?.client?.id;

        const p = this.redis.pipeline()
            .del(kBrief(idCompany, idClientWorkspace))
            .del(kId2Company(idClientWorkspace))
            .set(kCompany2Ids(idCompany), JSON.stringify(next));

        if (email) p.del(kEmail(idCompany, normEmail(email)));
        if (phoneE164) p.del(kPhone(idCompany, phoneE164));
        if (clientId) {
            const list = await this.readList(kClientCompany(idCompany, clientId));
            const nextList = list.filter((x) => x !== idClientWorkspace);
            p.set(kClientCompany(idCompany, clientId), JSON.stringify(nextList));
        }

        await p.exec();

        if (clientId) {
            const raw = await this.redis.get(kClientAll(clientId));
            let pairs: { companyId: string; clientWSId: string }[] = [];
            if (raw) { try { pairs = JSON.parse(raw); } catch { pairs = []; } }
            const nextPairs = pairs.filter(({ companyId, clientWSId }) => !(companyId === idCompany && clientWSId === idClientWorkspace));
            await this.redis.set(kClientAll(clientId), JSON.stringify(nextPairs));
        }
    }
}
