// import { TokenKeys } from "../../../cache/keys/token.keys";
// import { RedisCacheService } from "../../../cache/redis.service";
// import {  IRedisTemporaryHoursStrategy } from "../../interfaces/interfaces";

import { HoursRangeInput, HoursMap, normalizeRange, isWithin } from "../../../../@database/all-business-services/interfaces";
import { IRedisTemporaryHoursStrategy } from "../../interfaces/interfaces";
import { TokenKeys } from "../../keys/token.keys";
import { RedisCacheService } from "../../redis.service";

// export class TemporaryHoursStrategy implements IRedisTemporaryHoursStrategy {
//     private redisService = RedisCacheService.instance;

//     async getTemporaryHours(workspaceId: string, userId: string): Promise<{ [date: string]: string[][] } | null> {
//         const key = TokenKeys.temporaryHours(workspaceId, userId);
//         const data = await this.redisService.get(key);

//         if (data) {
//             return JSON.parse(data);
//         }

//         return null;
//     }

//     async saveTemporaryHours(workspaceId: string, userId: string, temporaryHours: { [date: string]: string[][] }, ttl?: number): Promise<void> {
//         const key = TokenKeys.temporaryHours(workspaceId, userId);
//         const data = JSON.stringify(temporaryHours);

//         if (ttl) {
//             await this.redisService.set(key, data, ttl);
//         } else {
//             await this.redisService.set(key, data);
//         }
//     }

//     async deleteTemporaryHours(workspaceId: string, userId: string): Promise<void> {
//         const key = TokenKeys.temporaryHours(workspaceId, userId);
//         await this.redisService.delete(key);
//     }
// }


export class TemporaryHoursStrategy implements IRedisTemporaryHoursStrategy {
    private redisService = RedisCacheService.instance;

    async getTemporaryHours(
        workspaceId: string,
        userId: string,
        range?: HoursRangeInput
    ): Promise<HoursMap | null> {
        const key = TokenKeys.temporaryHours(workspaceId, userId);
        const data = await this.redisService.get(key);
        if (!data) return null;

        const parsed: HoursMap = JSON.parse(data);

        const norm = normalizeRange(range);
        if (!norm) {
            // sin rango o rango inválido → devuelve TODO (back-compat)
            return parsed;
        }

        // Filtrar por rango inclusivo
        const filtered: HoursMap = {};
        for (const [dateStr, value] of Object.entries(parsed)) {
            if (isWithin(dateStr, norm.start, norm.end)) {
                filtered[dateStr] = value;
            }
        }
        return filtered;
    }

    async saveTemporaryHours(
        workspaceId: string,
        userId: string,
        temporaryHours: HoursMap,
        ttl?: number
    ): Promise<void> {
        const key = TokenKeys.temporaryHours(workspaceId, userId);
        const data = JSON.stringify(temporaryHours);
        if (ttl) {
            await this.redisService.set(key, data, ttl);
        } else {
            await this.redisService.set(key, data);
        }
    }

    async deleteTemporaryHours(workspaceId: string, userId: string): Promise<void> {
        const key = TokenKeys.temporaryHours(workspaceId, userId);
        await this.redisService.delete(key);
    }
}