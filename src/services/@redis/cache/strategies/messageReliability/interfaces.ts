export interface IRedisMessageReliabilityStrategy {
    buildMessageDigest(rawMessage: string): string;
    isMessageProcessed(scope: string, messageDigest: string): Promise<boolean>;
    markMessageProcessed(scope: string, messageDigest: string, ttlSeconds?: number): Promise<void>;
    acquireMessageLock(scope: string, messageDigest: string, ttlSeconds?: number): Promise<boolean>;
    releaseMessageLock(scope: string, messageDigest: string): Promise<void>;
}
