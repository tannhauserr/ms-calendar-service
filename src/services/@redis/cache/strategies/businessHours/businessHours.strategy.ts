// import { BusinessHoursType } from "../../../../../models/interfaces";
// import { TokenKeys } from "../../../cache/keys/token.keys";
// import { RedisCacheService } from "../../../cache/redis.service";
// import { IRedisBusinessHoursStrategy } from "../../interfaces/interfaces";

// export class BusinessHoursStrategy implements IRedisBusinessHoursStrategy {
//     private redisService = RedisCacheService.instance;

//     async getBusinessHours(companyId: string): Promise<BusinessHoursType | null> {
//         const key = TokenKeys.businessHours(companyId);
//         const data = await this.redisService.get(key);

//         if (data) {
//             return JSON.parse(data);
//         }

//         return null;
//     }

//     async saveBusinessHours(companyId: string, businessHours: BusinessHoursType, ttl?: number): Promise<void> {
//         const key = TokenKeys.businessHours(companyId);
//         const data = JSON.stringify(businessHours);

//         if (ttl) {
//             await this.redisService.set(key, data, ttl);
//         } else {
//             await this.redisService.set(key, data);
//         }
//     }

//     async deleteBusinessHours(companyId: string): Promise<void> {
//         const key = TokenKeys.businessHours(companyId);
//         await this.redisService.delete(key);
//     }
// }



import { BusinessHoursType } from "../../../../../models/interfaces";
import { TokenKeys } from "../../../cache/keys/token.keys";
import { RedisCacheService } from "../../../cache/redis.service";
import { IRedisBusinessHoursStrategy } from "../../interfaces/interfaces";

export class BusinessHoursStrategy implements IRedisBusinessHoursStrategy {
    private redisService = RedisCacheService.instance;

    async getBusinessHours(establishmentId: string): Promise<BusinessHoursType | null> {
        const key = TokenKeys.businessHours(establishmentId);
        const data = await this.redisService.get(key);

        if (data) {
            return JSON.parse(data);
        }

        return null;
    }

    async saveBusinessHours(establishmentId: string, businessHours: BusinessHoursType, ttl?: number): Promise<void> {
        const key = TokenKeys.businessHours(establishmentId);
        const data = JSON.stringify(businessHours);

        if (ttl) {
            await this.redisService.set(key, data, ttl);
        } else {
            await this.redisService.set(key, data);
        }
    }

    async deleteBusinessHours(establishmentId: string): Promise<void> {
        const key = TokenKeys.businessHours(establishmentId);
        await this.redisService.delete(key);
    }
}
