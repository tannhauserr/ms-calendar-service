

import axios from "axios";
import { attachServiceAuth } from "../service-token-client.service";
import { RedisStrategyFactory } from "../../@redis/cache/strategies/redisStrategyFactory";
import { CONSOLE_COLOR } from "../../../constant/console-color";
import CustomError from "../../../models/custom-error/CustomError";
import { IRedisBookingPageBriefStrategy, IRedisServiceBriefStrategy } from "../../@redis/cache/interfaces/interfaces";
import { BookingPageBrief } from "../../@redis/cache/interfaces/models/booking-brief";
import { ServiceBrief } from "../../@redis/cache/interfaces/models/service-brief";

// 🔹 receiver dinámico de este archivo
const TARGET_MS_NAME = process.env.MS_BOOKING_PAGE_NAME || "bookingPage";
// 🔹 “sub” = este MS (quién llama). Usa tu var real si es otra.
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

// // (Opcional) pequeño log para confirmar que va el Authorization
// client.interceptors.request.use((cfg) => {
//     const hasAuth = !!cfg.headers?.Authorization;
//     console.log("[ms-client-file] →", cfg.method?.toUpperCase(), cfg.url, { hasAuth });
//     return cfg;
// });

/**
 * Obtiene snapshots de BookingPages por IDs con cache-first
 */
export async function getBookingPageByIds(ids: string[], idWorkspace?: string) {
    try {
        if (!Array.isArray(ids) || ids.length === 0) {
            console.log(CONSOLE_COLOR.FgYellow, `[getBookingPageByIds] Array de IDs vacío o inválido`, CONSOLE_COLOR.Reset);
            return [];
        }
        const validIds = ids.filter((id) => id && typeof id === "string" && id.trim() !== "");
        if (validIds.length === 0) {
            console.log(CONSOLE_COLOR.FgYellow, `[getBookingPageByIds] No hay IDs válidos para procesar`, CONSOLE_COLOR.Reset);
            return [];
        }

        const redisStrategy = RedisStrategyFactory.getStrategy("bookingPageBrief") as IRedisBookingPageBriefStrategy;

        const cached = await Promise.all(validIds.map((id) => redisStrategy.getBookingPageById(id)));
        const cachedMap = new Map<string, BookingPageBrief>();
        (cached.filter(Boolean) as BookingPageBrief[]).forEach((s) => cachedMap.set(s.id, s));

        const missingIds = validIds.filter((id) => !cachedMap.has(id));

        console.log(CONSOLE_COLOR.FgYellow, `[getBookingPageByIds] cache: ${cachedMap.size}, miss: ${missingIds.length}`, CONSOLE_COLOR.Reset);

        let fetched: BookingPageBrief[] = [];
        if (missingIds.length) {
            const { data } = await client.post(`/internal/booking-pages/_batch`, { ids: missingIds, idWorkspace });
            fetched = (data.items as BookingPageBrief[]) || [];
            for (const s of fetched) await redisStrategy.setBookingPage(s);
        }

        // merge cache + fetched
        const byId = new Map<string, BookingPageBrief>(cachedMap);
        fetched.forEach((s) => byId.set(s.id, s));

        return validIds.map((id) => byId.get(id)!).filter(Boolean);
    } catch (err: any) {
        new CustomError(`${CONSOLE_COLOR.BgRed} [getBookingPageByIds] error ${CONSOLE_COLOR.Reset}`, err);
        return [];
    }
}

/**
 * Obtiene snapshots de Services por IDs con cache-first
 */
export async function getServiceByIds(ids: string[], idWorkspace: string) {
    try {

        console.log("mirando ids", ids, idWorkspace);

        if (!Array.isArray(ids) || ids.length === 0) {
            console.log(CONSOLE_COLOR.FgYellow, `[getServiceByIds] Array de IDs vacío o inválido`, CONSOLE_COLOR.Reset);
            return [];
        }
        if (!idWorkspace) {
            console.log(CONSOLE_COLOR.FgYellow, `[getServiceByIds] ID de workspace inválido`, CONSOLE_COLOR.Reset);
            return [];
        }
        const validIds = ids.filter((id) => id && typeof id === "string" && id.trim() !== "");
        if (validIds.length === 0) {
            console.log(CONSOLE_COLOR.FgYellow, `[getServiceByIds] No hay IDs válidos para procesar`, CONSOLE_COLOR.Reset);
            return [];
        }

        const redisStrategy = RedisStrategyFactory.getStrategy("serviceBrief") as IRedisServiceBriefStrategy;

        const cachedRaw = await Promise.all(validIds.map((id) => redisStrategy.getServiceById(id)));
        const cachedList = cachedRaw.filter((s): s is ServiceBrief => Boolean(s));
        const cachedMap = new Map<string, ServiceBrief>();
        cachedList.forEach((s) => cachedMap.set(s.id, s));

        // ❗️OJO: no usar cached[i] tras filtrar; compara por id
        const missingIds = validIds.filter((id) => !cachedMap.has(id));

        console.log(CONSOLE_COLOR.FgYellow, `[getServiceByIds] cache: ${cachedMap.size}, miss: ${missingIds.length}`, CONSOLE_COLOR.Reset);

        let fetched: ServiceBrief[] = [];
        if (missingIds.length) {
            const { data } = await client.post(`/internal/services/_batch`, { ids: missingIds, idWorkspace });
            fetched = (data.items as ServiceBrief[]) || [];
            for (const s of fetched) await redisStrategy.setService(s);
        }

        const byId = new Map<string, ServiceBrief>(cachedMap);
        fetched.forEach((s) => byId.set(s.id, s));

        return validIds.map((id) => byId.get(id)!).filter(Boolean);
    } catch (err: any) {
        if (axios.isAxiosError(err)) {
            const h: any = err.config?.headers;
            const auth =
                (typeof h?.get === "function" ? h.get("Authorization") : undefined) ??
                h?.Authorization ??
                h?.authorization;

            console.error("[getServiceByIds] axios error", {
                message: err.message,
                code: err.code,
                method: err.config?.method,
                url: (err.config?.baseURL ?? "") + (err.config?.url ?? ""),
                status: err.response?.status,
                data: err.response?.data,
                hasAuth: Boolean(auth),
            });
        } else {
            console.error("[getServiceByIds] non-axios error", err);
        }

        new CustomError(`${CONSOLE_COLOR.BgRed} [getServiceByIds] error ${CONSOLE_COLOR.Reset}`, err);
        return [];
    }

}

