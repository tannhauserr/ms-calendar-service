import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockWarn = jest.fn();

jest.mock("../../../src/config/env", () => ({
    env: {
        LOG_LEVEL: "silent",
        INTERNAL_MS_SECRET: "calendar-secret",
        TOKEN_MS_CALENDAR: "calendar-secret",
    },
}));

jest.mock("../../../src/config/logger", () => ({
    logger: {
        warn: mockWarn,
        info: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    },
}));

import { MicroserviceAuthMiddleware } from "../../../src/middlewares/microservice-auth.middleware";

type MockRequest = {
    method: string;
    url: string;
    originalUrl: string;
    headers: Record<string, string | undefined>;
};

const buildReq = (headers: Record<string, string | undefined>): MockRequest => ({
    method: "POST",
    url: "/api/ms/internal/event/group/data",
    originalUrl: "/api/ms/internal/event/group/data",
    headers,
});

const buildRes = () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    return { status, json };
};

const toJwt = (payload: Record<string, unknown>): string => {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${header}.${body}.signature`;
};

describe("MicroserviceAuthMiddleware", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("returns 401 when caller is missing in both header and bearer token", () => {
        const req = buildReq({
            "x-internal-ms-secret": "calendar-secret",
        });
        const res = buildRes();
        const next = jest.fn();

        MicroserviceAuthMiddleware.verify(req as any, res as any, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ code: "INTERNAL_MS_ALLOWED_MISSING" }),
        );
        expect(next).not.toHaveBeenCalled();
        expect(mockWarn).toHaveBeenCalled();
    });

    it("accepts caller inferred from Authorization sub for cnotification", () => {
        const serviceToken = toJwt({
            aud: "calendar",
            sub: "cnotification",
            scope: "internal:read",
        });
        const req = buildReq({
            authorization: `Bearer ${serviceToken}`,
            "x-internal-ms-secret": "calendar-secret",
        });
        const res = buildRes();
        const next = jest.fn();

        MicroserviceAuthMiddleware.verify(req as any, res as any, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
    });

    it("returns 403 when inferred caller is not in allowlist", () => {
        const req = buildReq({
            authorization: `Bearer ${toJwt({ sub: "unknown-ms" })}`,
            "x-internal-ms-secret": "calendar-secret",
        });
        const res = buildRes();
        const next = jest.fn();

        MicroserviceAuthMiddleware.verify(req as any, res as any, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ code: "INTERNAL_MS_CALLER_NOT_ALLOWED" }),
        );
        expect(next).not.toHaveBeenCalled();
    });

    it("returns 403 when internal secret is invalid", () => {
        const req = buildReq({
            "x-internal-ms-allowed": "cnotification",
            "x-internal-ms-secret": "invalid-secret",
        });
        const res = buildRes();
        const next = jest.fn();

        MicroserviceAuthMiddleware.verify(req as any, res as any, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ code: "INTERNAL_MS_SECRET_INVALID" }),
        );
        expect(next).not.toHaveBeenCalled();
    });
});
