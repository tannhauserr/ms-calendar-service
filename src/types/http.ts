import type { Request, Response } from "express";
import type { ParamsDictionary, Query } from "express-serve-static-core";

export type TypedRequest<
    P extends ParamsDictionary = ParamsDictionary,
    ReqBody = unknown,
    ReqQuery extends Query = Query
> = Request<P, any, ReqBody, ReqQuery>;

export type TypedAuthRequest<
    P extends ParamsDictionary = ParamsDictionary,
    ReqBody = unknown,
    ReqQuery extends Query = Query
> = TypedRequest<P, ReqBody, ReqQuery> & {
    token?: string;
    booking?: { ctx: any };
};

export type TypedResponse<T = any> = Response<T>;
