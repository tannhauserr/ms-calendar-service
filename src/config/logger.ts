import pino from "pino";
import { env } from "./env";

export const logger = pino({
    level: env.LOG_LEVEL,
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
        paths: [
            "req.headers.authorization",
            "req.headers.x-internal-token",
            "req.headers.x-internal-ms-secret",
            "request.headers.authorization",
            "request.headers.x-internal-token",
            "request.headers.x-internal-ms-secret",
            "req.body.turnstileToken",
            "request.body.turnstileToken",
            "turnstileToken",
        ],
        censor: "[REDACTED]",
    },
});
