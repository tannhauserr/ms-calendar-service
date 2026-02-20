// import { TokenKeys } from "../../../cache/keys/token.keys";
// import { RedisCacheService } from "../../../cache/redis.service";
// import { IRedisWorkerHoursStrategy } from "../../interfaces/interfaces";

import { HoursRangeInput, normalizeRange, listDaysInclusive, weekdayNameFromISO } from "../../../../@database/all-business-services/interfaces";
import { IRedisWorkerHoursStrategy } from "./interfaces";
import { TokenKeys } from "../../keys/token.keys";
import { RedisCacheService } from "../../redis.service";

// export class WorkerHoursStrategy implements IRedisWorkerHoursStrategy {
//     private redisService = RedisCacheService.instance;

//     async getWorkerHours(workspaceId: string, userId: string): Promise<{ [weekday: string]: string[][] } | null> {
//         const key = TokenKeys.workerHours(workspaceId, userId);
//         const data = await this.redisService.get(key);

//         if (data) {
//             return JSON.parse(data);
//         }

//         return null;
//     }

//     async saveWorkerHours(workspaceId: string, userId: string, workerHours: { [weekday: string]: string[][] }, ttl?: number): Promise<void> {
//         const key = TokenKeys.workerHours(workspaceId, userId);
//         const data = JSON.stringify(workerHours);

//         if (ttl) {
//             await this.redisService.set(key, data, ttl);
//         } else {
//             await this.redisService.set(key, data);
//         }
//     }

//     async deleteWorkerHours(workspaceId: string, userId: string): Promise<void> {
//         const key = TokenKeys.workerHours(workspaceId, userId);
//         await this.redisService.delete(key);
//     }
// }



export class WorkerHoursStrategy implements IRedisWorkerHoursStrategy {
    private redisService = RedisCacheService.instance;

    async getWorkerHours(
        workspaceId: string,
        userId: string,
        range?: HoursRangeInput
    ): Promise<{ [weekday: string]: string[][] | null } | null> {
        const key = TokenKeys.workerHours(workspaceId, userId);
        const data = await this.redisService.get(key);
        if (!data) return null;

        const parsed: { [weekday: string]: string[][] | null } = JSON.parse(data);

        const hasRange = !!(range && (range.date || range.start || range.end));
        const norm = normalizeRange(range, hasRange);
        if (!norm) return parsed; // sin rango → todo

        // Filtrado por weekdays presentes en el rango pedido
        const wantedDays = listDaysInclusive(norm.start, norm.end);
        const wantedWeekdays = new Set(wantedDays.map((d) => weekdayNameFromISO(d)));

        const filtered: { [weekday: string]: string[][] | null } = {};
        for (const [wd, value] of Object.entries(parsed)) {
            if (wantedWeekdays.has(wd as any)) {
                filtered[wd] = value;
            }
        }
        return filtered;
    }

    async saveWorkerHours(
        workspaceId: string,
        userId: string,
        workerHours: { [weekday: string]: string[][] | null },
        ttl?: number
    ): Promise<void> {
        const key = TokenKeys.workerHours(workspaceId, userId);
        const data = JSON.stringify(workerHours);
        if (ttl) {
            await this.redisService.set(key, data, ttl);
        } else {
            await this.redisService.set(key, data);
        }
    }

    async deleteWorkerHours(workspaceId: string, userId: string): Promise<void> {
        const key = TokenKeys.workerHours(workspaceId, userId);
        await this.redisService.delete(key);
    }
}
