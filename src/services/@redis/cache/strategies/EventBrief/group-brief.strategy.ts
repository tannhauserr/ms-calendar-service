import { EventBrief } from "../../interfaces/models/event-brief";
import { RedisCacheService } from "../../redis.service";

export interface IRedisGroupBriefStrategy {
    setGroup(idGroup: string, events: EventBrief[], ttl?: number): Promise<void>;
    getGroupByGroupId(idGroup: string): Promise<EventBrief[] | null>;
    deleteGroup(idGroup: string): Promise<void>;
}


export class RedisGroupBriefStrategy implements IRedisGroupBriefStrategy {
    private redis = RedisCacheService.instance;

    private keyGroup(idGroup: string): string {
        return `group:brief:${idGroup}`;
    }

    /**
     * Guarda en Redis todos los eventos de una reserva (booking)
     * bajo la misma clave, indexada por idGroup.
     */
    async setGroup(
        idGroup: string,
        events: EventBrief[],
        ttl = 86400 // 24h, ajusta a lo que tenga sentido para tu cache
    ): Promise<void> {
        const key = this.keyGroup(idGroup);

        // Si no hay eventos, puedes decidir borrar la clave
        if (!events || events.length === 0) {
            await this.redis.delete(key);
            return;
        }

        const value = JSON.stringify(events);
        await this.redis.set(key, value, ttl);
    }

    /**
     * Devuelve todos los eventos asociados a un idGroup.
     * Si no existe la reserva en cache, devuelve null.
     */
    async getGroupByGroupId(idGroup: string): Promise<EventBrief[] | null> {
        const key = this.keyGroup(idGroup);
        const value = await this.redis.get(key);
        return value ? (JSON.parse(value) as EventBrief[]) : null;
    }

    /**
     * Elimina de cache una reserva completa (todos los eventos del grupo).
     */
    async deleteGroup(idGroup: string): Promise<void> {
        const key = this.keyGroup(idGroup);
        await this.redis.delete(key);
    }
}
