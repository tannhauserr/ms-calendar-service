import { z } from "zod";
import { WeekDayType } from "@prisma/client";
import {
    addBusinessHourSchema,
    businessHourIdParamsSchema,
    businessHourWeekDayParamsSchema,
    businessHoursRedisQuerySchema,
    businessHoursRedisSchema,
    deleteBusinessHourSchema,
    getBusinessHoursQuerySchema,
    getBusinessHoursSchema,
    updateBusinessHourSchema,
} from "../schemas";

export interface AddBusinessHourDto extends z.infer<typeof addBusinessHourSchema> {}
export interface UpdateBusinessHourDto extends z.infer<typeof updateBusinessHourSchema> {}
export interface GetBusinessHoursDto extends z.infer<typeof getBusinessHoursSchema> {}
export interface GetBusinessHoursQueryDto extends z.infer<typeof getBusinessHoursQuerySchema> {}
export interface DeleteBusinessHourDto extends z.infer<typeof deleteBusinessHourSchema> {}
export interface BusinessHoursRedisDto extends z.infer<typeof businessHoursRedisSchema> {}
export interface BusinessHoursRedisQueryDto extends z.infer<typeof businessHoursRedisQuerySchema> {}
export interface BusinessHourIdParamsDto extends z.infer<typeof businessHourIdParamsSchema> {}
export interface BusinessHourWeekDayParamsDto extends z.infer<typeof businessHourWeekDayParamsSchema> {}
export interface WorkspaceBusinessHourDraftDto {
    weekDayType: WeekDayType;
    startTime?: string | null;
    endTime?: string | null;
    closed?: boolean;
}
export interface InternalGenerateWorkspaceBusinessHoursDto {
    idCompany: string;
    idWorkspace: string;
    businessHours: WorkspaceBusinessHourDraftDto[];
}
