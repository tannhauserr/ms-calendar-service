// notification-event-rules.ts
import { MinutesAllowed, NotificationEvent, NotificationLine } from "./notification-config";
import { NotificationChannel } from "./template-notification";





type ChannelSlots = Partial<Record<NotificationChannel, MinutesAllowed[]>>; // minutos
type TargetCaps = {
    clientLimits?: ChannelSlots;
    organizerLimits?: ChannelSlots;
};
export type PerActorTargetChannelMax = Partial<Record<NotificationLine, TargetCaps>>;

export type EventRule = {
    /** Quién “genera” el evento en la UI (clientSide/organizerSide). Si se omite → usamos línea única system. */
    actors?: Exclude<NotificationLine, "system">[];
    /** Canales permitidos por línea de destino (cliente/organizador). */
    allowedChannelsByTargetLine: Partial<
        Record<Exclude<NotificationLine, "system">, NotificationChannel[]>
    >;
    /** Topes/cupos por actor→destino→canal, expresados en minutos (offsets). */
    caps?: { perActorTargetChannelMax?: PerActorTargetChannelMax };
    /** Pista para el layout. */
    uiHint?: "twoLanes" | "single";
    /** Base temporal por defecto para las policies de tipo offset. */
    defaultRelativeTo?:
    | "booking.startAtLocal"
    | "booking.endAtLocal"
    | "booking.createdAt"
    | "booking.updatedAt";
};

