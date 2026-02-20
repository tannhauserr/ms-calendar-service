import { EventStatusType } from "@prisma/client";
import { SidebarBackendBookingPayload } from "../../../services/@database/event/dto/SidebarBackendBookingPayload";

export const MANAGE_EVENT_WORKERS = {
    David: "2917f4e1-3e9e-4868-a1f0-fc4f26fbf531",
    Grabiella: "5a7a6d26-3e8d-4f58-b851-2f83a2f7fbb4",
    Scott: "b8f8f539-52b7-4c8a-98b0-92190ca9676e",
} as const;

export type ManageEventWorkerName = keyof typeof MANAGE_EVENT_WORKERS;

export const MANAGE_EVENT_START_SLOTS = (() => {
    const slots: string[] = [];
    for (let hour = 8; hour <= 20; hour++) {
        for (const minute of [0, 15, 30, 45]) {
            if (hour === 20 && minute > 0) continue;
            slots.push(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
        }
    }
    return slots;
})();

export const MANAGE_EVENT_STATUS_OPTIONS = Object.values(EventStatusType);

export type ManageEventQueryOptions = {
    worker?: ManageEventWorkerName;
    startSlot?: string;
    date?: string;
    eventStatusType?: EventStatusType;
};

const resolveBaseDate = (payload: SidebarBackendBookingPayload, date?: string): string => {
    if (date) return date;
    if (typeof payload.startDate === "string" && payload.startDate.length >= 10) {
        return payload.startDate.slice(0, 10);
    }
    return new Date().toISOString().slice(0, 10);
};

export const applyManageEventOptions = (
    rawPayload: SidebarBackendBookingPayload,
    options: ManageEventQueryOptions
): SidebarBackendBookingPayload => {
    const payload: SidebarBackendBookingPayload = {
        ...rawPayload,
        // Required by request: keep demo/portfolio deterministic and dependency-light.
        sendNotification: false,
        services: Array.isArray(rawPayload.services) ? rawPayload.services.map((service) => ({ ...service })) : [],
        clients: Array.isArray(rawPayload.clients) ? rawPayload.clients.map((client) => ({ ...client })) : [],
    };

    if (options.worker) {
        const workerId = MANAGE_EVENT_WORKERS[options.worker];
        payload.services = payload.services.map((service) => ({
            ...service,
            idWorker: workerId,
        }));
    }

    if (options.eventStatusType) {
        payload.eventStatusType = options.eventStatusType;
    }

    if (options.startSlot) {
        const baseDate = resolveBaseDate(payload, options.date);
        const startDate = `${baseDate}T${options.startSlot}:00.000Z`;
        const totalMinutes =
            payload.services.reduce((acc, service) => acc + (Number(service.duration) || 0), 0) || 60;
        const endDate = new Date(new Date(startDate).getTime() + totalMinutes * 60_000).toISOString();

        payload.startDate = startDate;
        payload.endDate = endDate;
    }

    return payload;
};
