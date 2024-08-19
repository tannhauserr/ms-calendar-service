import { Request } from 'express';

declare namespace Express {
    interface Request {
        userInfo?: {
            ip: string;
            referrer?: string;
        };
    }
}
