import { TokenKeys } from "../../../cache/keys/token.keys";
import { RedisCacheService } from "../../../cache/redis.service";
import {  IRedisTemporaryHoursStrategy } from "../../interfaces/interfaces";

export class TemporaryHoursStrategy implements IRedisTemporaryHoursStrategy {
    private redisService = RedisCacheService.instance;

    async getTemporaryHours(companyId: string, userId: string): Promise<{ [date: string]: string[][] } | null> {
        const key = TokenKeys.temporaryHours(companyId, userId);
        const data = await this.redisService.get(key);

        if (data) {
            return JSON.parse(data);
        }

        return null;
    }

    async saveTemporaryHours(companyId: string, userId: string, temporaryHours: { [date: string]: string[][] }, ttl?: number): Promise<void> {
        const key = TokenKeys.temporaryHours(companyId, userId);
        const data = JSON.stringify(temporaryHours);

        if (ttl) {
            await this.redisService.set(key, data, ttl);
        } else {
            await this.redisService.set(key, data);
        }
    }

    async deleteTemporaryHours(companyId: string, userId: string): Promise<void> {
        const key = TokenKeys.temporaryHours(companyId, userId);
        await this.redisService.delete(key);
    }
}
