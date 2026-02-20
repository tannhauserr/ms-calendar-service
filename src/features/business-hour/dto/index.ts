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

export type AddBusinessHourDto = z.infer<typeof addBusinessHourSchema>;
export type UpdateBusinessHourDto = z.infer<typeof updateBusinessHourSchema>;
export type GetBusinessHoursDto = z.infer<typeof getBusinessHoursSchema>;
export type GetBusinessHoursQueryDto = z.infer<typeof getBusinessHoursQuerySchema>;
export type DeleteBusinessHourDto = z.infer<typeof deleteBusinessHourSchema>;
export type BusinessHoursRedisDto = z.infer<typeof businessHoursRedisSchema>;
export type BusinessHoursRedisQueryDto = z.infer<typeof businessHoursRedisQuerySchema>;
export type BusinessHourIdParamsDto = z.infer<typeof businessHourIdParamsSchema>;
export type BusinessHourWeekDayParamsDto = z.infer<typeof businessHourWeekDayParamsSchema>;
export type WorkspaceBusinessHourDraftDto = {
    weekDayType: WeekDayType;
    startTime?: string | null;
    endTime?: string | null;
    closed?: boolean;
};
export type InternalGenerateWorkspaceBusinessHoursDto = {
    idCompany: string;
    idWorkspace: string;
    businessHours: WorkspaceBusinessHourDraftDto[];
};
