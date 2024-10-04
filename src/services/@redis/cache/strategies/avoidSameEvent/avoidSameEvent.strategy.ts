
import { ChannelCalendar } from "../../../../caledar-googleapi/interfaces/channel-calendar";
import { TokenKeys } from "../../../cache/keys/token.keys";
import { RedisCacheService } from "../../../cache/redis.service";
import { IRedisAvoidSameEventStrategy, IRedisChannelClanedarStrategy } from "../../interfaces/interfaces";


export class AvoidSameEventStrategy implements IRedisAvoidSameEventStrategy {
    private redisService = RedisCacheService.instance;

    setEventFromGoogle(eventId: string, ttl?: number): Promise<void> {
        const key = TokenKeys.handleOutgoingEvent(eventId);
        return this.redisService.set(key, eventId, ttl);
    }
    getEventFromGoogle(eventId: string): Promise<string | null> {
        const key = TokenKeys.handleOutgoingEvent(eventId);
        return this.redisService.get(key);
    }




}
