import crypto from "crypto";
import { NextFunction, Request, Response as ExpressResponse } from "express";
import { env } from "../config/env";
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

const ALLOWED_INTERNAL_CALLERS = new Set(
    [
        process.env.MS_LOGIN_NAME || "auth",
        process.env.MS_BOOKING_PAGE_NAME || "bookingPage",
        process.env.MS_CLIENT_NAME || "client",
        process.env.MS_CALENDAR_NAME || "calendar",
    ].map((value) => value.trim().toLowerCase()),
);

export class MicroserviceAuthMiddleware {
    static verify(req: Request, res: ExpressResponse, next: NextFunction) {
        const caller = normalizeHeaderValue(req.headers["x-internal-ms-allowed"]).toLowerCase();
        if (!caller) {
            return res
                .status(401)
                .json(Response.build("Missing x-internal-ms-allowed header", 401, false, null, "INTERNAL_MS_ALLOWED_MISSING"));
        }

        if (!ALLOWED_INTERNAL_CALLERS.has(caller)) {
            return res
                .status(403)
                .json(Response.build("Caller is not allowed", 403, false, null, "INTERNAL_MS_CALLER_NOT_ALLOWED"));
        }

        const token = normalizeHeaderValue(req.headers["x-internal-ms-secret"]);
        if (!token) {
            return res
                .status(401)
                .json(Response.build("Missing x-internal-ms-secret header", 401, false, null, "INTERNAL_MS_SECRET_MISSING"));
        }

        if (!constantTimeEquals(token, env.TOKEN_MS_CALENDAR)) {
            return res
                .status(403)
                .json(Response.build("Invalid internal token", 403, false, null, "INTERNAL_MS_SECRET_INVALID"));
        }

        return next();
    }
}

