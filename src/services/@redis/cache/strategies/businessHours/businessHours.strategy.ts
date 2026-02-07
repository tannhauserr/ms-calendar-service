

import { BusinessHoursType } from "../../../../../models/interfaces";
import { HoursRangeInput, normalizeRange, listDaysInclusive, weekdayNameFromISO } from "../../../../@database/all-business-services/interfaces";

import { RedisCacheService } from "../../../cache/redis.service";
import { IRedisBusinessHoursStrategy } from "./interfaces";

export const BUSSINESS_HOURS_PREFIX = "businessHours:";


export class BusinessHoursStrategy implements IRedisBusinessHoursStrategy {
    private redisService = RedisCacheService.instance;

    async getBusinessHours(
        workspaceId: string,
        range?: HoursRangeInput
    ): Promise<BusinessHoursType | null> {
        const key = BUSSINESS_HOURS_PREFIX + workspaceId;
        const data = await this.redisService.get(key);
        if (!data) return null;

        const parsed: BusinessHoursType = JSON.parse(data);
        const hasRange = !!(range && (range.date || range.start || range.end));
        const norm = normalizeRange(range, hasRange);
        if (!norm) return parsed; // sin rango → devuelve todo (back-compat)

        const wantedDays = listDaysInclusive(norm.start, norm.end);
        const wantedWeekdays = new Set(wantedDays.map((d) => weekdayNameFromISO(d)));

        const filtered: BusinessHoursType = {};
        for (const [wd, value] of Object.entries(parsed)) {
            if (wantedWeekdays.has(wd as any)) {
                filtered[wd] = value;
            }
        }
        return filtered;
    }

    async saveBusinessHours(
        workspaceId: string,
        businessHours: BusinessHoursType,
        ttl?: number
    ): Promise<void> {
        const key = BUSSINESS_HOURS_PREFIX + workspaceId;
        const data = JSON.stringify(businessHours);

        if (ttl) {
            await this.redisService.set(key, data, ttl);
        } else {
            await this.redisService.set(key, data);
        }
    }

    async deleteBusinessHours(workspaceId: string): Promise<void> {
        const key = BUSSINESS_HOURS_PREFIX + workspaceId;
        await this.redisService.delete(key);
    }
}
