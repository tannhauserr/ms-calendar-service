// src/services/@service-token-client/api-ms/client-workspace.ms.ts
import axios from "axios";
import { attachServiceAuth } from "../service-token-client.service";
// import { RedisStrategyFactory } from "../../@redis/cache/strategies/redisStrategyFactory";
import { CONSOLE_COLOR } from "../../../constant/console-color";
import CustomError from "../../../models/custom-error/CustomError";
import type { ClientWorkspaceBrief } from "../../@redis/cache/interfaces/models/client-brief";
import type { IRedisClientWorkspaceBriefStrategy } from "../../@redis/cache/interfaces/interfaces";
import { create } from "domain";
import { RedisStrategyFactory } from "../../@redis/cache/strategies/redisStrategyFactory";

const TARGET_MS_NAME = process.env.MS_CLIENT_NAME || "client";
const THIS_MS_NAME = process.env.MS_NAME || process.env.MS_CALENDAR_NAME || "calendar";


// 🔹 Secret interno para comunicación entre microservicios
const internalSecret = process.env.INTERNAL_MS_SECRET;
// ✅ Cliente propio de este archivo (singleton del módulo)
const client = axios.create({
    baseURL: `${process.env.URL_BACK_MS_GATEWAY}/${TARGET_MS_NAME}/api/ms`,
    timeout: 5000,
    headers: internalSecret
        ? { "x-internal-ms-secret": internalSecret }
        : {},
});

client.interceptors.request.use((cfg) => {
    const h: any = cfg.headers;
    const auth =
        (typeof h?.get === "function" ? h.get("Authorization") : undefined) ??
        h?.Authorization ??
        h?.authorization;

    console.log("[ms-client-file] →", cfg.method?.toUpperCase(), cfg.baseURL + (cfg.url ?? ""), {
        hasAuth: Boolean(auth),
        authPrefix: typeof auth === "string" ? auth.slice(0, 20) : undefined,
    });

    return cfg;
});


// Enganchamos el interceptor aquí (aud=receiver, sub=this)
// attachServiceAuth(client, TARGET_MS_NAME, THIS_MS_NAME);

const normEmail = (s?: string) => (s ?? "").trim().toLowerCase();

export async function getClientWorkspacesByIds(
    idClientWorkspaceList: string[],
    idCompany: string
): Promise<ClientWorkspaceBrief[]> {
    try {
        const valid = (idClientWorkspaceList || []).filter((x) => x && x.trim() !== "");
        if (!valid.length) return [];
        const redis = RedisStrategyFactory.getStrategy("clientWorkspaceBrief") as unknown as IRedisClientWorkspaceBriefStrategy;

        const cached = await Promise.all(valid.map((id) => redis.getClientWorkspaceById(id, idCompany)));
        const map = new Map<string, ClientWorkspaceBrief>();
        (cached.filter(Boolean) as ClientWorkspaceBrief[]).forEach((cw) => map.set(cw.id, cw));

        const miss = valid.filter((id) => !map.has(id));
        console.log(CONSOLE_COLOR.FgYellow, `[getClientWorkspacesByIds] cache: ${map.size}, miss: ${miss.length}`, CONSOLE_COLOR.Reset);

        let fetched: ClientWorkspaceBrief[] = [];
        if (miss.length) {
            const { data } = await client.post(`/internal/client-workspaces/_batch`, { ids: miss, idCompany });
            fetched = (data.items as ClientWorkspaceBrief[]) || [];
            for (const cw of fetched) await redis.setClientWorkspace(cw);
        }

        fetched.forEach((cw) => map.set(cw.id, cw));
        return valid.map((id) => map.get(id)!).filter(Boolean);
    } catch (err: any) {
        new CustomError(`${CONSOLE_COLOR.BgRed} [getClientWorkspacesByIds] error ${CONSOLE_COLOR.Reset}`, err);
        return [];
    }
}

/**
 * Se recibe el registro cliente ligado con la compañía 
 * @param clientIds 
 * @param idCompany 
 * @returns 
 */
export async function getClientWorkspacesByClientIds(
    clientIds: string[],
    idCompany?: string
): Promise<ClientWorkspaceBrief[]> {
    try {
        const valid = (clientIds || []).filter((x) => x && x.trim() !== "");
        if (!valid.length) return [];
        const redis = RedisStrategyFactory.getStrategy("clientWorkspaceBrief") as unknown as IRedisClientWorkspaceBriefStrategy;

        // 1) Cache
        const cachedLists = await Promise.all(valid.map((cid) => redis.getClientWorkspacesByClientId(cid, idCompany)));
        const have = cachedLists.flat();
        const haveSet = new Set(have.map((cw) => `${cw.idWorkspaceFk}:${cw.id}`)); // clave única

        // 2) Miss → backend
        const miss = valid.filter(() => true); // por simplicidad, tiramos a backend siempre si quieres "completo"
        let fetched: ClientWorkspaceBrief[] = [];
        if (miss.length) {
            const { data } = await client.post(`/internal/client-workspaces/clientIds/_batch`, {
                clientIds: miss,
                idCompany,
            });
            fetched = (data.items as ClientWorkspaceBrief[]) || [];
            for (const cw of fetched) await redis.setClientWorkspace(cw);
        }

        // Unificar
        const map = new Map<string, ClientWorkspaceBrief>();
        for (const cw of have) map.set(`${cw.idWorkspaceFk}:${cw.id}`, cw);
        for (const cw of fetched) map.set(`${cw.idWorkspaceFk}:${cw.id}`, cw);

        return Array.from(map.values());
    } catch (err: any) {
        new CustomError(`${CONSOLE_COLOR.BgRed} [getClientWorkspacesByClientIds] error ${CONSOLE_COLOR.Reset}`, err);
        return [];
    }
}

