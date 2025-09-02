// middlewares/publicGuard.ts
import { z } from "zod";
import type { Request, Response, NextFunction } from "express";

type PublicGuardOpts<T> = {
    // esquema zod para validar req.query o req.body
    schema: z.ZodType<T>;
    // cabecera Cache-Control (compartible por CDNs)
    cacheControl?: string; // por defecto: public, s-maxage=60, stale-while-revalidate=30
    // exigir User-Agent (suave anti-bot)
    requireUserAgent?: boolean; // por defecto: true
};

export function publicGuardQuery<T = unknown>({
    schema,
    cacheControl = "public, s-maxage=60, stale-while-revalidate=30",
    requireUserAgent = true,
}: PublicGuardOpts<T>) {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            if (requireUserAgent && !req.headers["user-agent"]) {
                // TODO: Poner log

                return res.status(400).json({ ok: false, message: "Missing User-Agent" });
            }

            const parsed = schema.safeParse(req.query);
            if (!parsed.success) {
                const msg = parsed.error.issues[0]?.message || "Invalid request";
                // TODO: Poner log

                return res.status(400).json({ ok: false, message: msg });
            }

            res.setHeader("Cache-Control", cacheControl);
            res.setHeader("X-Robots-Tag", "noindex");

            (req as any).public = parsed.data;
            next();
        } catch (err) {
            next(err);
        }
    };
}

export function publicGuardBody<T = unknown>({
    schema,
    cacheControl = "public, s-maxage=60, stale-while-revalidate=30",
    requireUserAgent = true,
}: PublicGuardOpts<T>) {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            if (requireUserAgent && !req.headers["user-agent"]) {
                // TODO: Poner log
                return res.status(400).json({ ok: false, message: "Missing User-Agent" });
            }

            const parsed = schema.safeParse(req.body);
            if (!parsed.success) {
                const msg = parsed.error.issues[0]?.message || "Invalid request";
                // TODO: Poner log
                return res.status(400).json({ ok: false, message: msg });
            }

            res.setHeader("Cache-Control", cacheControl);
            res.setHeader("X-Robots-Tag", "noindex");

            (req as any).public = parsed.data;
            next();
        } catch (err) {
            next(err);
        }
    };
}
