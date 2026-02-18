import { z } from "zod";
import { dateOrStringSchema, idSchema } from "./common.schema";

const updateEventInputSchema = z.looseObject({
        id: idSchema.optional(),
        startDate: dateOrStringSchema.optional(),
        endDate: dateOrStringSchema.optional(),
        title: z.string().optional(),
        description: z.string().nullable().optional(),
        idUserPlatformFk: idSchema.nullable().optional(),
        idServiceFk: idSchema.nullable().optional(),
        eventPurposeType: z.unknown().optional(),
        allDay: z.boolean().optional(),
        serviceNameSnapshot: z.string().nullable().optional(),
        servicePriceSnapshot: z.number().nullable().optional(),
        serviceDiscountSnapshot: z.number().nullable().optional(),
        serviceDurationSnapshot: z.number().nullable().optional(),
        serviceMaxParticipantsSnapshot: z.number().nullable().optional(),
    });

export const updateByIdParamsSchema = z.object({
    id: idSchema,
});

export const updateByIdBodySchema = z.looseObject({
        event: updateEventInputSchema.optional(),
        isMany: z.boolean().optional(),
        sendNotification: z.boolean().optional(),
    })
    .superRefine((data, ctx) => {
        if (data.isMany && (!data.event?.startDate || !data.event?.endDate)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "event.startDate y event.endDate son requeridos cuando isMany=true",
                path: ["event"],
            });
        }
    });