export async function createClientWorkspaceByClientAndWorkspace(idClient: string, idWorkspace: string, idCompany: string): Promise<ClientWorkspaceBrief | null> {
    try {

        const { data } = await client.post(`/internal/client-workspaces/create-from-microservices`, {
            idClient,
            idWorkspace,
            idCompany
        });

        const cw = data?.item as ClientWorkspaceBrief;
        console.log("mira que es cw", cw);
        if (data?.ok && cw) {
            const redis = RedisStrategyFactory.getStrategy("clientWorkspaceBrief") as unknown as IRedisClientWorkspaceBriefStrategy;
            await redis.setClientWorkspace(cw);
            return cw;
        }

        return null;
    } catch (err: any) {
        new CustomError(`${CONSOLE_COLOR.BgRed} [createClientWorkspaceByClientAndWorkspace] error ${CONSOLE_COLOR.Reset}`, err);
        return null;
    }
}

// export async function getClientWorkspacesByEmails(
//     emails: string[],
//     idWorkspace: string
// ): Promise<ClientWorkspaceBrief[]> {
//     try {
//         const list = (emails || []).map(normEmail).filter((e) => e.length > 3);
//         if (!list.length || !idWorkspace) return [];
//         const redis = RedisStrategyFactory.getStrategy("clientWorkspaceBrief") as IRedisClientWorkspaceBriefStrategy;

//         const cached = await Promise.all(list.map((e) => redis.getClientWorkspaceByEmail(idWorkspace, e)));
//         const have = (cached.filter(Boolean) as ClientWorkspaceBrief[]);
//         const haveByEmail = new Map<string, ClientWorkspaceBrief>();
//         // No tenemos el email original desde cache con la clave, así que solo marcamos que "hay" algo
//         for (const cw of have) haveByEmail.set(cw.id, cw);

//         const miss = list.filter(() => true); // opcional: si quieres back siempre
//         let fetched: ClientWorkspaceBrief[] = [];
//         if (miss.length) {
//             const { data } = await client.post(`/internal/client-workspaces/emails/_batch`, {
//                 emails: miss,
//                 idWorkspace,
//             });
//             fetched = (data.items as ClientWorkspaceBrief[]) || [];
//             for (const cw of fetched) await redis.setClientWorkspace(cw);
//         }

//         const unique = new Map<string, ClientWorkspaceBrief>();
//         for (const cw of have) unique.set(`${cw.idWorkspaceFk}:${cw.id}`, cw);
//         for (const cw of fetched) unique.set(`${cw.idWorkspaceFk}:${cw.id}`, cw);

//         return Array.from(unique.values());
//     } catch (err: any) {
//         new CustomError(`${CONSOLE_COLOR.BgRed} [getClientWorkspacesByEmails] error ${CONSOLE_COLOR.Reset}`, err);
//         return [];
//     }
// }

// export async function getClientWorkspacesByPhones(
//     phonesE164: string[],
//     idWorkspace: string
// ): Promise<ClientWorkspaceBrief[]> {
//     try {
//         const list = (phonesE164 || []).map((p) => (p || "").replace(/\s+/g, "")).filter((p) => p.startsWith("+"));
//         if (!list.length || !idWorkspace) return [];
//         const redis = RedisStrategyFactory.getStrategy("clientWorkspaceBrief") as IRedisClientWorkspaceBriefStrategy;

//         const cached = await Promise.all(list.map((p) => redis.getClientWorkspaceByPhone(idWorkspace, p)));
//         const have = (cached.filter(Boolean) as ClientWorkspaceBrief[]);

//         const miss = list.filter(() => true); // opcional, ver nota anterior
//         let fetched: ClientWorkspaceBrief[] = [];
//         if (miss.length) {
//             const { data } = await client.post(`/internal/client-workspaces/phones/_batch`, {
//                 phonesE164: miss,
//                 idWorkspace,
//             });
//             fetched = (data.items as ClientWorkspaceBrief[]) || [];
//             for (const cw of fetched) await redis.setClientWorkspace(cw);
//         }

//         const unique = new Map<string, ClientWorkspaceBrief>();
//         for (const cw of have) unique.set(`${cw.idWorkspaceFk}:${cw.id}`, cw);
//         for (const cw of fetched) unique.set(`${cw.idWorkspaceFk}:${cw.id}`, cw);

//         return Array.from(unique.values());
//     } catch (err: any) {
//         new CustomError(`${CONSOLE_COLOR.BgRed} [getClientWorkspacesByPhones] error ${CONSOLE_COLOR.Reset}`, err);
//         return [];
//     }
// }
