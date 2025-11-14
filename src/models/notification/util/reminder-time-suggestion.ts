import moment from "moment-timezone";

export type ReminderChannel =
    | "email"
    | "whatsapp"
    | "sms"
    | "webpush"
    | "websocket";

/**
 * Devuelve la fecha ideal (UTC ISO) para enviar un recordatorio,
 * ajustando automáticamente según canal, zona horaria y hora local.
 *
 * Reglas básicas:
 *  - Evita madrugada (antes de 8h) para todos los canales.
 *  - Email: preferible entre 8h–19h.
 *  - WhatsApp/SMS: 8h–21h.
 *  - Webpush/Websocket: 7h–22h (más permisivos, porque son instantáneos).
 */
export function getSuggestedReminderTime(
    bookingStartUtc: string,
    clientTimeZone: string,
    offsetMinutes: number,
    channel: ReminderChannel
): string {
    const startLocal = moment.tz(bookingStartUtc, clientTimeZone);
    let sendLocal = startLocal.clone().subtract(offsetMinutes, "minutes");
    const hour = sendLocal.hour();

    // Definir ventanas horarias por canal
    const channelRules: Record<ReminderChannel, { min: number; max: number }> = {
        email: { min: 8, max: 19 },
        whatsapp: { min: 8, max: 21 },
        sms: { min: 8, max: 21 },
        webpush: { min: 7, max: 22 },
        websocket: { min: 7, max: 22 },
    };

    const { min, max } = channelRules[channel] ?? { min: 8, max: 21 };

    // Ajustar si cae fuera del rango permitido
    if (hour < min) {
        sendLocal = sendLocal.clone().hour(min).minute(0).second(0);
    } else if (hour >= max) {
        sendLocal = sendLocal.clone().add(1, "day").hour(min).minute(0).second(0);
    }

    // Convertir a UTC ISO string para guardar directamente
    const sendUtc = sendLocal.clone().tz("UTC").format("YYYY-MM-DDTHH:mm:ss[Z]");
    return sendUtc;
}
