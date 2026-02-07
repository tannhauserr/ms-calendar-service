import moment from "moment";
import { NotificationEvent } from "../../notification-config";
import { _downgradeReminderSchedule } from "./downgrade";


// ─────────────────────────────────────────────────────────────────────────────
// Configuración
// ─────────────────────────────────────────────────────────────────────────────

// Tolerancia para desfases de reloj/red (evita cortar por unos segundos de retraso)
const CLOCK_SKEW_SECONDS = Number(process.env.CLOCK_SKEW_SECONDS ?? 90);

// Ventana mínima antes del inicio para que un reminder aún tenga sentido
const MIN_WINDOW_MINUTES = Number(process.env.MIN_WINDOW_MINUTES ?? 10);

// Política de "smart downgrade" (SOLO para reminders):
// - Si el schedule de un reminder ya quedó atrás, intentamos rebajarlo al mayor offset que aún cabe
// - Si no quieres downgrades, pon ALLOW_REMINDER_DOWNGRADE=false
// const ALLOW_REMINDER_DOWNGRADE = String(process.env.ALLOW_REMINDER_DOWNGRADE ?? "true") === "true";
const ALLOW_REMINDER_DOWNGRADE = "true";

// Mínimo offset aceptable tras el downgrade (p.ej. no enviar si quedan < 15 minutos)
// const DOWNGRADE_MIN_OFFSET_MINUTES = Number(process.env.DOWNGRADE_MIN_OFFSET_MINUTES ?? 15);
const DOWNGRADE_MIN_OFFSET_MINUTES = 15; // por defecto 15 minutos

// NO hacer downgrade si queda menos de X minutos totales para la cita (umbral de cortesía)
// const DOWNGRADE_MIN_REMAINING_TO_ALLOW = process.env.DOWNGRADE_MIN_REMAINING_TO_ALLOW
//   ? Number(process.env.DOWNGRADE_MIN_REMAINING_TO_ALLOW)
//   : 120; // por defecto 2h
const DOWNGRADE_MIN_REMAINING_TO_ALLOW = 120; // por defecto 2h

// Buckets de offset permitidos (en minutos). Si impones bucketsOnly, el offset final debe
// coincidir con alguno de estos. Útil para UX/consistencia de producto.
// const DOWNGRADE_BUCKETS = (process.env.DOWNGRADE_BUCKETS ?? "1440,360,120,30")
const DOWNGRADE_BUCKETS = "1440,360,120,30"
    .split(",")
    .map(x => Number(x.trim()))
    .filter(n => Number.isFinite(n) && n > 0);

// Si true, el downgrade DEBE caer en uno de los buckets
const DOWNGRADE_BUCKETS_ONLY = String(process.env.DOWNGRADE_BUCKETS_ONLY ?? "true") === "true";

function toUtc(m: moment.Moment | Date | string | undefined) {
    return m ? moment.utc(m) : undefined;
}

/**
 * Filtra notificaciones basado en reglas de tiempo y tipo de evento (todo en UTC + tolerancia).
 *
 * IMPORTANTE respecto a reminders:
 * - Si el reminder está en pasado, aquí podemos proponer un "smart downgrade".
 * - Este validator NO reprograma (no cambia schedule ni dedupeKey). Solo:
 *   - Devuelve false y escribe en logs la propuesta (para que el caller reprogramE),
 *   - O, si no procede downgrade, devuelve false.
 */
// export function shouldSendNotification(
//     eventType: NotificationEvent,
//     scheduleDate: Date | string,
//     dedupeKey?: string,
//     eventCreatedAt?: Date | string
// ): boolean {


//     console.log("mira que entra de scheduleDate", scheduleDate);
//     const nowUtc = moment.utc();
//     let scheduleUtc = toUtc(scheduleDate)!; // puede ser re-asignada localmente para cálculos previos
//     const cutoffUtc = nowUtc.clone().subtract(CLOCK_SKEW_SECONDS, "seconds");

