import moment from "moment";
import { _downgradeReminderSchedule } from "./downgrade";

/** Opciones de coalesce */
type CoalesceOptions = {
    clockSkewSeconds: number;       // p.ej. 90
    minWindowMinutes: number;       // p.ej. 10
    allowDowngrade: boolean;
    downgradeMinOffsetMinutes: number;          // p.ej. 15
    downgradeMinRemainingToAllow?: number;      // p.ej. 120
    downgradeBuckets?: number[];                // p.ej. [1440, 360, 120, 30]
    downgradeBucketsOnly?: boolean;             // true → forzar buckets
};

/** Parser de dedupeKey: <section>:event:<eventId>:<channel>:<audience>:offset:<N><u> */
function parseDedupe(dk: string | undefined): {
    section?: string;
    eventId?: string;
    channel?: string;
    audience?: string;
    offsetMinutes?: number;
} {
    if (!dk) return {};
    const re =
        /^(?<section>[^:]+):event:(?<eventId>[^:]+):(?<channel>[^:]+):(?<audience>[^:]+):offset:(?<num>\d+)(?<unit>[mhd])?$/;
    const m = dk.match(re);
    if (!m || !m.groups) return {};
    const num = Number(m.groups.num);
    const unit = m.groups.unit || "m";
    const toMin = unit === "h" ? num * 60 : unit === "d" ? num * 1440 : num;
    return {
        section: m.groups.section,
        eventId: m.groups.eventId,
        channel: m.groups.channel,
        audience: m.groups.audience,
        offsetMinutes: toMin,
    };
}

/** Sustituye solo el offset del final por minutos (fuerza sufijo 'm') */
function replaceOffsetMinutes(dk: string | undefined, minutes: number): string | undefined {
    if (!dk) return dk;
    if (!/offset:\d+[mhd]?$/.test(dk)) return dk;
    return dk.replace(/offset:\d+[mhd]?$/, `offset:${minutes}m`);
}

/** Clave de cohorte */
function cohortKey(section: string, eventId: string, channel: string, audience: string) {
    return `${section}|${eventId}|${channel}|${audience}`;
}

/**
 * Coalescer genérico que **no cambia el tipo ni clona objetos**:
 * - Acepta y devuelve exactamente el mismo tipo T.
 * - Solo toca `notification.scheduledDate` y `notification.dedupeKey` in-place cuando aplica downgrade.
 * - Mantiene 1 reminder “mejor” por cohorte, respeta ventana mínima y política de downgrade.
 */
export function coalesceReminderBeforeStart<
    T extends {
        notification: {
            id: string;
            scheduledDate?: string | Date; // puede venir undefined (no lo rompemos)
            dedupeKey?: string;
            dataJson?: { section?: string };
        };
    }
