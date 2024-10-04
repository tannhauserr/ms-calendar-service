import { IRedisChangeChatHandlerStrategy } from "../../interfaces/interfaces";
import { TokenKeys } from "../../keys/token.keys";
import { RedisCacheService } from "../../redis.service";

export class ChatHandlerStrategy implements IRedisChangeChatHandlerStrategy {

    private redisService = RedisCacheService.instance;

    setChangeChatHandler(chatId: string, typeChat: "bot" | "human", ttl?: number): Promise<void> {
        const key = TokenKeys.changeChatHandler(chatId);
        return this.redisService.set(key, typeChat, ttl);
    }
    getChangeChatHandler(chatId: string): Promise<string | null> {
        const key = TokenKeys.changeChatHandler(chatId);
        return this.redisService.get(key);
    }

}

