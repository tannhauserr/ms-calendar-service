

// src/notifications/helpers/simple-build.ts
import { randomUUID } from "crypto";
import { StoreNotificationCreatedV1 } from "../../../services/@rabbitmq/interfaces/notification/store-notification";
import { CONSOLE_COLOR } from "../../../constant/console-color";

const mapChannel = (
    ch: string
): "email" | "whatsapp" | "sms" | "webpush" | "websocket" =>
    ch === "push" ? "webpush" : (ch as any);

export type BookingSnap = {
    id: string;
    createdAt: string;        // ISO
    updatedAt?: string;       // ISO
    startAtLocal?: string;    // ISO
    endAtLocal?: string;      // ISO
    client?: { id: string; email?: string; phoneE164?: string };
    business?: { id: string; email?: string; phoneE164?: string };
    idService: string;
    idGroup?: string;
};

type Policy = {
    type?: "offset";
    value?: number;          // magnitud
    unit?: "minutes" | "hours" | "days";
    relativeTo?:
    | "booking.createdAt"
    | "booking.updatedAt"
    | "booking.startAtLocal"
    | "booking.endAtLocal";
};

// // ─────────────────────────────────────────────────────────────────────────────
// // Time helpers (UTC-only)
// // ─────────────────────────────────────────────────────────────────────────────
// function unitToMs(unit: Policy["unit"]): number {
//     switch (unit) {
//         case "hours": return 60 * 60 * 1000;
//         case "days": return 24 * 60 * 60 * 1000;
//         case "minutes":
//         default: return 60 * 1000;
//     }
// }

// ─────────────────────────────────────────────────────────────────────────────
// Debug helpers
// ─────────────────────────────────────────────────────────────────────────────


/** 
 * Devuelve una cadena ISO legible para logs.
 * - Si no hay valor → "∅".
 * - Si la fecha es inválida → "InvalidDate(<raw>)".
 * - Si es válida → date.toISOString().
 */
function fmt(d?: Date | string | null) {
    if (!d) return "∅";
    const date = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(date.getTime())) return `InvalidDate(${String(d)})`;
    return date.toISOString();
}

/**
 * Diferencia en minutos entre dos fechas (a - b), redondeada al entero más cercano.
 * Útil para logs de deltas: positivo si 'a' es posterior a 'b', negativo si es anterior.
 */
function diffMin(a: Date, b: Date) {
    return Math.round((a.getTime() - b.getTime()) / 60000);
}

/**
 * Lanza un error si la fecha 'd' no es válida (NaN).
 * Incluye una etiqueta 'label' y el valor crudo 'raw' para facilitar el debug.
 */