>(
    messages: T[],
    opts: CoalesceOptions,
    now: moment.Moment = moment.utc()
): { toPublish: T[]; skipped: Array<{ id: string; reason: string }> } {
    const skipped: Array<{ id: string; reason: string }> = [];

    // Por defecto, todo pasa. Iremos eliminando índices.
    const allowed = new Set(messages.map((_, i) => i));

    const cutoff = now.clone().subtract(opts.clockSkewSeconds, "seconds");

    // Agrupamos SOLO reminders con dedupe legible y scheduledDate presente
    const groups = new Map<string, number[]>(); // key → índices en `messages`

    messages.forEach((msg, idx) => {
        const section = msg.notification?.dataJson?.section;
        if (section !== "booking.reminder.beforeStart") return;

        const sched = msg.notification.scheduledDate;
        if (!sched) return; // si no hay fecha, no coalesceamos (lo decidirá el validator luego)

        const { section: s, eventId, channel, audience, offsetMinutes } = parseDedupe(
            msg.notification.dedupeKey
        );
        if (!s || !eventId || !channel || !audience || offsetMinutes == null) return;

        const key = cohortKey(s, eventId, channel, audience);
        const group = groups.get(key) ?? [];
        group.push(idx);
        groups.set(key, group);
    });

    // Procesa cada cohorte de reminders
    for (const [key, idxs] of groups.entries()) {
        // Ordena índices por scheduledDate asc
        idxs.sort((ia, ib) => {
            const ta = moment.utc(messages[ia].notification.scheduledDate as any).valueOf();
            const tb = moment.utc(messages[ib].notification.scheduledDate as any).valueOf();
            return ta - tb;
        });

        const future: number[] = [];
        const past: number[] = [];

        for (const i of idxs) {
            const sched = moment.utc(messages[i].notification.scheduledDate as any);
            if (!sched.isValid()) {
                // Fecha inválida → que lo gestione el validador final
                continue;
            }
            if (sched.isBefore(cutoff)) past.push(i);
            else future.push(i);
        }

        const drop = (indices: number[], reason: string) => {
            for (const i of indices) {
                if (allowed.has(i)) {
                    allowed.delete(i);
                    skipped.push({ id: messages[i].notification.id, reason });
                }
            }
        };

        // Si hay futuros, elegimos el más próximo que respete ventana mínima
        if (future.length) {
            let chosen: number | undefined;
            for (const i of future) {
                const msg = messages[i];
                const { offsetMinutes } = parseDedupe(msg.notification.dedupeKey);
                if (offsetMinutes == null) { chosen = i; break; }

                const startAtUtc = moment.utc(msg.notification.scheduledDate as any).add(offsetMinutes, "minutes");
                const minWindowStart = startAtUtc.clone().subtract(opts.minWindowMinutes, "minutes");

                if (now.isBefore(minWindowStart)) { chosen = i; break; }
            }
            if (chosen != null) {
                // Todos los demás de la cohorte se descartan por “coalesced”
                const losers = idxs.filter((i) => i !== chosen);
                drop(losers, "coalesced_superseded");
                continue; // el elegido ya sigue permitido (estaba en `allowed`)
            } else {
                // Ningún futuro cumple ventana → tratar como pasados
                past.push(...future);
            }
        }

        // Solo pasados: intentar downgrade
        if (!future.length && past.length) {
            // Usamos el último pasado (el más “reciente”) como base
            const sampleIdx = past[past.length - 1];
            const sample = messages[sampleIdx];
            const parsed = parseDedupe(sample.notification.dedupeKey);

            if (parsed.offsetMinutes == null) {
                drop(idxs, "past_no_offset");
                continue;
            }

            const sched = moment.utc(sample.notification.scheduledDate as any);
            if (!sched.isValid()) {
                drop(idxs, "past_invalid_schedule");
                continue;
            }

            const startAtUtc = sched.clone().add(parsed.offsetMinutes, "minutes");
            const minWindowStart = startAtUtc.clone().subtract(opts.minWindowMinutes, "minutes");

            if (!now.isBefore(minWindowStart)) {
                drop(idxs, "past_outside_min_window");
                continue;
            }

            if (!opts.allowDowngrade) {
                drop(idxs, "past_no_downgrade_allowed");
                continue;
            }

            const plan = _downgradeReminderSchedule(
                startAtUtc.toDate(),
                parsed.offsetMinutes,
                now.toDate(),
                {
                    allowDowngrade: true,
                    minWindowMinutes: opts.minWindowMinutes,
                    minOffsetMinutes: opts.downgradeMinOffsetMinutes,
                    minRemainingToAllowDowngrade: opts.downgradeMinRemainingToAllow,
                    allowedBuckets: opts.downgradeBuckets,
                    bucketsOnly: opts.downgradeBucketsOnly,
                }
            );

            if (!plan) {
                drop(idxs, "past_no_downgrade_plan");
                continue;
            }

            // ✅ Reprogramamos IN-PLACE el propio sample (misma referencia y mismo tipo T)
            sample.notification.scheduledDate = plan.nextScheduleUtc.toISOString();
            sample.notification.dedupeKey = replaceOffsetMinutes(
                sample.notification.dedupeKey,
                plan.effectiveOffsetMin
            );

            // Drop todos los demás de la cohorte (dejamos solo el reprogramado)
            const losers = idxs.filter((i) => i !== sampleIdx);
            drop(losers, "downgraded_superseded");
            // El sampleIdx permanece en `allowed` (ya modificado in-place)
        }
    }

    // Construimos salida manteniendo exactamente el mismo tipo y referencias
    const toPublish = messages.filter((_, i) => allowed.has(i));
    return { toPublish, skipped };
}
