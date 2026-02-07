import { EventBrief } from "../../interfaces/models/event-brief";
import { RedisCacheService } from "../../redis.service";



export interface IRedisEventBriefStrategy {
    /**
     * Guarda snapshot de evento por id.
     */
    setEvent(event: EventBrief, ttl?: number): Promise<void>;

    /**
     * Recupera snapshot por id.
     */
    getEventById(idEvent: string): Promise<EventBrief | null>;

    /**
     * Elimina snapshot.
     */
    deleteEvent(idEvent: string): Promise<void>;
}



export class RedisEventBriefStrategy implements IRedisEventBriefStrategy {
    private redis = RedisCacheService.instance;

    private keyEvent(id: string): string {
        return `event:brief:${id}`;
    }

    async setEvent(event: EventBrief, ttl = 86400): Promise<void> {
        const key = this.keyEvent(event.id);
        const value = JSON.stringify(event);
        await this.redis.set(key, value, ttl);
    }

    async getEventById(idEvent: string): Promise<EventBrief | null> {
        const key = this.keyEvent(idEvent);
        const value = await this.redis.get(key);
        return value ? JSON.parse(value) : null;
    }

    async deleteEvent(idEvent: string): Promise<void> {
        const key = this.keyEvent(idEvent);
        await this.redis.delete(key);
    }
}