function assertValidDate(label: string, d: Date, raw: string | Date) {
    if (Number.isNaN(d.getTime())) {
        throw new Error(`[computeWhen] ${label} es inválida: ${String(raw)}`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Time helpers (igual que antes)
// ─────────────────────────────────────────────────────────────────────────────
function unitToMs(unit: Policy["unit"]): number {
    switch (unit) {
        case "hours": return 60 * 60 * 1000;
        case "days": return 24 * 60 * 60 * 1000;
        case "minutes":
        default: return 60 * 1000;
    }
}


// /**
//  * Calcula la fecha programada en UTC. Si la política es "antes de" y el resultado
//  * cayó en el pasado, lo "clampeamos" a ahora para que el cron lo recoja.
//  * Logs planos si NOTIF_DEBUG_TIME=1.
//  */
// function computeWhen(policy: Policy | undefined, b: BookingSnap, timeZoneWorkspace: string): string | undefined {
//     if (!policy) {
//         console.warn("[computeWhen] policy=undefined → scheduledDate=undefined");
//         return undefined;
//     }

//     console.log("mira quye es b.startAtLocal", b?.startAtLocal);
//     console.log("mira quye es b.startAtLocal", b?.startAtLocal);
//     console.log("mira quye es b.startAtLocal", b?.startAtLocal);
//     console.log("mira quye es b.startAtLocal", b?.startAtLocal);
//     console.log("mira quye es b.startAtLocal", b?.startAtLocal);
//     console.log("mira quye es b.startAtLocal", b?.startAtLocal);


//     const { relativeTo, unit = "minutes" } = policy;
//     const value = Number(policy.value ?? 0);

//     const refIso =
//         relativeTo === "booking.updatedAt" ? b.updatedAt
//             : relativeTo === "booking.startAtLocal" ? b.startAtLocal
//                 : relativeTo === "booking.endAtLocal" ? b.endAtLocal
//                     : b.createdAt;

//     if (!refIso) {
//         console.warn(`[computeWhen] refIso=undefined (relativeTo=${relativeTo}) → scheduledDate=undefined`);
//         return undefined;
//     }

//     const now = new Date();
//     const base = new Date(refIso);
//     assertValidDate("base", base, refIso);

//     const mult = unitToMs(unit);
//     const delta = value * mult;

//     const isBefore =
//         relativeTo === "booking.startAtLocal" ||
//         relativeTo === "booking.endAtLocal";

//     const whenUtc = new Date(base.getTime() + (isBefore ? -delta : delta));
//     assertValidDate("whenUtc", whenUtc, whenUtc);

//     // Clampeo si es "antes de" y ya ha pasado
//     const clamped = isBefore
//         ? new Date(Math.max(whenUtc.getTime(), now.getTime()))
//         : whenUtc;



//     const mins_base_minus_now = diffMin(base, now);
//     const mins_when_minus_now = diffMin(whenUtc, now);
//     const mins_sched_minus_now = diffMin(clamped, now);

//     // Resumen en una línea
//     console.log(
//         `[computeWhen] rel=${relativeTo ?? "createdAt*"} value=${value} ${unit} ` +
//         `ref=${fmt(base)} when=${fmt(whenUtc)} scheduled=${fmt(clamped)} ` +
//         `(Δwhen-now=${mins_when_minus_now}m)`
//     );

//     // Detalle plano
//     console.log(`[computeWhen] inputs: bookingId=${b.id} createdAt=${fmt(b.createdAt)} updatedAt=${fmt(b.updatedAt)} startAtLocal=${fmt(b.startAtLocal)} endAtLocal=${fmt(b.endAtLocal)}`);
//     console.log(`[computeWhen] derived: now=${fmt(now)} base-now=${mins_base_minus_now}m isBefore=${isBefore} deltaMs=${delta}`);
//     console.log(`[computeWhen] output: scheduled-now=${mins_sched_minus_now}m`);


//     return clamped.toISOString();
// }


/**
 * Convierte una fecha "naïve" (sin Z ni ±HH:MM) que representa hora local en un TZ IANA
 * a su instante UTC. Maneja DST con la técnica de Intl.DateTimeFormat.
 */
function zonedNaiveIsoToUtc(refIsoNaive: string, timeZone: string): Date {
    // Parse ISO parcial (YYYY-MM-DDTHH:mm[:ss[.SSS]])
    const m = refIsoNaive.match(
        /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/
    );
    if (!m) {
        throw new Error(`[zonedNaiveIsoToUtc] Formato no soportado: ${refIsoNaive}`);
    }
    const [_, y, mo, d, h, mi, s = "0", ms = "0"] = m;
    const yN = Number(y);
    const moN = Number(mo) - 1;
    const dN = Number(d);
    const hN = Number(h);
    const miN = Number(mi);
    const sN = Number(s);
    const msN = Number(ms.padEnd(3, "0"));

    // Primer intento: construir un UTC "con las mismas partes"
    let utcGuess = Date.UTC(yN, moN, dN, hN, miN, sN, msN);

    // Offset de ese instante en el TZ dado
    const getTzOffsetMinutes = (ts: number) => {
        const dtf = new Intl.DateTimeFormat("en-US", {
            timeZone,
            hour12: false,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
        const parts = dtf.formatToParts(new Date(ts));
        const map: Record<string, string> = {};
        for (const p of parts) map[p.type] = p.value;
        // Construimos la "misma" fecha/hora pero interpretada como UTC
        const asUtcTs = Date.UTC(
            Number(map.year),
            Number(map.month) - 1,
            Number(map.day),
            Number(map.hour),
            Number(map.minute),
            Number(map.second)
        );
        // Diferencia (asUtc - ts) nos da el offset en ms (signo correcto)
        return (asUtcTs - ts) / 60000;
    };

    const off1 = getTzOffsetMinutes(utcGuess);
    let utcFinal = utcGuess - off1 * 60000;

    // Segunda pasada por si cae en frontera de DST
    const off2 = getTzOffsetMinutes(utcFinal);
    if (off2 !== off1) {
        utcFinal = utcGuess - off2 * 60000;
    }

    return new Date(utcFinal);
}

function hasExplicitZone(iso: string): boolean {
    return /[zZ]|[+\-]\d{2}:\d{2}$/.test(iso);
}

// /**
//  * Calcula la fecha programada en UTC. Si la política es "antes de" y el resultado
//  * cayó en el pasado, solo clampa si está dentro de una ventana de gracia corta.
//  * Si no, se hace skip (undefined) para evitar disparos de citas ya pasadas.
//  * Logs planos si NOTIF_DEBUG_TIME=1.
//  */
// function computeWhen(
//     policy: Policy | undefined,
//     b: BookingSnap,
//     timeZoneStaff: string,
//     timeZoneParticipant: string
// ): string | undefined {
//     if (!policy) {
//         console.warn("[computeWhen] policy=undefined → scheduledDate=undefined");
//         return undefined;
//     }

//     const GRACE_MINUTES =
//         Number(process.env.NOTIF_GRACE_MINUTES ?? 3) || 3; // ventana de gracia
//     const GRACE_MS = GRACE_MINUTES * 60_000;

//     const { relativeTo, unit = "minutes" } = policy;
//     const value = Number(policy.value ?? 0);

//     let refIso =
//         relativeTo === "booking.updatedAt"
//             ? b.updatedAt
//             : relativeTo === "booking.startAtLocal"
//                 ? b.startAtLocal
//                 : relativeTo === "booking.endAtLocal"
//                     ? b.endAtLocal
//                     : b.createdAt;

//     if (!refIso) {
//         console.warn(
//             `[computeWhen] refIso=undefined (relativeTo=${relativeTo}) → scheduledDate=undefined`
//         );
//         return undefined;
//     }

//     const isEventRelative =
//         relativeTo === "booking.startAtLocal" ||
//         relativeTo === "booking.endAtLocal";

//     // Resolver zona: si el campo es "local" y viene sin Z/±HH:MM, interpretarlo en el TZ del workspace
//     let base: Date;
//     if (typeof refIso === "string" && !hasExplicitZone(refIso) && isEventRelative) {
//         if (!timeZoneStaff) {
//             throw new Error(
//                 `[computeWhen] ${relativeTo} es "local" pero "${refIso}" no trae zona y falta timeZoneWorkspace`
//             );
//         }
//         base = zonedNaiveIsoToUtc(refIso, timeZoneStaff);
//     } else {
//         base = new Date(refIso); // ya con zona explícita o no es "local"
//     }
//     assertValidDate("base", base, refIso);

//     const now = new Date();
//     const mult = unitToMs(unit);
//     const delta = value * mult;

//     // Semántica actual: para start/end consideramos "antes de" (resta el delta)
//     const whenUtc = new Date(base.getTime() + (isEventRelative ? -delta : +delta));
//     assertValidDate("whenUtc", whenUtc, whenUtc);

//     let scheduled: Date | undefined;

//     if (isEventRelative) {
//         // Si el target está en el pasado, decidir clamp o skip según gracia
//         if (whenUtc.getTime() < now.getTime()) {
//             const pastByMs = now.getTime() - whenUtc.getTime();
//             if (pastByMs <= GRACE_MS) {
//                 scheduled = now; // pequeño retraso tolerado
//                 console.log(
//                     `[computeWhen] past target within grace → clamp to now (pastBy=${Math.round(
//                         pastByMs / 60000
//                     )}m, grace=${GRACE_MINUTES}m)`
//                 );
//             } else {
//                 console.log(
//                     `[computeWhen] skip: event-relative time in past beyond grace (pastBy=${Math.round(
//                         pastByMs / 60000
//                     )}m, grace=${GRACE_MINUTES}m)`
//                 );
//                 return undefined; // <- clave: no disparamos recordatorios de citas en pasado
//             }
//         } else {
//             scheduled = whenUtc; // futuro OK
//         }
//     } else {
//         // createdAt/updatedAt: mantener comportamiento de clamp para jobs atrasados
//         scheduled =
//             whenUtc.getTime() < now.getTime() ? now : whenUtc;
//     }

//     // Logs de diagnóstico
//     const mins_base_minus_now = diffMin(base, now);
//     const mins_when_minus_now = diffMin(whenUtc, now);
//     const mins_sched_minus_now = diffMin(scheduled, now);

//     console.log(
//         `[computeWhen] rel=${relativeTo ?? "createdAt*"} value=${value} ${unit} ` +
//         `ref=${fmt(base)} when=${fmt(whenUtc)} scheduled=${fmt(scheduled)} ` +
//         `(Δwhen-now=${mins_when_minus_now}m)`
//     );
//     console.log(
//         `[computeWhen] inputs: bookingId=${b.id} createdAt=${fmt(
//             b.createdAt
//         )} updatedAt=${fmt(b.updatedAt)} startAtLocal=${fmt(
//             b.startAtLocal
//         )} endAtLocal=${fmt(b.endAtLocal)}`
//     );
//     console.log(
//         `[computeWhen] derived: now=${fmt(
//             now
//         )} base-now=${mins_base_minus_now}m isEventRelative=${isEventRelative} deltaMs=${delta} grace=${GRACE_MINUTES}m`
//     );
//     console.log(
//         `[computeWhen] output: scheduled-now=${mins_sched_minus_now}m`
//     );

//     return scheduled.toISOString();
// }


// /**
//  * Calcula la fecha programada en UTC. No usa TZ del negocio:
//  * - Interpreta fechas "locales" en el TZ del receptor: participant (cliente) y, si no hay, staff (usuario).
//  * - Para start/end: si cae en el pasado, clampa sólo dentro de una "gracia" corta; si no, skip (undefined).
//  * - Para createdAt/updatedAt: clampa a "now" si quedó atrás (jobs retrasados).
//  *
//  * @param policy               Política (offset simple).
//  * @param b                    BookingSnap (si añades startAtUtc/endAtUtc, se priorizan).
//  * @param timeZoneStaff        IANA del staff/usuario receptor (p.ej. "Europe/Madrid").
//  * @param timeZoneParticipant  IANA del cliente/participante receptor.
//  */
// function computeWhen(
//     policy: Policy | undefined,
//     b: BookingSnap & { startAtUtc?: string; endAtUtc?: string },
//     timeZoneStaff: string,
//     timeZoneParticipant: string
// ): string | undefined {
//     if (!policy) {
//         console.warn("[computeWhen] policy=undefined → scheduledDate=undefined");
//         return undefined;
//     }

//     const GRACE_MINUTES = Number(process.env.NOTIF_GRACE_MINUTES ?? 3) || 3;
//     const GRACE_MS = GRACE_MINUTES * 60_000;

//     const { relativeTo, unit = "minutes" } = policy;
//     const value = Number(policy.value ?? 0);

//     // 1) Elige la referencia de tiempo
//     let referenceISO =
//         relativeTo === "booking.updatedAt" ? b.updatedAt
//             : relativeTo === "booking.startAtLocal" ? (b.startAtUtc ?? b.startAtLocal)
//                 : relativeTo === "booking.endAtLocal" ? (b.endAtUtc ?? b.endAtLocal)
//                     : b.createdAt;

//     if (!referenceISO) {
//         console.warn(`[computeWhen] refIso=undefined (relativeTo=${relativeTo}) → scheduledDate=undefined`);
//         return undefined;
//     }

//     const isEventRelative =
//         relativeTo === "booking.startAtLocal" ||
//         relativeTo === "booking.endAtLocal";

//     // 2) Resolver base (UTC) con la zona del receptor cuando haga falta
//     let base: Date;
//     if (isEventRelative) {
//         // Si ya hay UTC explícito, úsalo
//         if (relativeTo === "booking.startAtLocal" && b.startAtUtc) {
//             base = new Date(b.startAtUtc);
//         } else if (relativeTo === "booking.endAtLocal" && b.endAtUtc) {
//             base = new Date(b.endAtUtc);
//         } else if (typeof referenceISO === "string" && !hasExplicitZone(referenceISO)) {
//             // Naïve → interpretar con TZ del receptor (participant primero, si no staff)
//             const tzReceiver = timeZoneParticipant || timeZoneStaff;
//             if (!tzReceiver) {
//                 throw new Error(
//                     `[computeWhen] ${relativeTo} viene sin zona ("${referenceISO}") y no hay TZ del receptor (participant/staff)`
//                 );
//             }
//             base = zonedNaiveIsoToUtc(referenceISO, tzReceiver);
//         } else {
//             // Ya viene con Z/±HH:MM (o Date)
//             base = new Date(referenceISO as any);
//         }
//     } else {
//         // createdAt/updatedAt: normalmente ya con Z; si no, se interpreta tal cual
//         base = new Date(referenceISO as any);
//     }

//     assertValidDate("base", base, referenceISO);

//     // 3) Aplicar offset
//     const mult = unitToMs(unit);
//     const delta = value * mult;

//     const whenUtc = new Date(base.getTime() + (isEventRelative ? -delta : +delta));
//     assertValidDate("whenUtc", whenUtc, whenUtc);

//     // 4) Clamp/skip según tipo
//     const now = new Date();
//     let scheduled: Date | undefined;

//     if (isEventRelative) {
//         if (whenUtc.getTime() < now.getTime()) {
//             const pastByMs = now.getTime() - whenUtc.getTime();
//             if (pastByMs <= GRACE_MS) {
//                 scheduled = now; // pequeño retraso tolerable
//                 console.log(
//                     `[computeWhen] past target within grace → clamp to now (pastBy=${Math.round(
//                         pastByMs / 60000
//                     )}m, grace=${GRACE_MINUTES}m)`
//                 );
//             } else {
//                 console.log(
//                     `[computeWhen] skip: event-relative time in past beyond grace (pastBy=${Math.round(
//                         pastByMs / 60000
//                     )}m, grace=${GRACE_MINUTES}m)`
//                 );
//                 return undefined; // no dispares recordatorios de citas ya pasadas
//             }
//         } else {
//             scheduled = whenUtc; // futuro OK
//         }
//     } else {
//         // createdAt/updatedAt: clamp a now si quedó atrás
//         scheduled = whenUtc.getTime() < now.getTime() ? now : whenUtc;
//     }

//     // 5) Logs
//     const mins_base_minus_now = diffMin(base, now);
//     const mins_when_minus_now = diffMin(whenUtc, now);
//     const mins_sched_minus_now = diffMin(scheduled, now);

//     console.log(
//         `[computeWhen] rel=${relativeTo ?? "createdAt*"} value=${value} ${unit} ` +
//         `ref=${fmt(base)} when=${fmt(whenUtc)} scheduled=${fmt(scheduled)} ` +
//         `(Δwhen-now=${mins_when_minus_now}m)`
//     );
//     console.log(
//         `[computeWhen] inputs: bookingId=${b.id} createdAt=${fmt(
//             b.createdAt
//         )} updatedAt=${fmt(b.updatedAt)} startAtLocal=${fmt(
//             b.startAtLocal
//         )} endAtLocal=${fmt(b.endAtLocal)}`
//     );
//     console.log(
//         `[computeWhen] derived: now=${fmt(
//             now
//         )} base-now=${mins_base_minus_now}m isEventRelative=${isEventRelative} deltaMs=${delta} grace=${GRACE_MINUTES}m`
//     );
//     console.log(`[computeWhen] output: scheduled-now=${mins_sched_minus_now}m`);

//     return scheduled.toISOString();
// }


/**
 * computeWhen (versión pura):
 * - No decide políticas (ni gracia ni skip).
 * - Solo: resuelve TZ del receptor, valida la fecha base y aplica el offset.
 * - Devuelve SIEMPRE un ISO (salvo errores de entrada).
 */
function computeWhen(
    policy: Policy | undefined,
    b: BookingSnap & { startAtUtc?: string; endAtUtc?: string },
    timeZoneStaff: string,
    timeZoneParticipant: string
): string | undefined {
    if (!policy) {
        console.warn("[computeWhen] policy=undefined → scheduledDate=undefined");
        return undefined;
    }

    const { relativeTo, unit = "minutes" } = policy;
    const value = Number(policy.value ?? 0);

    // 1) Referencia
    let referenceISO =
        relativeTo === "booking.updatedAt" ? b.updatedAt
            : relativeTo === "booking.startAtLocal" ? (b.startAtUtc ?? b.startAtLocal)
                : relativeTo === "booking.endAtLocal" ? (b.endAtUtc ?? b.endAtLocal)
                    : b.createdAt;

    if (!referenceISO) {
        console.warn(`[computeWhen] refIso=undefined (relativeTo=${relativeTo}) → scheduledDate=undefined`);
        return undefined;
    }

    const isEventRelative =
        relativeTo === "booking.startAtLocal" || relativeTo === "booking.endAtLocal";

    // 2) Base UTC (resolviendo zona cuando haga falta)
    let base: Date;
    if (isEventRelative) {
        if (relativeTo === "booking.startAtLocal" && b.startAtUtc) {
            base = new Date(b.startAtUtc);
        } else if (relativeTo === "booking.endAtLocal" && b.endAtUtc) {
            base = new Date(b.endAtUtc);
        } else if (typeof referenceISO === "string" && !hasExplicitZone(referenceISO)) {
            const tzReceiver = timeZoneParticipant || timeZoneStaff;
            if (!tzReceiver) {
                throw new Error(`[computeWhen] ${relativeTo} viene sin zona ("${referenceISO}") y falta TZ receptor`);
            }
            base = zonedNaiveIsoToUtc(referenceISO, tzReceiver);
        } else {
            base = new Date(referenceISO as any);
        }
    } else {
        base = new Date(referenceISO as any);
    }

    assertValidDate("base", base, referenceISO);

    // 3) Offset
    const mult = unitToMs(unit);
    const delta = value * mult;
    const whenUtc = new Date(base.getTime() + (isEventRelative ? -delta : +delta));
    assertValidDate("whenUtc", whenUtc, whenUtc);

    // 4) Logs (solo diagnóstico; sin políticas)
    const now = new Date();
    console.log(
        `[computeWhen] rel=${relativeTo ?? "createdAt*"} value=${value} ${unit} ` +
        `ref=${fmt(base)} when=${fmt(whenUtc)} (Δwhen-now=${diffMin(whenUtc, now)}m)`
    );

    return whenUtc.toISOString();
}


// ─────────────────────────────────────────────────────────────────────────────
// Resolve "to" por audiencia y canal
// ─────────────────────────────────────────────────────────────────────────────
function resolveTo(
    audience: "client" | "business",
    channel: string,
    b: BookingSnap
) {
    const who = audience === "client" ? b.client : b.business;
    if (!who) return undefined;
    const ch = mapChannel(channel);

    if (ch === "email" && who.email) return { email: who.email };
    if ((ch === "whatsapp" || ch === "sms") && who.phoneE164) return { phoneE164: who.phoneE164 };
    if (ch === "webpush") return { subscriptionId: "1234_subscriptionId_inventado" }; // TODO: sustituir por real
    if (ch === "websocket") return {}; // si tu layer lo resuelve por audienceRef

    return undefined;
}


/**
 * Devuelve un objeto con las variables esperadas por cada templateKey,
 * con valores vacíos ("") para rellenar dinámicamente.
 */
export function buildEmptyTemplateData(templateKey: string): Record<string, string> {
    const VARS_BY_KEY: Record<string, string[]> = {
        "booking.request.created": [
            "clientName", "bookingServiceName", "bookingStartDate",
            "userName", "bookingDuration", "bookingPrice",
            "workspaceName", "workspaceAddress", "viewBookingUrl"
        ],
        "booking.request.accepted": [
            "clientName", "bookingServiceName", "bookingStartDate",
            "userName", "workspaceName", "workspaceAddress",
            "manageBookingUrl", "addToCalendarUrl"
        ],
        "booking.request.cancelled": [
            "clientName", "bookingServiceName", "bookingStartDate",
            "manageBookingUrl"
        ],
        "booking.updated": [
            "clientName", "bookingServiceName", "bookingStartDate",
            "userName", "bookingDuration", "manageBookingUrl"
        ],
        "booking.cancelled": [
            "clientName", "bookingServiceName", "bookingStartDate",
            "manageBookingUrl"
        ],
        "booking.reminder.beforeStart": [
            "clientName", "bookingServiceName", "bookingStartDate",
            "workspaceName", "workspaceAddress", "workspacePhone",
            "addToCalendarUrl"
        ],
        "booking.ended": [
            "clientName", "workspaceName", "manageBookingUrl"
        ],
        "booking.noShow": [
            "clientName", "bookingServiceName", "bookingStartDate",
            "rescheduleUrl"
        ],
        "auth.resetPassword": [
            "resetUrl"
        ],
        "auth.verifyEmail": [
            "verifyUrl"
        ],
    };

    const vars = VARS_BY_KEY[templateKey] || [];
    const out: Record<string, string> = {};
    for (const v of vars) out[v] = "";
    return out;
}


// ─────────────────────────────────────────────────────────────────────────────
// Builder
// ─────────────────────────────────────────────────────────────────────────────
export function buildFromSections(params: {
    workspaceId?: string;
    timeZoneStaff: string;
    timeZoneParticipant: string;
    companyId?: string;
    booking: BookingSnap;
    notificationConfig: { sections?: any[] };
    sectionsToTrigger: string[];
    /** Si true, crea la noti aunque no haya "to" (útil si vas a resolver destino en otro paso). */
    createEvenIfNoTo?: boolean;
}): StoreNotificationCreatedV1[] {
    const {
        workspaceId, timeZoneStaff, timeZoneParticipant, companyId, booking,
        notificationConfig, sectionsToTrigger,
        createEvenIfNoTo = false,
    } = params;

    const sections = (notificationConfig?.sections ?? []).filter(
        (s: any) => s?.enabled && sectionsToTrigger.includes(s.id)
    );

    const out: StoreNotificationCreatedV1[] = [];
    for (const s of sections) {
        const actions = s?.groups?.flatMap((g: any) => g?.actions ?? []) ?? [];

        for (const a of actions) {
            if (!a?.enabled) continue;

            const ch = mapChannel(a.channel);
            const audience = (a.audience ?? a.targetAudience) as "client" | "business";

            // Destino material: si falta, registramos motivo
            const to = resolveTo(audience, ch, booking);


            if (sectionsToTrigger?.includes("booking.reminder.beforeStart") && ch === "whatsapp") {
                console.log("mira action:", a);
                // console.log("WHATSAPP: mira to", to);
                // console.log("WHATSAPP: mira booking", booking);
                // console.log("WHATSAPP: mira audience", audience);
                // console.log("WHATSAPP: mira channel", ch);
            }

            if (!to && !createEvenIfNoTo) {
                console.log(
                    `${CONSOLE_COLOR.FgYellow}[simple-build][skip] Falta destino para acción ${a.id} / channel=${ch} / audience=${audience}. ` +
                    `Necesitas ${ch === "email" ? "email" : (ch === "whatsapp" || ch === "sms") ? "phoneE164" : "subscriptionId"} en ` +
                    `${audience}. ${CONSOLE_COLOR.Reset}`
                );
                continue;
            }

            // 🔧 audienceRef correcto según la audiencia
            const audienceRef =
                audience === "client"
                    ? booking.client?.id
                    : booking.business?.id;

            if (!audienceRef) {
                console.log(
                    `${CONSOLE_COLOR.FgYellow}[simple-build][skip] No hay audienceRef para ${audience} en acción ${a.id}.${CONSOLE_COLOR.Reset}`
                );
                if (!createEvenIfNoTo) continue;
            }

            // Programación
            const scheduledDate = computeWhen(
                a.policy as Policy,
                booking,
                timeZoneStaff,
                timeZoneParticipant
            );


            console.log("Mira aqui el scheduledDate:", scheduledDate);
            console.log("Mira aqui el offset:", a.policy?.value, a.policy?.unit);
            console.log("Mira aqui cuando empieza el evento:", booking.startAtLocal);

            // Dedupe
            const idBooking = booking?.idGroup ? `booking:${booking.idGroup}` : `booking:${booking.id}`;
            const offset = `offset:${a.policy?.value ?? 0}${a.policy?.unit?.charAt(0) ?? "m"}`;
            const dedupeKey = `${s.id}:${idBooking}:${ch}:${audience}:${offset}`;
            const templateKey = `${s.id}_${audience}`;

            // KIND fijo: booking
            const kind = "booking" as const;

            out.push({
                v: 1,
                notification: {
                    id: randomUUID(),
                    workspaceId,
                    companyId,
                    eventId: booking?.id,
                    kind,
                    audienceType: audience === "client" ? "CLIENT" : "USER",
                    audienceRef: audienceRef ?? undefined,

                    channel: ch,
                    to: to ?? undefined,

                    status: "pending",
                    priority: 5,
                    scheduledDate,
                    dedupeKey,
                    templateKey,

                    dataJson: {
                        idGroup: booking?.idGroup ? booking.idGroup : undefined,
                        idEvent: booking?.idGroup ? undefined : booking.id,
                        startEvent: booking.startAtLocal,
                        endEvent: booking.endAtLocal,
                        idClient: booking.client?.id,
                        idUser: booking.business?.id,
                        section: s.id,
                        // idGroup: booking.idGroup,
                        idWorkspace: workspaceId,
                        idBookingPage: "add it",
                        // value: [
                        //     {
                        //         idUser: booking.business?.id,
                        //         idService: booking.idService,
                        //     }
                        // ]

                    },

                    render: {
                        language: (a.language as string) ?? "es",
                        templateKey,
                        templateData: buildEmptyTemplateData(templateKey),
                    },
                },
                trace: { correlationId: randomUUID(), producedAt: new Date().toISOString() },
            });
        }
    }

    // Resumen de diagnóstico
    console.log(
        `${CONSOLE_COLOR.FgCyan}[simple-build] Generadas ${out.length} notificaciones ` +
        `a partir de ${sections.length} sección(es).${CONSOLE_COLOR.Reset}`
    );

    return out;
}