/**
 * Obtiene snapshots de Services por IDs de usuarios con cache-first
 */
export async function getServiceByUserIds(userIds: string[], idWorkspace?: string) {
    try {
        if (!Array.isArray(userIds) || userIds.length === 0) {
            console.log(CONSOLE_COLOR.FgYellow, `[getServiceByUserIds] Array de IDs de usuarios vacío o inválido`, CONSOLE_COLOR.Reset);
            return [];
        }
        const validUserIds = userIds.filter((id) => id && typeof id === "string" && id.trim() !== "");
        if (validUserIds.length === 0) {
            console.log(CONSOLE_COLOR.FgYellow, `[getServiceByUserIds] No hay IDs de usuarios válidos para procesar`, CONSOLE_COLOR.Reset);
            return [];
        }

        const redisStrategy = RedisStrategyFactory.getStrategy("serviceBrief") as IRedisServiceBriefStrategy;

        const cachedResults = await Promise.all(
            validUserIds.map(async (userId) => ({
                userId,
                services: await redisStrategy.getServicesByUsers([userId]),
            }))
        );

        const usersWithCache = new Set<string>();
        const allCachedServices = new Map<string, ServiceBrief>();

        cachedResults.forEach(({ userId, services }) => {
            if (services && services.length > 0) {
                usersWithCache.add(userId);
                services.forEach((s) => allCachedServices.set(s.id, s));
            }
        });

        const missingUserIds = validUserIds.filter((uid) => !usersWithCache.has(uid));
        console.log(CONSOLE_COLOR.FgYellow, `[getServiceByUserIds] Cache: ${usersWithCache.size} usuarios, Backend: ${missingUserIds.length} usuarios`, CONSOLE_COLOR.Reset);

        let fetchedServices: ServiceBrief[] = [];
        if (missingUserIds.length > 0) {
            try {
                const { data } = await client.post(`/internal/services/users/_batch`, { userIds: missingUserIds, idWorkspace });
                fetchedServices = (data.items as ServiceBrief[]) || [];
                for (const s of fetchedServices) await redisStrategy.setService(s);
                console.log(CONSOLE_COLOR.FgGreen, `[getServiceByUserIds] Obtenidos ${fetchedServices.length} servicios del backend`, CONSOLE_COLOR.Reset);
            } catch (backendError: any) {
                console.error(CONSOLE_COLOR.FgRed, `[getServiceByUserIds] Error al consultar backend:`, backendError.message, CONSOLE_COLOR.Reset);
            }
        }

        const allServices = new Map<string, ServiceBrief>(allCachedServices);
        fetchedServices.forEach((s) => allServices.set(s.id, s));

        const uniqueServices = Array.from(allServices.values());
        console.log(CONSOLE_COLOR.FgYellow, `[getServiceByUserIds] Total: ${uniqueServices.length} servicios únicos para ${validUserIds.length} usuarios`, CONSOLE_COLOR.Reset);

        return uniqueServices;
    } catch (err: any) {
        console.error(`${CONSOLE_COLOR.BgRed} [getServiceByUserIds] error ${CONSOLE_COLOR.Reset}`, err);
        return [];
    }
}


/**
 * Obtiene el catálogo (categorías u otro) por company + workspace
 */
export async function getCatalogByIdWorkspaceAndIdCompany(idCompany: string, idWorkspace?: string) {
    try {
        if (!idCompany || typeof idCompany !== "string" || idCompany.trim() === "") {
            console.log(CONSOLE_COLOR.FgYellow, `[getCatalogByIdWorkspaceAndIdCompany] idCompany inválido`, CONSOLE_COLOR.Reset);
            return [];
        }

        if (!idWorkspace || typeof idWorkspace !== "string" || idWorkspace.trim() === "") {
            console.log(CONSOLE_COLOR.FgYellow, `[getCatalogByIdWorkspaceAndIdCompany] idWorkspace inválido`, CONSOLE_COLOR.Reset);
            return [];
        }

        const url = `/categories/company/${encodeURIComponent(idCompany)}/workspace/${encodeURIComponent(idWorkspace)}`;
        const { data } = await client.get(url);

        if (data?.ok) {
            return data.items || [];
        } else {
            console.log(CONSOLE_COLOR.FgYellow, `[getCatalogByIdWorkspaceAndIdCompany] Respuesta no OK del backend`, CONSOLE_COLOR.Reset);
            return [];
        }


    } catch (err: any) {
        new CustomError(`${CONSOLE_COLOR.BgRed} [getCatalogByIdWorkspaceAndIdCompany] error ${CONSOLE_COLOR.Reset}`, err);
        return [];
    }
}

