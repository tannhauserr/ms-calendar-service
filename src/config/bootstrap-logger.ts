import pino from "pino";

export const bootstrapLogger = pino({
    level: process.env.LOG_LEVEL || "info",
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
});
