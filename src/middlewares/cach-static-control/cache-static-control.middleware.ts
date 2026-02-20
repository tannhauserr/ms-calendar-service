import type { NextFunction, Request, Response } from "express";

export class CacheStaticControlMiddleware {
    static handleCache = (duration: number) => {
        return (req: Request, res: Response, next: NextFunction) => {
            if (req.method == 'GET') {
                res.set('Cache-control', `public, max-age=${duration}`);
            } else {
                res.set('Cache-control', `no-store`);
            }
            next();
        };
    };
}
