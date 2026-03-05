import { z } from "zod";
import { bootstrapLogger } from "./bootstrap-logger";
import "./load-env";

const booleanFromEnv = z.preprocess((value) => {
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (["1", "true", "yes", "on"].includes(normalized)) return true;
        if (["0", "false", "no", "off", ""].includes(normalized)) return false;
    }
    return value;
}, z.boolean());

const envSchema = z
    .object({
        NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
        PORT: z.coerce.number().int().positive().default(3201),
        LOG_LEVEL: z
            .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
            .default("info"),
        ENABLE_REDIS: booleanFromEnv.default(true),
        ENABLE_RABBITMQ: booleanFromEnv.default(true),
        INTEGRATIONS_MODE: z.enum(["http", "mock"]).default("http"),

        DATABASE_URL: z.string().min(1),
        WEB_WHITELIST_CORS: z.string().min(1).default("[]"),

        REDIS_HOST: z.string().min(1),
        REDIS_PORT: z.coerce.number().int().positive().default(6379),
        REDIS_PASSWORD: z.string().optional(),
        REDIS_DB: z.coerce.number().int().min(0).default(0),

        RABBITMQ_USER: z.string().min(1),
        RABBITMQ_PASSWORD: z.string().min(1),
        RABBITMQ_HOST: z.string().min(1),
        RABBITMQ_PORT: z.coerce.number().int().positive().default(5672),
        RABBITMQ_VHOST: z.string().default("/"),
        RABBITMQ_PREFETCH: z.coerce.number().int().positive().default(1),

        JWT_PRIVATE_KEY: z.string().min(1),
        TOKEN_MS_LOGIN: z.string().min(1),
        TOKEN_MS_CATALOG: z.string().min(1),
        TOKEN_CLIENT: z.string().min(1),
        INTERNAL_MS_SECRET: z.string().min(1),
        TOKEN_MS_CALENDAR: z.string().min(1),

        URL_BACK_MS_GATEWAY: z.string().min(1),
        URL_BACK_MS_AUTH: z.string().min(1).optional(),
        URL_NEXTJS: z.string().optional(),
        REVALIDATE_TOKEN: z.string().optional(),
        REVALIDATE_HMAC_SECRET: z.string().optional(),

        DESCRYPT_KEY: z.string().min(1),
        DESCRYPT_KEY_VERSION: z.coerce.number().int().positive().default(1),
        DEFAULT_ID_COMPANY_FK: z.string().optional(),
        DEFAULT_COMPANY_FK: z.string().optional(),



    })
    .loose();

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    bootstrapLogger.fatal(
        {
            err: parsed.error,
            issues: parsed.error.flatten(),
        },
        "Invalid environment variables",
    );
    throw new Error(`Invalid environment variables: ${parsed.error.message}`);
}

export const env = parsed.data;