//     console.log("mira que sale de scheduleUtc", scheduleUtc);

//     // Log inicial de diagnóstico
//     console.log(`[shouldSendNotification] 🔍 Evaluando (UTC):`, {
//         eventType,
//         scheduleDate,
//         dedupeKey,
//         eventCreatedAt,
//         nowISO: nowUtc?.toISOString(),
//         scheduleMomentISO: scheduleUtc?.toISOString(),
//         skewSeconds: CLOCK_SKEW_SECONDS,
//     });

//     // ───────────────────────────────────────────────────────────────────────────
//     // TRATAMIENTO ESPECIAL: booking.reminder.beforeStart
//     // Intentamos "smart downgrade" si el schedule quedó atrás.
//     // ───────────────────────────────────────────────────────────────────────────
//     if (eventType === "booking.reminder.beforeStart") {
//         console.log(`[shouldSendNotification] 🔔 reminder.beforeStart - analizando offset`);

//         // Sin dedupeKey u offset legible → permitir (no tenemos cómo verificar)
//         const offsetMatch = dedupeKey?.match(/offset:(\d+)m$/);
//         if (!offsetMatch) {
//             console.log(
//                 `[shouldSendNotification] ${dedupeKey ? "⚠️ No se pudo extraer offset de dedupeKey" : "✅ Sin dedupeKey"
//                 } → permitir`,
//                 { dedupeKey }
//             );
//             // Aún así, validamos la ventana mínima si el schedule está en futuro.
//             // Si por casualidad el schedule ya pasó, el cron no debería estar aquí;
//             // pero dejamos el pass-through según tu política actual.
//             return true;
//         }

//         const requestedOffsetMin = parseInt(offsetMatch[1], 10);

//         // Reconstruimos startAtUtc desde schedule + offset (schedule = start - offset)
//         const startAtUtc = scheduleUtc?.clone().add(requestedOffsetMin, "minutes");

//         // Si ya estamos demasiado cerca del inicio (start - MIN_WINDOW), es tarde para un reminder
//         const minWindowStart = startAtUtc.clone().subtract(MIN_WINDOW_MINUTES, "minutes");
//         if (nowUtc.isSameOrAfter(minWindowStart)) {
//             console.log(`[shouldSendNotification] ❌ FILTRADO por ventana mínima`, {
//                 requestedOffsetMin,
//                 MIN_WINDOW_MINUTES,
//                 nowUtc: nowUtc.toISOString(),
//                 startAtUtc: startAtUtc.toISOString(),
//                 minWindowStart: minWindowStart.toISOString(),
//                 minutesToStart: startAtUtc.diff(nowUtc, "minutes"),
//             });
//             return false;
//         }

//         // Si el schedule quedó atrás del cutoff → intentamos downgrade (si está habilitado)
//         if (scheduleUtc?.isBefore(cutoffUtc)) {
//             if (!ALLOW_REMINDER_DOWNGRADE) {
//                 console.log(
//                     `[shouldSendNotification] ❌ schedule en pasado y downgrade deshabilitado → no enviar`,
//                     {
//                         scheduleUtc: scheduleUtc.toISOString(),
//                         cutoffUtc: cutoffUtc.toISOString(),
//                     }
//                 );
//                 return false;
//             }

//             const plan = _downgradeReminderSchedule(
//                 startAtUtc.toDate(),
//                 requestedOffsetMin,
//                 nowUtc.toDate(),
//                 {
//                     allowDowngrade: true,
//                     minWindowMinutes: MIN_WINDOW_MINUTES,
//                     minOffsetMinutes: DOWNGRADE_MIN_OFFSET_MINUTES,
//                     minRemainingToAllowDowngrade: DOWNGRADE_MIN_REMAINING_TO_ALLOW,
//                     allowedBuckets: DOWNGRADE_BUCKETS,
//                     bucketsOnly: DOWNGRADE_BUCKETS_ONLY,
//                 }
//             );

