import { createHash } from "crypto";
import { IRedisMessageReliabilityStrategy } from "./interfaces";
import { RedisCacheService } from "../../redis.service";

const DEFAULT_LOCK_TTL_SECONDS = 120;
const DEFAULT_PROCESSED_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 días

const keyLock = (scope: string, digest: string) => `messageReliability:${scope}:lock:${digest}`;
const keyProcessed = (scope: string, digest: string) => `messageReliability:${scope}:processed:${digest}`;

export class MessageReliabilityStrategy implements IRedisMessageReliabilityStrategy {
    private readonly redis = RedisCacheService.instance;

    public buildMessageDigest(rawMessage: string): string {
        return createHash("sha256").update(rawMessage).digest("hex");
    }

    public async isMessageProcessed(scope: string, messageDigest: string): Promise<boolean> {
        const value = await this.redis.get(keyProcessed(scope, messageDigest));
        return value === "1";
    }

    public async markMessageProcessed(
        scope: string,
        messageDigest: string,
        ttlSeconds: number = DEFAULT_PROCESSED_TTL_SECONDS
    ): Promise<void> {
        await this.redis.set(keyProcessed(scope, messageDigest), "1", ttlSeconds);
    }

    public async acquireMessageLock(
        scope: string,
        messageDigest: string,
        ttlSeconds: number = DEFAULT_LOCK_TTL_SECONDS
    ): Promise<boolean> {
        return this.redis.setIfNotExists(keyLock(scope, messageDigest), "1", ttlSeconds);
    }

    public async releaseMessageLock(scope: string, messageDigest: string): Promise<void> {
        await this.redis.delete(keyLock(scope, messageDigest));
    }
}
