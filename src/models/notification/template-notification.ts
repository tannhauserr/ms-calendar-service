/** Tipos alineados con el backend */
export type NotificationChannel = "email" | "whatsapp" | "sms" | "push" | "websocket" | "webhook";
export type OwnerScope = "PLATFORM" | "COMPANY" | "WORKSPACE" | "BOOKING_PAGE" | "USER";

export type LanguageType =
    | "af" | "ar" | "fa" | "he" | "hi" | "ja" | "ko" | "mn" | "th" | "tr" | "ur" | "vi" | "zh"
    | "ca" | "da" | "de" | "en" | "es" | "fi" | "fr" | "it" | "nb" | "nl" | "nn" | "pt" | "sv"
    | "bg" | "cs" | "el" | "hr" | "hu" | "lt" | "lv" | "mk" | "pl" | "ro" | "ru" | "sk" | "sl" | "sq" | "sr" | "uk"
    | "az" | "bn" | "bs" | "id" | "ms";

export interface TemplateNotification {
    id?: string;
    ownerScope: OwnerScope;
    ownerId: string;
    channel: NotificationChannel;
    key: string;
    language: LanguageType;
    subject?: string | null;        // email/push opcional
    body?: string | null;           // email/sms/push opcional
    waTemplateName?: string | null; // whatsapp opcional
    isActive?: boolean;
};