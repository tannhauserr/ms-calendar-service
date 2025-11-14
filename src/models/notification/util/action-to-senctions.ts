// src/notifications/rules/action-to-sections.ts
import { NotificationEvent } from "../notification-config";

export type ActionKey =
    | "add"
    | "addFromRecurrence"
    | "addFromClientWithRequest"
    | "addFromClientWithoutRequest"
    | "update"
    | "cancel"
    | "rejectRequest"
    | "acceptRequest"
    | "markNoShow"
    | "end";

export const ACTION_TO_SECTIONS: Record<ActionKey, NotificationEvent[]> = {
    // Actions relacionados con solicitudes (requests)
    addFromClientWithRequest: ["booking.request.created", "booking.reminder.beforeStart", "booking.ended"],
    addFromClientWithoutRequest: ["booking.request.accepted", "booking.reminder.beforeStart", "booking.ended"],

    rejectRequest: ["booking.request.cancelled"],
    acceptRequest: ["booking.request.accepted", "booking.reminder.beforeStart", "booking.ended"],

    // Actions relacionados con bookings normales
    add: ["booking.request.accepted", "booking.reminder.beforeStart", "booking.ended"],
    addFromRecurrence: ["booking.reminder.beforeStart", "booking.ended"],
    update: ["booking.updated", "booking.reminder.beforeStart", "booking.ended"],
    cancel: ["booking.cancelled"],
    markNoShow: ["booking.noShow"],
    end: ["booking.ended"],
};
