import { z } from "zod";
import {
    changeEventStatusBodySchema,
    changeEventStatusByParticipantBodySchema,
    deleteEventBodySchema,
    getEventByIdParamsSchema,
    getEventExtraDataBodySchema,
    getEventExtraDataParamsSchema,
    getEventsBodySchema,
    getEventsListBodySchema,
    internalGetEventDataByIdBodySchema,
    internalGetGroupDataByIdBodySchema,
    markCommentAsReadBodySchema,
    updateByIdBodySchema,
    updateByIdParamsSchema,
    upsertEventByPlatformBodySchema,
} from "../schemas";

export interface GetEventsBodyDto extends z.infer<typeof getEventsBodySchema> {}
export interface GetEventsListBodyDto extends z.infer<typeof getEventsListBodySchema> {}
export interface GetEventByIdParamsDto extends z.infer<typeof getEventByIdParamsSchema> {}

export interface GetEventExtraDataBodyDto extends z.infer<typeof getEventExtraDataBodySchema> {}
export interface GetEventExtraDataParamsDto extends z.infer<typeof getEventExtraDataParamsSchema> {}

export interface MarkCommentAsReadBodyDto extends z.infer<typeof markCommentAsReadBodySchema> {}
export interface DeleteEventBodyDto extends z.infer<typeof deleteEventBodySchema> {}
export interface ChangeEventStatusBodyDto extends z.infer<typeof changeEventStatusBodySchema> {}
export interface ChangeEventStatusByParticipantBodyDto
    extends z.infer<typeof changeEventStatusByParticipantBodySchema> {}

export interface UpdateByIdBodyDto extends z.infer<typeof updateByIdBodySchema> {}
export interface UpdateByIdParamsDto extends z.infer<typeof updateByIdParamsSchema> {}

export interface UpsertEventByPlatformBodyDto extends z.infer<typeof upsertEventByPlatformBodySchema> {}

export interface InternalGetEventDataByIdBodyDto extends z.infer<typeof internalGetEventDataByIdBodySchema> {}
export interface InternalGetGroupDataByIdBodyDto extends z.infer<typeof internalGetGroupDataByIdBodySchema> {}
