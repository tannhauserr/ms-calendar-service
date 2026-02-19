import { Response } from "../messages/response";
import { ControllerErrorCatalog } from "./error-catalog";

export type ControllerErrorCode = (typeof ControllerErrorCatalog)[keyof typeof ControllerErrorCatalog]["code"];

export type ControllerErrorDefinition = {
    code: ControllerErrorCode;
    message: string;
};

export const ControllerErrorCodes = ControllerErrorCatalog;

export type ControllerErrorKey = keyof typeof ControllerErrorCodes;

export const resolveControllerError = (
    key: ControllerErrorKey,
    overrideMessage?: string
): ControllerErrorDefinition => {
    const error = ControllerErrorCodes[key];
    return {
        code: error.code,
        message: overrideMessage ?? error.message,
    };
};

export const buildControllerErrorResponse = (
    key: ControllerErrorKey,
    status: number,
    overrideMessage?: string,
    item: unknown = null
) => {
    const error = resolveControllerError(key, overrideMessage);
    return Response.build(error.message, status, false, item, error.code);
};