//             if (!plan) {
//                 console.log(
//                     `[shouldSendNotification] ❌ No cabe downgrade aceptable → no enviar`,
//                     {
//                         requestedOffsetMin,
//                         minutesUntilStart: startAtUtc.diff(nowUtc, "minutes"),
//                         policy: {
//                             MIN_WINDOW_MINUTES,
//                             DOWNGRADE_MIN_OFFSET_MINUTES,
//                             DOWNGRADE_MIN_REMAINING_TO_ALLOW,
//                             DOWNGRADE_BUCKETS,
//                             DOWNGRADE_BUCKETS_ONLY,
//                         },
//                     }
//                 );
//                 return false;
//             }

//             // Downgrade propuesto: aquí SOLO avisamos; el caller debe reprogramar y actualizar dedupeKey.
//             console.log(
//                 `[shouldSendNotification] 🔄 Propuesta de DOWNGRADE (caller debe reprogramar y actualizar dedupeKey)`,
//                 {
//                     requestedOffsetMin,
//                     proposedEffectiveOffsetMin: plan.effectiveOffsetMin,
//                     proposedNextScheduleUtc: plan.nextScheduleUtc.toISOString(),
//                     startAtUtc: startAtUtc.toISOString(),
//                 }
//             );

//             // No enviamos ahora (se reprogramará a la nueva hora propuesta)
//             return false;
//         }

//         // Si el schedule NO quedó atrás, validamos la política de offset
//         const allow =
//             requestedOffsetMin <= 360 || // ≤ 6h
//             (requestedOffsetMin > 360 && requestedOffsetMin <= 1440); // excepción: ≤ 24h

//         console.log(
//             allow
//                 ? `[shouldSendNotification] ✅ Offset permitido`
//                 : `[shouldSendNotification] 🚫 Offset > 24h → filtrar`,
//             { requestedOffsetMin, offsetHours: (requestedOffsetMin / 60).toFixed(1) }
//         );

//         return allow;
//     }

//     // ───────────────────────────────────────────────────────────────────────────
//     // Resto de eventos (NO reminders): aplicar Regla 1 al principio y cortar si está en pasado
//     // ───────────────────────────────────────────────────────────────────────────
//     if (scheduleUtc.isBefore(cutoffUtc)) {
//         console.log(`[shouldSendNotification] ❌ FILTRADO: scheduleDate < now - skew`, {
//             scheduleUtc: scheduleUtc.toISOString(),
//             nowUtc: nowUtc.toISOString(),
//             cutoffUtc: cutoffUtc.toISOString(),
//             diffMinutes: nowUtc.diff(scheduleUtc, "minutes"),
//         });
//         return false;
//     }

//     // Eventos de booking: cálculo complementario para la regla de 12h en "request.created"
//     const isBookingEvent = eventType.startsWith("booking.");
//     let hasPassedTwelveHours = false;

//     if (isBookingEvent && eventCreatedAt) {
//         const createdUtc = toUtc(eventCreatedAt)!;
//         const hoursFromCreation = nowUtc.diff(createdUtc, "hours", true); // fraccional
//         hasPassedTwelveHours = hoursFromCreation > 12;

//         console.log(`[shouldSendNotification] ⏰ Booking event (UTC)`, {
//             eventCreatedAt,
//             createdUtc: createdUtc.toISOString(),
//             hoursFromCreation: Number(hoursFromCreation.toFixed(2)),
//             hasPassedTwelveHours,
//         });
//     }

//     console.log(`[shouldSendNotification] 🎯 Reglas para: ${eventType}`);

//     switch (eventType) {
//         case "booking.request.created": {
//             // Solo durante las primeras 12h desde la creación
//             const shouldSendCreated = !hasPassedTwelveHours;
//             console.log(`[shouldSendNotification] 📝 booking.request.created`, {
//                 hasPassedTwelveHours,
//                 shouldSend: shouldSendCreated,
//             });
//             return shouldSendCreated;
//         }

