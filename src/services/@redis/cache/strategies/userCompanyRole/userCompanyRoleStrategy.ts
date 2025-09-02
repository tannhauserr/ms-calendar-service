// strategies/user-company-role.strategy.ts
import { TIME_SECONDS } from "../../../../../constant/time";
import { IRedisUserCompanyRoleStrategy } from "../../interfaces/interfaces";
import { TokenKeys } from "../../keys/token.keys";
import { RedisCacheService } from "../../redis.service";

/**
 * Strategy para guardar y leer el userId, idCompany y roleType en Redis.
 */
export class UserCompanyRoleStrategy implements IRedisUserCompanyRoleStrategy {
    private redisService = RedisCacheService.instance;

    /**
     * Guarda el rol de un usuario con su compañía.
     * Por defecto le damos un TTL de 1 hora, pero se puede personalizar.
     */
    public async setUserCompanyRole(
        userId: string,
        idCompany: string,
        roleType: string,
        isReal: boolean,
        ttl: number = TIME_SECONDS.HOUR
    ): Promise<void> {
        const key = TokenKeys.userCompanyRoleKey(userId);
        const data = { userId, idCompany, roleType, isReal };
        await this.redisService.set(key, JSON.stringify(data), ttl);
    }

    /**
     * Retorna { userId, idCompany, roleType } o null si no existe
     */
    public async getUserCompanyRole(
        userId: string
    ): Promise<{ userId: string; idCompany: string; roleType: string, isReal: boolean } | null> {
        const key = TokenKeys.userCompanyRoleKey(userId);
        const data = await this.redisService.get(key);
        if (!data) {
            return null;
        }
        return JSON.parse(data);
    }

    /**
     * Elimina la clave para ese userId
     */
    public async deleteUserCompanyRole(userId: string): Promise<void> {
        const key = TokenKeys.userCompanyRoleKey(userId);
        await this.redisService.delete(key);
    }
}
