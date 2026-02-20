// src/services/@cache/strategies/UserBriefStrategy.ts

import { IRedisUserBriefStrategy } from "./interfaces";
import { UserBrief } from "../../interfaces/models/user-brief";
import { RedisCacheService } from "../../redis.service";

/** ────────────────────────────────────────────────────────────────────────────
 *  Prefijos exportados (cluster-ready con hash tags)
 *  ──────────────────────────────────────────────────────────────────────────── */
export const REDIS_USER_PREFIX_BRIEF = "user:brief";     // user:brief:{user:<id>}
export const REDIS_USER_PREFIX_EMAIL2ID = "user:email2id";  // user:email2id:{email:<lowercase>}

/** TTLs */
export const DEFAULT_USER_BRIEF_TTL_SEC = Number(process.env.REDIS_TTL_USER_BRIEF_SEC ?? 21600); // 6h
export const MAX_USER_BRIEF_TTL_SEC = 604800; // 7d

/** Helpers */
const sanitize = (s: string) => s.replace(/[{}]/g, ""); // evitar llaves en IDs/emails
const tagUser = (id: string) => `{user:${sanitize(id)}}`;
const tagEmail = (email: string) => `{email:${sanitize(email.toLowerCase())}}`;

const keyUser = (id: string) => `${REDIS_USER_PREFIX_BRIEF}:${tagUser(id)}`;
const keyEmail = (email: string) => `${REDIS_USER_PREFIX_EMAIL2ID}:${tagEmail(email)}`;

export class UserBriefStrategy implements IRedisUserBriefStrategy {
    private redis = RedisCacheService.instance;

    private resolveTtl(ttl?: number): number {
        if (typeof ttl !== "number") return DEFAULT_USER_BRIEF_TTL_SEC;
        return Math.min(ttl, MAX_USER_BRIEF_TTL_SEC);
    }

    async setUser(user: UserBrief, ttl?: number): Promise<void> {
        const ttlSec = this.resolveTtl(ttl);
        const kUser = keyUser(user.id);
        const kEmail = keyEmail(user.email);

        const json = JSON.stringify(user);

        // Guardamos snapshot y mapping email→id en pipeline
        await this.redis.pipeline()
            .set(kUser, json, ttlSec)
            .set(kEmail, user.id, ttlSec)
            .exec();
    }

    async getUserById(userId: string): Promise<UserBrief | null> {
        const raw = await this.redis.get(keyUser(userId));
        return raw ? (JSON.parse(raw) as UserBrief) : null;
    }

    async getUserByEmail(email: string): Promise<UserBrief | null> {
        const userId = await this.redis.get(keyEmail(email));
        if (!userId) return null;
        return this.getUserById(userId);
    }

    async deleteUser(userId: string, email: string): Promise<void> {
        const kUser = keyUser(userId);
        const kEmail = keyEmail(email);

        await this.redis.pipeline()
            .del(kUser)
            .del(kEmail)
            .exec();
    }
}
