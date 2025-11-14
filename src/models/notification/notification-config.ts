// notification-config.ts

import { NotificationChannel } from "../../services/@redis/cache/interfaces/models/booking-config";
import { TemplateNotification } from "./template-notification";


export type NotificationLine = "clientSide" | "organizerSide" | "system";

export type NotificationAudience =
    | "client"
    | "staff"
    | "business"
    | "customEmails";

export type NotificationEvent =
    | "booking.request.created"
    | "booking.request.accepted"
    | "booking.request.cancelled"
    | "booking.accepted"
    | "booking.rejected"
    | "booking.updated"
    | "booking.cancelled"
    | "booking.reminder.beforeStart"
    | "booking.ended"
    | "booking.noShow";

export type RelativeTo =
    | "booking.createdAt"
    | "booking.updatedAt"
    | "booking.startAtLocal"
    | "booking.endAtLocal";


export type MinutesAllowed = 2880 | 1440 | 720 | 360 | 240 | 120 | 60 | 5 | 0;

export type TimeUnit = "minutes" | "hours" | "days";

export interface NotificationConfig {
    version: number;
    updatedAt: string;
    updatedByUserId?: string;
    sections: NotificationSection[];
}

export interface NotificationSection {
    id: NotificationEvent;
    title: string;
    enabled: boolean;
    issues?: string[];
    groups: NotificationGroup[];
}

export interface ConditionTree {
    op: "AND" | "OR" | "NOT" | "LEAF";
    children?: ConditionTree[];
    field?: string;
    cmp?: "EQ" | "NEQ" | "IN" | "NIN" | "GT" | "GTE" | "LT" | "LTE" | "EXISTS";
    value?: any;
}

export interface NotificationGroup {
    id: string;
    label: string;
    condition?: ConditionTree;
    actions: NotificationAction[];
}

export interface NotificationAction {
    id: string;
    name: string;
    enabled: boolean;

    actor: NotificationLine;
    targetAudience: NotificationAudience;
    channel: NotificationChannel;

    policy:
    | { type: "immediate" }
    | { type: "offset"; value: number; unit: TimeUnit; relativeTo: RelativeTo };

    template?: TemplateNotification;
    dedupe?: { key: string; windowSec: number };
    rateLimit?: { windowSec: number; maxDispatches: number };
    onlyIf?: ConditionTree;
    metadata?: Record<string, any>;

    line?: Exclude<NotificationLine, "system">;
    audience?: NotificationAudience;
}

export function targetLineOf(aud: NotificationAudience): Exclude<NotificationLine, "system"> {
    return aud === "client" ? "clientSide" : "organizerSide";
}

export function migrateLegacyAction(a: NotificationAction): NotificationAction {
    const actor: NotificationLine =
        a.actor ?? a.line ?? (a.audience === "client" ? "clientSide" : "organizerSide");

    const targetAudience =
        a.targetAudience ?? a.audience ?? (actor === "clientSide" ? "client" : "business");

    return { ...a, actor, targetAudience };
}
