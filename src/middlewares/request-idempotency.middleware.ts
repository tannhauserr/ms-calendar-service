import { createHash } from "crypto";
import { RedisCacheService } from "../services/@redis/cache/redis.service";
import { TIME_SECONDS } from "../constant/time";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type DuplicateClickGuardOptions = {
    ttlSeconds?: number;
    methods?: HttpMethod[];
    keyPrefix?: string;
    includeQuery?: boolean;
    failOpen?: boolean;
    statusCode?: number;
    message?: string;
    ignoredPaths?: Array<string | RegExp>;
};

const DEFAULT_METHODS: HttpMethod[] = ["POST", "PUT", "PATCH", "DELETE"];

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    return Object.prototype.toString.call(value) === "[object Object]";
};

const normalizeForHash = (value: unknown): unknown => {
    if (value instanceof Date) {
        return value.toISOString();
    }

    if (Array.isArray(value)) {
        return value.map((item) => normalizeForHash(item));
    }

    if (isPlainObject(value)) {
        const sortedKeys = Object.keys(value).sort();
        const result: Record<string, unknown> = {};

        for (const key of sortedKeys) {
            result[key] = normalizeForHash(value[key]);
        }

        return result;
    }

    return value;
};

const sha256 = (value: string): string => {
    return createHash("sha256").update(value).digest("hex");
};

const pathIsIgnored = (path: string, ignored: Array<string | RegExp>): boolean => {
    for (const candidate of ignored) {
        if (typeof candidate === "string" && candidate === path) {
            return true;
        }
        if (candidate instanceof RegExp && candidate.test(path)) {
            return true;
        }
    }

    return false;
};

export class RequestIdempotencyMiddleware {
    static preventDuplicateClicks(options: DuplicateClickGuardOptions = {}) {
        const ttlSeconds = options.ttlSeconds ?? TIME_SECONDS.SECOND * 5;
        const methods = (options.methods ?? DEFAULT_METHODS).map((method) => method.toUpperCase());
        const keyPrefix = options.keyPrefix ?? "avoid-minor-abuse";
        const includeQuery = options.includeQuery ?? false;
        const failOpen = options.failOpen ?? true;
        const statusCode = options.statusCode ?? 429;
        const message = options.message ?? "Duplicate request detected. Please wait a moment and try again.";
        const ignoredPaths = options.ignoredPaths ?? [];

        return async (req: any, res: any, next: any) => {
            try {
                const method = String(req.method || "").toUpperCase();
                if (!methods.includes(method)) {
                    return next();
                }

                const routePath = String(req.originalUrl || req.baseUrl || req.path || "").split("?")[0];
                if (pathIsIgnored(routePath, ignoredPaths)) {
                    return next();
                }

                const token: string | undefined = req.token;
                const ip = req.ip || req.headers?.["x-forwarded-for"] || "unknown";
                const subject = token
                    ? `token:${sha256(token)}`
                    : `ip:${sha256(String(ip))}`;

                const payload = {
                    body: normalizeForHash(req.body ?? {}),
                    params: normalizeForHash(req.params ?? {}),
                    query: includeQuery ? normalizeForHash(req.query ?? {}) : undefined,
                };

                const payloadHash = sha256(JSON.stringify(payload));
                const fingerprint = sha256(`${method}:${routePath}:${subject}:${payloadHash}`);
                const redisKey = `${keyPrefix}:${fingerprint}`;

                const locked = await RedisCacheService.instance.setIfNotExists(redisKey, "1", ttlSeconds);

                if (!locked) {
                    return res.status(statusCode).json({
                        ok: false,
                        message,
                        code: "DUPLICATE_REQUEST",
                    });
                }

                return next();
            } catch (error) {
                if (failOpen) {
                    return next();
                }

                return res.status(503).json({
                    ok: false,
                    message: "Idempotency guard unavailable",
                    code: "IDEMPOTENCY_UNAVAILABLE",
                });
            }
        };
    }
}
