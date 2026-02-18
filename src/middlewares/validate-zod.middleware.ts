import { z } from "zod";

type RequestLike = {
    body?: unknown;
    params?: unknown;
    query?: unknown;
};

type ResponseLike = {
    status(code: number): ResponseLike;
    json(payload: unknown): unknown;
};

type NextLike = () => void;

/**
 * Validates and normalizes request body using a zod schema.
 */
export const validateBody = <T>(schema: z.ZodType<T>) => {
    return (req: RequestLike, res: ResponseLike, next: NextLike) => {
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                ok: false,
                message: "Invalid request body",
                errors: parsed.error.issues,
            });
        }

        req.body = parsed.data;
        return next();
    };
};

/**
 * Validates and normalizes request params using a zod schema.
 */
export const validateParams = <T>(schema: z.ZodType<T>) => {
    return (req: RequestLike, res: ResponseLike, next: NextLike) => {
        const parsed = schema.safeParse(req.params);
        if (!parsed.success) {
            return res.status(400).json({
                ok: false,
                message: "Invalid request params",
                errors: parsed.error.issues,
            });
        }

        req.params = parsed.data;
        return next();
    };
};

/**
 * Validates and normalizes request query using a zod schema.
 */
export const validateQuery = <T>(schema: z.ZodType<T>) => {
    return (req: RequestLike, res: ResponseLike, next: NextLike) => {
        const parsed = schema.safeParse(req.query);
        if (!parsed.success) {
            return res.status(400).json({
                ok: false,
                message: "Invalid request query",
                errors: parsed.error.issues,
            });
        }

        req.query = parsed.data;
        return next();
    };
};

