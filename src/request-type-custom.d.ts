declare namespace Express {
    interface Request {
        token?: string;
        userInfo?: {
            ip: string;
            referrer?: string;
        };
    }
}
