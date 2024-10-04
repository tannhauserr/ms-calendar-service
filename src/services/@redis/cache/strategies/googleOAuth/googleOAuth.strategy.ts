
import { TokenKeys } from "../../../cache/keys/token.keys";
import { RedisCacheService } from "../../../cache/redis.service";
import { IRedisOAuthStrategy } from "../../interfaces/interfaces";


export class GoogleOAuthStrategy implements IRedisOAuthStrategy {
    private redisService = RedisCacheService.instance;

    async setAccessToken(userId: string, token: string, ttl?: number): Promise<void> {
        const key = TokenKeys.googleAccessToken(userId);
        await this.redisService.set(key, token, ttl);
    }

    async getAccessToken(userId: string): Promise<string | null> {
        const key = TokenKeys.googleAccessToken(userId);
        return this.redisService.get(key);
    }


    // Métodos adicionales específicos de Google OAuth...
}