export const EVENT_RULES: Record<NotificationEvent, EventRule> = {
    /* ──────────────────────────────
     * Cuando se hace una petición de reserva
     * Única línea del CLIENTE; los envíos van al ORGANIZADOR (inmediatos).
     * ────────────────────────────── */
    "booking.request.created": {
        actors: ["clientSide"],
        allowedChannelsByTargetLine: {
            organizerSide: ["email", "push"],
        },
        caps: {
            perActorTargetChannelMax: {
                clientSide: {
                    organizerLimits: { email: [0], push: [0] },
                },
            },
        },
        uiHint: "single",
        defaultRelativeTo: "booking.createdAt",
    },

    /* ──────────────────────────────
     * Cuando se acepta una petición de reserva
     * Única línea del ORGANIZADOR; los envíos van al CLIENTE (inmediatos).
     * ────────────────────────────── */
    "booking.request.accepted": {
        actors: ["organizerSide"],
        allowedChannelsByTargetLine: {
            clientSide: ["email", "push"],
        },
        caps: {
            perActorTargetChannelMax: {
                organizerSide: {
                    clientLimits: { email: [0], push: [0] },
                },
            },
        },
        uiHint: "single",
        defaultRelativeTo: "booking.createdAt",
    },

    /* ──────────────────────────────
     * Cuando se cancela una petición de reserva
     * Única línea del ORGANIZADOR; los envíos van al CLIENTE (inmediatos).
     * ────────────────────────────── */
    "booking.request.cancelled": {
        actors: ["organizerSide"],
        allowedChannelsByTargetLine: {
            clientSide: ["email", "push"],
        },
        caps: {
            perActorTargetChannelMax: {
                organizerSide: {
                    clientLimits: { email: [0], push: [0] },
                },
            },
        },
        uiHint: "single",
        defaultRelativeTo: "booking.updatedAt",
    },

    /* ──────────────────────────────
     * Después de una nueva reserva
     * Dos ramas (cliente/organizador), inmediatas para ambos destinos.
     * ────────────────────────────── */
    "booking.accepted": {
        actors: ["clientSide", "organizerSide"],
        allowedChannelsByTargetLine: {
            clientSide: ["email", "push"],
            organizerSide: ["email", "push"],
        },
        caps: {
            perActorTargetChannelMax: {
                clientSide: {
                    clientLimits: { email: [0], push: [0] },
                    organizerLimits: { email: [0], push: [0] },
                },
                organizerSide: {
                    clientLimits: { email: [0], push: [0] },
                    organizerLimits: { email: [0], push: [0] },
                },
            },
        },
        uiHint: "twoLanes",
        defaultRelativeTo: "booking.createdAt",
    },

    /* ──────────────────────────────
     * Si la reserva se rechaza
     * Dos ramas, inmediatas.
     * ────────────────────────────── */
    "booking.rejected": {
        actors: ["clientSide", "organizerSide"],
        allowedChannelsByTargetLine: {
            clientSide: ["email", "push"],
            organizerSide: ["email", "push"],
        },
        caps: {
            perActorTargetChannelMax: {
                clientSide: {
                    clientLimits: { email: [0], push: [0] },
                    organizerLimits: { email: [0], push: [0] },
                },
                organizerSide: {
                    clientLimits: { email: [0], push: [0] },
                    organizerLimits: { email: [0], push: [0] },
                },
            },
        },
        uiHint: "twoLanes",
        defaultRelativeTo: "booking.updatedAt",
    },

    /* ──────────────────────────────
     * Si la reserva se modifica
     * Dos ramas, inmediatas.
     * ────────────────────────────── */
    "booking.updated": {
        actors: ["clientSide", "organizerSide"],
        allowedChannelsByTargetLine: {
            clientSide: ["email", "push"],
            organizerSide: ["email", "push"],
        },
        caps: {
            perActorTargetChannelMax: {
                clientSide: {
                    clientLimits: { email: [0], push: [0] },
                    organizerLimits: { email: [0], push: [0] },
                },
                organizerSide: {
                    clientLimits: { email: [0], push: [0] },
                    organizerLimits: { email: [0], push: [0] },
                },
            },
        },
        uiHint: "twoLanes",
        defaultRelativeTo: "booking.updatedAt",
    },

    /* ──────────────────────────────
     * Si la reserva se cancela
     * Dos ramas, inmediatas.
     * ────────────────────────────── */
    "booking.cancelled": {
        actors: ["clientSide", "organizerSide"],
        allowedChannelsByTargetLine: {
            clientSide: ["email", "push"],
            organizerSide: ["email", "push"],
        },
        caps: {
            perActorTargetChannelMax: {
                clientSide: {
                    clientLimits: { email: [0], push: [0] },
                    organizerLimits: { email: [0], push: [0] },
                },
                organizerSide: {
                    clientLimits: { email: [0], push: [0] },
                    organizerLimits: { email: [0], push: [0] },
                },
            },
        },
        uiHint: "twoLanes",
        defaultRelativeTo: "booking.updatedAt",
    },

    /* ──────────────────────────────
     * Recordatorios antes de la reserva
     * Única línea (system). Email/Push con 3 offsets; WhatsApp solo cliente a 24h.
     * ────────────────────────────── */
    "booking.reminder.beforeStart": {
        allowedChannelsByTargetLine: {
            clientSide: ["email", "push", "whatsapp"],
            organizerSide: ["email", "push"],
        },
        caps: {
            perActorTargetChannelMax: {
                system: {
                    clientLimits: { email: [360, 1440], push: [60, 120, 1440], whatsapp: [1440] },
                    organizerLimits: { email: [360, 1440], push: [60, 120, 1440] },
                },
            },
        },
        uiHint: "single",
        defaultRelativeTo: "booking.startAtLocal",
    },

    /* ──────────────────────────────
     * Después de que termine la reserva
     * Única rama hacia CLIENTE, inmediatas.
     * ────────────────────────────── */
    "booking.ended": {
        allowedChannelsByTargetLine: {
            clientSide: ["email", "push"],
        },
        caps: {
            perActorTargetChannelMax: {
                system: {
                    clientLimits: { email: [0], push: [0] },
                },
            },
        },
        uiHint: "single",
        defaultRelativeTo: "booking.endAtLocal",
    },

    /* ──────────────────────────────
     * No show
     * Única rama hacia CLIENTE, inmediatas.
     * ────────────────────────────── */
    "booking.noShow": {
        allowedChannelsByTargetLine: {
            clientSide: ["email", "push"],
        },
        caps: {
            perActorTargetChannelMax: {
                system: {
                    clientLimits: { email: [0], push: [0] },
                },
            },
        },
        uiHint: "single",
        defaultRelativeTo: "booking.endAtLocal",
    },
};
