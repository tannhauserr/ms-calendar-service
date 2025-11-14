


// src/middlewares/microservice-auth/microservice-auth.middleware.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import axios from "axios";
import jwkToPem from "jwk-to-pem";
import CustomError from "../../models/custom-error/CustomError";

type Jwk = { kid: string; kty: "RSA"; n: string; e: string; alg?: string; use?: string };

export class MicroserviceAuthMiddleware {
    private static _jwksCache: { keys: Jwk[] } | null = null;
    private static _jwksFetchedAt = 0;
    private static readonly _JWKS_TTL_MS = 5 * 60_000;

    private static async _fetchJwks(): Promise<Jwk[]> {
        const base = process.env.SERVICE_ISSUER_URL || "http://ms-login:3000/api/ms/internal-token";
        // 👇 prefijo fijo
        const url = `${base}/.well-known/jwks.json`;

        console.log("[MicroserviceAuthMiddleware] fetching JWKS from:", url);

        const resp = await axios.get(url, { timeout: 3000, validateStatus: () => true });
        if (resp.status !== 200) {
            throw new Error(`JWKS HTTP ${resp.status}: ${JSON.stringify(resp.data).slice(0, 200)}`);
        }
        return resp.data.keys as Jwk[];
    }

    private static async _getJwks(force = false): Promise<Jwk[]> {
        const now = Date.now();
        if (
            !MicroserviceAuthMiddleware._jwksCache ||
            force ||
            now - MicroserviceAuthMiddleware._jwksFetchedAt > MicroserviceAuthMiddleware._JWKS_TTL_MS
        ) {
            MicroserviceAuthMiddleware._jwksCache = { keys: await MicroserviceAuthMiddleware._fetchJwks() };
            MicroserviceAuthMiddleware._jwksFetchedAt = now;
        }
        return MicroserviceAuthMiddleware._jwksCache.keys;
    }

    private static async _getPemForKid(kid: string): Promise<string | null> {
        let keys = await MicroserviceAuthMiddleware._getJwks(false);
        let jwk = keys.find((k) => k.kid === kid && (k.use === "sig" || !k.use));
        if (jwk) return jwkToPem(jwk);

        keys = await MicroserviceAuthMiddleware._getJwks(true);
        jwk = keys.find((k) => k.kid === kid && (k.use === "sig" || !k.use));
        return jwk ? jwkToPem(jwk) : null;
    }

    static async verify(req: Request, res: Response, next: NextFunction) {
        try {
            const path = req.originalUrl.split("?")[0];
            console.log("MicroserviceAuthMiddleware.verify", { path });
            if (/^\/api\/ms\/internal-token\/service\/token$/i.test(path)) {
                return next();
            }

            const auth = req.header("authorization") || "";
            const m = auth.match(/^Bearer\s+(.+)$/i);
            if (!m) return res.status(401).json({ ok: false, error: "missing token" });

            const token = m[1];
            const decodedHeader = jwt.decode(token, { complete: true }) as any;
            const kid = decodedHeader?.header?.kid;
            if (!kid) return res.status(401).json({ ok: false, error: "missing kid" });

            const pem = await MicroserviceAuthMiddleware._getPemForKid(kid);
            if (!pem) return res.status(401).json({ ok: false, error: "unknown kid" });

            const decoded = jwt.verify(token, pem, {
                algorithms: ["RS256"],
                issuer: process.env.SERVICE_ISSUER_URL || "http://ms-login:3000/api/ms/internal-token", // 👈 alineado con signService
                audience: process.env.MS_NAME,
                clockTolerance: 60,
            }) as any;

            const allowed = (process.env.ALLOWED_SERVICE_SUBS || "")
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
            if (allowed.length && !allowed.includes(decoded.sub)) {
                return res.status(403).json({ ok: false, error: "sub not allowed" });
            }

            (req as any).serviceToken = decoded;
            next();
        } catch (err: any) {
            new CustomError("MicroserviceAuthMiddleware.verify", err);
            return res.status(401).json({ ok: false });
        }
    }
}
