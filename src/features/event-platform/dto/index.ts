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

export type GetEventsBodyDto = z.infer<typeof getEventsBodySchema>;
export type GetEventsListBodyDto = z.infer<typeof getEventsListBodySchema>;
export type GetEventByIdParamsDto = z.infer<typeof getEventByIdParamsSchema>;

export type GetEventExtraDataBodyDto = z.infer<typeof getEventExtraDataBodySchema>;
export type GetEventExtraDataParamsDto = z.infer<typeof getEventExtraDataParamsSchema>;

export type MarkCommentAsReadBodyDto = z.infer<typeof markCommentAsReadBodySchema>;
export type DeleteEventBodyDto = z.infer<typeof deleteEventBodySchema>;
export type ChangeEventStatusBodyDto = z.infer<typeof changeEventStatusBodySchema>;
export type ChangeEventStatusByParticipantBodyDto = z.infer<typeof changeEventStatusByParticipantBodySchema>;

export type UpdateByIdBodyDto = z.infer<typeof updateByIdBodySchema>;
export type UpdateByIdParamsDto = z.infer<typeof updateByIdParamsSchema>;

export type UpsertEventByPlatformBodyDto = z.infer<typeof upsertEventByPlatformBodySchema>;

export type InternalGetEventDataByIdBodyDto = z.infer<typeof internalGetEventDataByIdBodySchema>;
export type InternalGetGroupDataByIdBodyDto = z.infer<typeof internalGetGroupDataByIdBodySchema>;

