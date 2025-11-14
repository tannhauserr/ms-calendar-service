type DowngradeOpts = {
    allowDowngrade: boolean;        // master switch
    minWindowMinutes: number;       // p.ej. 10 (tu ventana mínima antes de start)
    minOffsetMinutes?: number;      // p.ej. 15 (no enviar si el offset efectivo < 15m)
    minRemainingToAllowDowngrade?: number; // p.ej. 120 (si faltan < 120m, NO downgrade)
    allowedBuckets?: number[];      // p.ej. [1440, 360, 120, 30] (opcional)
    bucketsOnly?: boolean;          // si true, solo acepta valores en buckets
};

export function _downgradeReminderSchedule(
    startAtUtc: Date,
    requestedOffsetMin: number,
    nowUtc: Date,
    opts: DowngradeOpts
): { nextScheduleUtc: Date; effectiveOffsetMin: number } | undefined {
    const {
        allowDowngrade,
        minWindowMinutes,
        minOffsetMinutes = 5,
        minRemainingToAllowDowngrade,
        allowedBuckets,
        bucketsOnly = false,
    } = opts;

    if (!allowDowngrade) return undefined;

    const minutesUntilStart = Math.floor((startAtUtc.getTime() - nowUtc.getTime()) / 60000);

    // ⛔ Política: no downgrade si queda menos de X tiempo total para la cita
    if (typeof minRemainingToAllowDowngrade === "number" &&
        minutesUntilStart < minRemainingToAllowDowngrade) {
        return undefined;
    }

    const maxOffsetPermitido = minutesUntilStart - minWindowMinutes;
    if (maxOffsetPermitido < minOffsetMinutes) return undefined; // ya no cabe ni lo mínimo

    // Base: el mayor offset que aún cabe
    let effective = Math.min(requestedOffsetMin, maxOffsetPermitido);

    if (allowedBuckets?.length) {
        const sorted = [...allowedBuckets].sort((a, b) => b - a);
        const bucket = sorted.find(b => b <= effective);
        if (!bucket) return undefined;            // ni el más pequeño cabe
        effective = bucket;
    } else if (bucketsOnly) {
        // Si exiges buckets pero no pasaste lista → no se puede
        return undefined;
    }

    if (effective < minOffsetMinutes) return undefined;

    return {
        nextScheduleUtc: new Date(startAtUtc.getTime() - effective * 60000),
        effectiveOffsetMin: effective,
    };
}
