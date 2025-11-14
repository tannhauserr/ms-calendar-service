// src/notifications/events-bus.store.ts
import { z } from "zod";

/** Estados internos (si los usas en ms-login) */
export type InternalStatus =
    | "queued"
    | "resolving"
    | "sending"
    | "sent"
    | "partiallyFailed"
    | "failed"
    | "canceled";

/** Estados canónicos en el BUS (compatibles con consumers) */
export type BusStatus = "pending" | "sent" | "failed" | "canceled";

/** Normaliza estados internos → BUS */
export function mapStatusToBus(s?: InternalStatus): BusStatus {
    switch (s) {
        case "sent":
            return "sent";
        case "failed":
        case "partiallyFailed":
            return "failed";
        case "canceled":
            return "canceled";
        // queued | resolving | sending | undefined
        default:
            return "pending";
    }
}

/** Mensaje ATÓMICO por canal/target */
export type StoreNotificationCreatedV1 = {
    v: 1;
    notification: {
        id: string;
        workspaceId?: string;
        companyId?: string;
        eventId?: string;

        kind:
        | "booking"
        | "marketing"
        | "system";
        audienceType: "USER" | "CLIENT" | "TOPIC" | "DEVICE" | "COMPANY" | "WORKSPACE" | "USER_PARTICIPANT";
        audienceRef?: string;

        title?: string;
        body?: string;
        dataJson?: any;
        dedupeKey?: string;
        templateKey?: string;

        /** ya mapeado al set del BUS */
        status?: BusStatus;
        priority?: number;
        scheduledDate?: string; // ISO 8601
        expiresDate?: string;   // ISO 8601

        /** AHORA en raíz (no existe targets[]) */
        channel: "email" | "whatsapp" | "sms" | "webpush" | "websocket";
        to?: { email?: string; phoneE164?: string; subscriptionId?: string };

        render?: {
            subject?: string;
            body?: string;
            templateKey?: string;
            templateData?: any;
            language?: string;
        };
    };
    trace: { correlationId: string; producedAt: string };
};

export type StoreNotificationDeletedV1 = {
    v: 1;
    id: string; // Notification.id
    trace: { correlationId: string; producedAt: string };
};

// ─────────── Zod (ATÓMICO) ───────────
export const StoreNotificationCreatedV1Schema = z.object({
    v: z.literal(1),
    notification: z.object({
        id: z.string().uuid(),
        workspaceId: z.string().optional(),
        companyId: z.string().optional(),

        kind: z.enum([
            "booking",
            "marketing",
            "system"
        ]),
        audienceType: z.enum(["USER", "CLIENT", "TOPIC", "DEVICE"]),
        audienceRef: z.string().optional(),

        title: z.string().optional(),
        body: z.string().optional(),
        dataJson: z.any().optional(),
        dedupeKey: z.string().optional(),
        templateKey: z.string().optional(),

        status: z.enum(["pending", "sent", "failed", "canceled"]).optional(),
        priority: z.number().int().optional(),
        scheduledDate: z.string().datetime().optional(),
        expiresDate: z.string().datetime().optional(),

        channel: z.enum(["email", "whatsapp", "sms", "webpush", "websocket"]),
        to: z.object({
            email: z.string().email().optional(),
            phoneE164: z.string().optional(),
            subscriptionId: z.string().optional(), // no lo obligamos a UUID
        }).optional(),

        render: z.object({
            subject: z.string().optional(),
            body: z.string().optional(),
            templateKey: z.string().optional(),
            templateData: z.any().optional(),
            language: z.string().optional(),
        }).optional(),
    }),
    trace: z.object({
        correlationId: z.string().uuid(),
        producedAt: z.string().datetime(),
    }),
});

export const StoreNotificationDeletedV1Schema = z.object({
    v: z.literal(1),
    id: z.string().uuid(),
    trace: z.object({
        correlationId: z.string().uuid(),
        producedAt: z.string().datetime(),
    }),
});
