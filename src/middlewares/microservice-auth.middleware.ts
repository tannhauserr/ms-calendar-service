import crypto from "crypto";
import jwt from "jsonwebtoken";
import { NextFunction, Request, Response as ExpressResponse } from "express";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { Response } from "../models/messages/response";

const normalizeHeaderValue = (value: unknown): string => {
    if (Array.isArray(value)) return String(value[0] ?? "").trim();
    if (typeof value === "string") return value.trim();
    return "";
};

const constantTimeEquals = (left: string, right: string): boolean => {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    if (leftBuffer.length !== rightBuffer.length) return false;
    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const resolveExpectedInternalSecret = (): string => normalizeHeaderValue(env.INTERNAL_MS_SECRET);

type CallerResolution = {
    caller: string;
    source: "header" | "bearer-sub" | "missing";
    tokenError?: "decode_failed" | "sub_missing";
};

const normalizeCallerName = (value: string): string => value.trim().toLowerCase();

const decodeBearerCaller = (authorizationHeader: string): CallerResolution => {
    if (!authorizationHeader.startsWith("Bearer ")) {
        return { caller: "", source: "missing" };
    }

    const token = authorizationHeader.slice(7).trim();
    if (!token) {
        return { caller: "", source: "missing" };
    }

    const decoded = jwt.decode(token);
    if (!decoded || typeof decoded === "string") {
        return { caller: "", source: "missing", tokenError: "decode_failed" };
    }

    const subject = typeof decoded.sub === "string" ? normalizeCallerName(decoded.sub) : "";
    if (!subject) {
        return { caller: "", source: "missing", tokenError: "sub_missing" };
    }

    return { caller: subject, source: "bearer-sub" };
};

const resolveCaller = (req: Request): CallerResolution => {
    const callerFromHeader = normalizeCallerName(
        normalizeHeaderValue(req.headers["x-internal-ms-allowed"]),
    );

    if (callerFromHeader) {
        return { caller: callerFromHeader, source: "header" };
    }

    const authorizationHeader = normalizeHeaderValue(req.headers.authorization);
    return decodeBearerCaller(authorizationHeader);
};

const ALLOWED_INTERNAL_CALLERS = new Set(
    [
        process.env.MS_LOGIN_NAME || "auth",
        process.env.MS_BOOKING_PAGE_NAME || "bookingPage",
        process.env.MS_CLIENT_NAME || "client",
        process.env.MS_CALENDAR_NAME || "calendar",
        process.env.MS_NOTIFICATION_NAME || "cnotification",
    ].map((value) => value.trim().toLowerCase()),
);

export class MicroserviceAuthMiddleware {
    static verify(req: Request, res: ExpressResponse, next: NextFunction) {
        const requestPath = req.originalUrl || req.url;
        const { caller, source, tokenError } = resolveCaller(req);

        if (!caller) {
            logger.warn(
                {
                    event: "internal_ms_auth_reject",
                    code: "INTERNAL_MS_ALLOWED_MISSING",
                    reason: tokenError ? `caller_missing_${tokenError}` : "caller_missing",
                    method: req.method,
                    path: requestPath,
                    hasAuthorizationHeader: Boolean(normalizeHeaderValue(req.headers.authorization)),
                },
                "Rejected internal request: missing caller",
            );
            return res
                .status(401)
                .json(Response.build("Missing x-internal-ms-allowed header", 401, false, null, "INTERNAL_MS_ALLOWED_MISSING"));
        }

        if (!ALLOWED_INTERNAL_CALLERS.has(caller)) {
            logger.warn(
                {
                    event: "internal_ms_auth_reject",
                    code: "INTERNAL_MS_CALLER_NOT_ALLOWED",
                    reason: "caller_not_allowed",
                    method: req.method,
                    path: requestPath,
                    caller,
                    callerSource: source,
                },
                "Rejected internal request: caller is not allowed",
            );
            return res
                .status(403)
                .json(Response.build("Caller is not allowed", 403, false, null, "INTERNAL_MS_CALLER_NOT_ALLOWED"));
        }

        const token = normalizeHeaderValue(req.headers["x-internal-ms-secret"]);
        if (!token) {
            logger.warn(
                {
                    event: "internal_ms_auth_reject",
                    code: "INTERNAL_MS_SECRET_MISSING",
                    reason: "secret_missing",
                    method: req.method,
                    path: requestPath,
                    caller,
                    callerSource: source,
                },
                "Rejected internal request: missing internal secret",
            );
            return res
                .status(401)
                .json(Response.build("Missing x-internal-ms-secret header", 401, false, null, "INTERNAL_MS_SECRET_MISSING"));
        }

        const expectedSecret = resolveExpectedInternalSecret();

        if (!expectedSecret || !constantTimeEquals(token, expectedSecret)) {
            logger.warn(
                {
                    event: "internal_ms_auth_reject",
                    code: "INTERNAL_MS_SECRET_INVALID",
                    reason: "secret_invalid",
                    method: req.method,
                    path: requestPath,
                    caller,
                    callerSource: source,
                },
                "Rejected internal request: invalid internal secret",
            );
            return res
                .status(403)
                .json(Response.build("Invalid internal token", 403, false, null, "INTERNAL_MS_SECRET_INVALID"));
        }

        return next();
    }
}
