import { MiddlewareErrorCatalog } from "./error-catalog";

export type MiddlewareErrorCode = (typeof MiddlewareErrorCatalog)[keyof typeof MiddlewareErrorCatalog]["code"];

export type MiddlewareErrorDefinition = {
    code: MiddlewareErrorCode;
    message: string;
};

export const MiddlewareErrorCodes = MiddlewareErrorCatalog;

export type MiddlewareErrorKey = keyof typeof MiddlewareErrorCodes;

export const resolveMiddlewareError = (
    key: MiddlewareErrorKey,
    overrideMessage?: string
): MiddlewareErrorDefinition => {
    const error = MiddlewareErrorCodes[key];
    return {
        code: error.code,
        message: overrideMessage ?? error.message,
    };
};
