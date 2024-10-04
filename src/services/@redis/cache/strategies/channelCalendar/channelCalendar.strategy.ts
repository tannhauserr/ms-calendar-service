
import { ChannelCalendar } from "../../../../caledar-googleapi/interfaces/channel-calendar";
import { TokenKeys } from "../../../cache/keys/token.keys";
import { RedisCacheService } from "../../../cache/redis.service";
import { IRedisChannelClanedarStrategy } from "../../interfaces/interfaces";


export class ChannelCalendarStrategy implements IRedisChannelClanedarStrategy {
    private redisService = RedisCacheService.instance;

    async getChannelCalendar(): Promise<ChannelCalendar> {
        const key = TokenKeys.channelConfigCalendar();
        const data = await this.redisService.get(key);
        if (data) {
            return JSON.parse(data);
        }

    }

    async saveChannelCalendar(channelConfig: ChannelCalendar): Promise<void> {
        const key = TokenKeys.channelConfigCalendar();
        await this.redisService.set(key, JSON.stringify(channelConfig));
    }
    

}
