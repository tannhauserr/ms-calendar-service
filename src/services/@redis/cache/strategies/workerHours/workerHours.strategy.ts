import { TokenKeys } from "../../../cache/keys/token.keys";
import { RedisCacheService } from "../../../cache/redis.service";
import { IRedisWorkerHoursStrategy } from "../../interfaces/interfaces";

export class WorkerHoursStrategy implements IRedisWorkerHoursStrategy {
    private redisService = RedisCacheService.instance;

    async getWorkerHours(companyId: string, userId: string): Promise<{ [weekday: string]: string[][] } | null> {
        const key = TokenKeys.workerHours(companyId, userId);
        const data = await this.redisService.get(key);

        if (data) {
            return JSON.parse(data);
        }

        return null;
    }

    async saveWorkerHours(companyId: string, userId: string, workerHours: { [weekday: string]: string[][] }, ttl?: number): Promise<void> {
        const key = TokenKeys.workerHours(companyId, userId);
        const data = JSON.stringify(workerHours);

        if (ttl) {
            await this.redisService.set(key, data, ttl);
        } else {
            await this.redisService.set(key, data);
        }
    }

    async deleteWorkerHours(companyId: string, userId: string): Promise<void> {
        const key = TokenKeys.workerHours(companyId, userId);
        await this.redisService.delete(key);
    }
}
