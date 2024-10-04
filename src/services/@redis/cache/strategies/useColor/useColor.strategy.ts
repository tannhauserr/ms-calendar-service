import { TokenKeys } from "../../../cache/keys/token.keys";
import { RedisCacheService } from "../../../cache/redis.service";
import { IRedisUserColorStrategy } from "../../interfaces/interfaces";
import { UserColorCalendar } from "../../../../caledar-googleapi/interfaces/user-color-calendar";

export class UserColorStrategy implements IRedisUserColorStrategy {
    private redisService = RedisCacheService.instance;

    async getUserColorByIdUser(idUserFk: string): Promise<UserColorCalendar> {
        const key = TokenKeys.userColor(idUserFk);
        const data = await this.redisService.get(key);

        if (data) {
            return JSON.parse(data);
        }

    }

    async saveUserColorByIdUser(idUserFk: string, userColor: UserColorCalendar, ttl?: number): Promise<void> {
        const key = TokenKeys.userColor(idUserFk);
        const data = JSON.stringify(userColor);

        if (ttl) {
            await this.redisService.set(key, data, ttl);
        } else {
            await this.redisService.set(key, data);
        }
    }

    async deleteUserColorByIdUser(idUserFk: string): Promise<void> {
        const key = TokenKeys.userColor(idUserFk);
        await this.redisService.delete(key);
    }
}
