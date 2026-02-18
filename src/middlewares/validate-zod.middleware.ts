import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

const getIssueMessage = (issues: Array<{ path?: PropertyKey[]; message?: string }>) => {
    const first = issues[0];
    if (!first) {
        return "Invalid request";
    }

    if (!first.path?.length) {
        return first.message ?? "Invalid request";
    }

    const path = first.path.map((item) => String(item)).join(".");
    return `${path}: ${first.message ?? "Invalid request"}`;
};

export const validateBody = (schema: z.ZodType<unknown>) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const parsed = schema.safeParse(req.body);

        if (!parsed.success) {
            console.log("Validation error:", parsed.error.issues);
            return res.status(400).json({
                ok: false,
                message: getIssueMessage(parsed.error.issues),
            });
        }

        req.body = parsed.data;
        return next();
    };
};

export const validateParams = (schema: z.ZodType<unknown>) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const parsed = schema.safeParse(req.params);

        if (!parsed.success) {
            return res.status(400).json({
                ok: false,
                message: getIssueMessage(parsed.error.issues),
            });
        }

        req.params = parsed.data as Request["params"];
        return next();
    };
};

export const validateQuery = (schema: z.ZodType<unknown>) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const parsed = schema.safeParse(req.query);

        if (!parsed.success) {
            return res.status(400).json({
                ok: false,
                message: getIssueMessage(parsed.error.issues),
            });
        }

        req.query = parsed.data as Request["query"];
        return next();
    };
};
