declare module "cookie-parser" {
    import type { RequestHandler } from "express";

    function cookieParser(secret?: string | string[], options?: Record<string, unknown>): RequestHandler;
    export = cookieParser;
}

declare module "cors" {
    const cors: any;
    export = cors;
}

declare module "bcryptjs" {
    const bcrypt: any;
    export = bcrypt;
}
