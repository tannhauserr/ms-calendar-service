// events-bus.ts
// Contratos del Event Bus para notificaciones
// -------------------------------------------

// ─── EMAIL ───────────────────────────────────────────────
export type DispatchNotificationEmail = {
    v: 1;
    notificationId: string;
    targetId: string;
    channel: "email";
    kind:
    | "booking"
    | "marketing"
    | "system";
    to: { email: string };
    meta: {
        workspaceId: string;
        audienceType: "USER" | "CLIENT" | "TOPIC" | "DEVICE" | "COMPANY" | "WORKSPACE" | "USER_PARTICIPANT";
        priority: number;
        companyId?: string;
        audienceRef?: string;
        scheduledDate?: string;
        expiresDate?: string;
        dedupeKey?: string;
    };
    trace: { correlationId: string; producedAt: string };
    render?: {
        subject?: string;
        body?: string;
        templateKey?: string;
        templateData?: any;
        language?: string;
    };
    data?: any;
};

// ─── WHATSAPP ────────────────────────────────────────────
export type DispatchNotificationWhatsapp = {
    v: 1;
    notificationId: string;
    targetId: string;
    channel: "whatsapp";
    kind:
    | "booking"
    | "marketing"
    | "system";
    to: { phoneE164: string };
    meta: {
        workspaceId: string;
        audienceType: "USER" | "CLIENT" | "TOPIC" | "DEVICE" | "COMPANY" | "WORKSPACE" | "USER_PARTICIPANT";
        priority: number;
        companyId?: string;
        audienceRef?: string;
        scheduledDate?: string;
        expiresDate?: string;
        dedupeKey?: string;
    };
    trace: { correlationId: string; producedAt: string };
    render?: {
        waTemplateName?: string;
        templateData?: any;
        language?: string;
        body?: string;
    };
    data?: any;
};

// ─── SMS ─────────────────────────────────────────────────
export type DispatchNotificationSms = {
    v: 1;
    notificationId: string;
    targetId: string;
    channel: "sms";
    kind:
    | "booking"
    | "marketing"
    | "system";
    to: { phoneE164: string };
    meta: {
        workspaceId: string;
        audienceType: "USER" | "CLIENT" | "TOPIC" | "DEVICE" | "COMPANY" | "WORKSPACE" | "USER_PARTICIPANT";
        priority: number;
        companyId?: string;
        audienceRef?: string;
        scheduledDate?: string;
        expiresDate?: string;
        dedupeKey?: string;
    };
    trace: { correlationId: string; producedAt: string };
    render: { body: string }; // SMS necesita texto obligatorio
    data?: any;
};



