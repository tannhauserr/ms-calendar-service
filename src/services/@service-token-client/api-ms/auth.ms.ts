import axios from "axios";
import { RedisStrategyFactory } from "../../@redis/cache/strategies/redisStrategyFactory";
import { WorkspaceBrief } from "../../@redis/cache/interfaces/models/workspace-brief";
import { BookingPageBrief } from "../../@redis/cache/interfaces/models/booking-brief";
import CustomError from "../../../models/custom-error/CustomError";
import { CONSOLE_COLOR } from "../../../constant/console-color";
import { IRedisUserBriefStrategy, IRedisWorkspaceBriefStrategy } from "../../@redis/cache/interfaces/interfaces";
import { UserBrief } from "../../@redis/cache/interfaces/models/user-brief";
import { TIME_SECONDS } from "../../../constant/time";
import {
    getMockUsersByIds,
    getMockWorkspacesByIds,
    isMockIntegrationsMode,
} from "../mock/mock-integrations";

// 🔹 MS receptor (login/auth)
const TARGET_MS_NAME = process.env.MS_LOGIN_NAME || "auth";
// 🔹 Quién llama (este microservicio)
const THIS_MS_NAME = process.env.MS_NAME || process.env.MS_CALENDAR_NAME || "calendar";

// 🔹 Token interno para MS-Login/Auth
const internalSecret = process.env.TOKEN_MS_LOGIN;
// ✅ Cliente propio de este archivo (singleton del módulo)
const client = axios.create({
    baseURL: `${process.env.URL_BACK_MS_GATEWAY}/${TARGET_MS_NAME}/api/ms`,
    timeout: 5000,
    headers: {
        "x-internal-ms-allowed": THIS_MS_NAME,
        ...(internalSecret ? { "x-internal-ms-secret": internalSecret } : {}),
    },
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


/**
 * Obtiene snapshots de Users por IDs con cache-first
 */
export async function getUsersByIds(ids: string[]) {
    try {
        if (isMockIntegrationsMode()) {
            return getMockUsersByIds(ids);
        }

        const strategy = RedisStrategyFactory.getStrategy("userBrief") as IRedisUserBriefStrategy;
        const cached = await Promise.all(ids.map((id) => strategy.getUserById(id)));

        const missingSet = new Set<string>();
        ids.forEach((id, i) => { if (!cached[i]) missingSet.add(id); });
        const missingIds = Array.from(missingSet);

        let fetched: UserBrief[] = [];
        if (missingIds.length) {
            const { data } = await client.post(`/internal/users/_batch`, { ids: missingIds });
            fetched = data.items as UserBrief[];
            for (const u of fetched) await strategy.setUser(u);
        }

        const byId = new Map<string, UserBrief>();
        (cached.filter(Boolean) as UserBrief[]).forEach((u) => byId.set(u.id, u));
        fetched.forEach((u) => byId.set(u.id, u));

        return ids.map((id) => byId.get(id)!).filter(Boolean);
    } catch (err: any) {
        // TODO: log error (logger, sentry, file, etc.)
        new CustomError(`${CONSOLE_COLOR.BgRed} [getUsersByIds] error ${CONSOLE_COLOR.Reset}`, err);
        return [];
    }
}

/**
 * Obtiene snapshots de Workspaces por IDs con cache-first
 */
export async function getWorkspacesByIds(ids: string[]) {
    try {
        if (isMockIntegrationsMode()) {
            return getMockWorkspacesByIds(ids);
        }

        console.log("mira que es ids", ids);
        if (!Array.isArray(ids) || ids.length === 0) {
            console.log(CONSOLE_COLOR.FgYellow, `[getWorkspacesByIds] Array de IDs vacío o inválido`, CONSOLE_COLOR.Reset);
            return [];
        }

        const validIds = ids.filter((id) => id && typeof id === "string" && id.trim() !== "");
        if (validIds.length === 0) {
            console.log(CONSOLE_COLOR.FgYellow, `[getWorkspacesByIds] No hay IDs válidos para procesar`, CONSOLE_COLOR.Reset);
            return [];
        }

        const strategy = RedisStrategyFactory.getStrategy("workspaceBrief") as IRedisWorkspaceBriefStrategy;

        // Cache first
        const cachedRaw = await Promise.all(validIds.map((id) => strategy.getWorkspaceById(id)));
        const cachedList = cachedRaw.filter(Boolean) as WorkspaceBrief[];

        // Mapa por id para comparar sin depender del índice
        const cachedMap = new Map<string, WorkspaceBrief>();
        cachedList.forEach((ws) => cachedMap.set(ws.id, ws));

        const missingIds = validIds.filter((id) => !cachedMap.has(id));

        console.log(
            CONSOLE_COLOR.FgYellow,
            `[getWorkspacesByIds] cache: ${cachedMap.size}, miss: ${missingIds.length}`,
            CONSOLE_COLOR.Reset
        );
        console.log("que hay en cache (ids)", Array.from(cachedMap.keys()));
        console.log("que hay en falta", missingIds);

        // Backend fetch para los que faltan
        let fetched: WorkspaceBrief[] = [];
        if (missingIds.length) {
            const { data } = await client.post(`/internal/workspaces/_batch`, { ids: missingIds });
            fetched = (data.items as WorkspaceBrief[]) || [];
            for (const ws of fetched) await strategy.setWorkspace(ws, TIME_SECONDS.MINUTE * 1);

        }

        // Merge cache + fetched respetando el orden solicitado en validIds
        const byId = new Map<string, WorkspaceBrief>(cachedMap);
        fetched.forEach((ws) => byId.set(ws.id, ws));

        return validIds.map((id) => byId.get(id)!).filter(Boolean);
    } catch (err: any) {
        new CustomError(`${CONSOLE_COLOR.BgRed} [getWorkspacesByIds] error ${CONSOLE_COLOR.Reset}`, err);
        return [];
    }
}