//         // Estados de booking "inmediatos": si superaron Regla 1, se permiten
//         case "booking.updated":
//         case "booking.cancelled":
//         case "booking.accepted":
//         case "booking.rejected":
//         case "booking.request.accepted":
//         case "booking.request.cancelled":
//         case "booking.ended":
//         case "booking.noShow":
//             console.log(`[shouldSendNotification] ✅ ${eventType}: scheduleDate válido (UTC)`);
//             return true;

//         default:
//             // Política conservadora para tipos desconocidos: permitir si pasó la Regla 1
//             console.log(`[shouldSendNotification] ⚠️ Evento no reconocido → permitir (conservador)`);
//             return true;
//     }
// }


export function shouldSendNotification(
    eventType: NotificationEvent,
    scheduleDate: Date | string,
    dedupeKey?: string,
    eventCreatedAt?: Date | string
): boolean {
    // console.log("mira que entra de scheduleDate", scheduleDate);

    const nowUtc = moment.utc();
    let scheduleUtc = toUtc(scheduleDate)!; // puede ser re-asignada localmente para cálculos previos
    const cutoffUtc = nowUtc.clone().subtract(CLOCK_SKEW_SECONDS, "seconds");

    // console.log("mira que sale de scheduleUtc", scheduleUtc);

    // Log inicial de diagnóstico
    // console.log(`[shouldSendNotification] 🔍 Evaluando (UTC):`, {
    //     eventType,
    //     scheduleDate,
    //     dedupeKey,
    //     eventCreatedAt,
    //     nowISO: nowUtc?.toISOString(),
    //     scheduleMomentISO: scheduleUtc?.toISOString(),
    //     skewSeconds: CLOCK_SKEW_SECONDS,
    // });

    // ───────────────────────────────────────────────────────────────────────────
    // TRATAMIENTO ESPECIAL: booking.reminder.beforeStart
    // NUEVA POLÍTICA: No hay downgrade ni validación de offset.
    // Si el schedule está detrás de now (con skew), NO enviar.
    // Si estamos dentro de la ventana mínima previa al inicio, NO enviar.
    // ───────────────────────────────────────────────────────────────────────────
    if (eventType === "booking.reminder.beforeStart") {
        // console.log(`[shouldSendNotification] 🔔 reminder.beforeStart - analizando offset`);

        // 1) Si el schedule ya quedó atrás del cutoff → NO enviar
        if (scheduleUtc.isBefore(cutoffUtc)) {
            // console.log(`[shouldSendNotification] ❌ schedule en pasado → no enviar`, {
            //     scheduleUtc: scheduleUtc.toISOString(),
            //     cutoffUtc: cutoffUtc.toISOString(),
            //     diffMinutes: nowUtc.diff(scheduleUtc, "minutes"),
            // });
            return false;
        }

        // 2) Extraemos offset (si llega en la dedupeKey) solo para calcular ventana mínima
        const offsetMatch = dedupeKey?.match(/offset:(\d+)m$/);
        if (!offsetMatch) {
            // console.log(
            //     `[shouldSendNotification] ${dedupeKey ? "⚠️ No se pudo extraer offset de dedupeKey" : "✅ Sin dedupeKey"
            //     } → permitir (sin downgrade)`
            // );
            return true;
        }

        const requestedOffsetMin = parseInt(offsetMatch[1], 10);

        // startAtUtc = schedule + offset (recordatorio: schedule = start - offset)
        const startAtUtc = scheduleUtc.clone().add(requestedOffsetMin, "minutes");

        // 3) Ventana mínima previa al inicio (p.ej., no avisar si quedan < MIN_WINDOW_MINUTES)
        const minWindowStart = startAtUtc.clone().subtract(MIN_WINDOW_MINUTES, "minutes");
        if (nowUtc.isSameOrAfter(minWindowStart)) {
            // console.log(`[shouldSendNotification] ❌ FILTRADO por ventana mínima`, {
            //     requestedOffsetMin,
            //     MIN_WINDOW_MINUTES,
            //     nowUtc: nowUtc.toISOString(),
            //     startAtUtc: startAtUtc.toISOString(),
            //     minWindowStart: minWindowStart.toISOString(),
            //     minutesToStart: startAtUtc.diff(nowUtc, "minutes"),
            // });
            return false;
        }

        // 4) Si pasa todas las comprobaciones, se permite enviar
        // console.log(`[shouldSendNotification] ✅ reminder.beforeStart permitido`);
        return true;
    }

    // ───────────────────────────────────────────────────────────────────────────
    // Resto de eventos (NO reminders): aplicar Regla 1 al principio y cortar si está en pasado
    // ───────────────────────────────────────────────────────────────────────────
    if (scheduleUtc.isBefore(cutoffUtc)) {
        // console.log(`[shouldSendNotification] ❌ FILTRADO: scheduleDate < now - skew`, {
        //     scheduleUtc: scheduleUtc.toISOString(),
        //     nowUtc: nowUtc.toISOString(),
        //     cutoffUtc: cutoffUtc.toISOString(),
        //     diffMinutes: nowUtc.diff(scheduleUtc, "minutes"),
        // });
        return false;
    }

    // Eventos de booking: cálculo complementario para la regla de 12h en "request.created"
    const isBookingEvent = eventType.startsWith("booking.");
    let hasPassedTwelveHours = false;

    if (isBookingEvent && eventCreatedAt) {
        const createdUtc = toUtc(eventCreatedAt)!;
        const hoursFromCreation = nowUtc.diff(createdUtc, "hours", true); // fraccional
        hasPassedTwelveHours = hoursFromCreation > 12;

        // console.log(`[shouldSendNotification] ⏰ Booking event (UTC)`, {
        //     eventCreatedAt,
        //     createdUtc: createdUtc.toISOString(),
        //     hoursFromCreation: Number(hoursFromCreation.toFixed(2)),
        //     hasPassedTwelveHours,
        // });
    }

    // console.log(`[shouldSendNotification] 🎯 Reglas para: ${eventType}`);

    switch (eventType) {
        case "booking.request.created": {
            // Solo durante las primeras 12h desde la creación
            const shouldSendCreated = !hasPassedTwelveHours;
            // console.log(`[shouldSendNotification] 📝 booking.request.created`, {
            //     hasPassedTwelveHours,
            //     shouldSend: shouldSendCreated,
            // });
            return shouldSendCreated;
        }

        // Estados de booking "inmediatos": si superaron Regla 1, se permiten
        case "booking.updated":
        case "booking.cancelled":
        // case "booking.accepted":
        // case "booking.rejected":
        case "booking.request.accepted":
        case "booking.request.cancelled":
        case "booking.ended":
        case "booking.noShow":

            console.log(`[shouldSendNotification] ✅ ${eventType}: scheduleDate válido (UTC)`);
            return true;

        default:
            // Política conservadora para tipos desconocidos: permitir si pasó la Regla 1
            console.log(`[shouldSendNotification] ⚠️ Evento no reconocido → permitir (conservador) ${eventType}`);
            return true;
    }
}



// ─────────────────────────────────────────────────────────────────────────────
// Tipos utilitarios y helper para lotes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tipo de utilidad para validar notificaciones antes del envío
 */
export interface NotificationValidationInput {
    eventType: NotificationEvent;
    scheduleDate: Date | string;
    dedupeKey?: string;
    eventCreatedAt?: Date | string;
}

/**
 * Función helper para validar múltiples notificaciones
 * (Atajo útil en pipelines y pruebas)
 */
export function filterValidNotifications(
    notifications: NotificationValidationInput[]
): NotificationValidationInput[] {
    return notifications.filter((n) =>
        shouldSendNotification(n.eventType, n.scheduleDate, n.dedupeKey, n.eventCreatedAt)
    );
}
