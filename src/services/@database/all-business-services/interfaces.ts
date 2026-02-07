import moment from "moment";

// ────────────────────────────────────────────────────────────
// Tipos auxiliares (mínimos, inline)
// ────────────────────────────────────────────────────────────

export type DateISO = string;                 // "YYYY-MM-DD"
export type HoursMap = { [date: string]: string[][] | null }; // admite null = cerrado

export type HoursRangeInput = {
    /** "YYYY-MM-DD" (si pasas date, se usa como start=end=date) */
    date?: DateISO;
    start?: DateISO;
    end?: DateISO;
};

// Normaliza solo si viene range; si no hay range -> undefined (para devolver todo)
// export function normalizeRange(range?: HoursRangeInput): { start: DateISO; end: DateISO } | undefined {
//     if (!range) return undefined;

//     if (range.date) {
//         const d = moment(range.date, "YYYY-MM-DD", true);
//         if (d.isValid()) {
//             const iso = d.format("YYYY-MM-DD");
//             return { start: iso, end: iso };
//         }
//         return undefined;
//     }

//     if (!range.start || !range.end) return undefined;

//     const s = moment(range.start, "YYYY-MM-DD", true);
//     const e = moment(range.end, "YYYY-MM-DD", true);
//     if (!s.isValid() || !e.isValid() || e.isBefore(s, "day")) return undefined;

//     return { start: s.format("YYYY-MM-DD"), end: e.format("YYYY-MM-DD") };
// }

// Normaliza solo si viene range.
// Si no hay range -> undefined (para devolver todo)
// Si autoDefaultIfMissing = true y no viene range -> [ayer, +32 días]
export function normalizeRange(
    range?: HoursRangeInput,
    autoDefaultIfMissing: boolean = false
): { start: DateISO; end: DateISO } | undefined {
    // 1) No llega rango
    if (!range) {
        if (!autoDefaultIfMissing) {
            return undefined;
        }

        // Rango automático: ayer hasta dentro de 32 días
        const start = moment().subtract(1, "day").format("YYYY-MM-DD"); // ayer
        const end = moment().add(32, "day").format("YYYY-MM-DD");      // +32 días
        return { start, end };
    }

    // 2) Caso range.date (un solo día)
    if (range.date) {
        const d = moment(range.date, "YYYY-MM-DD", true);
        if (d.isValid()) {
            const iso = d.format("YYYY-MM-DD");
            return { start: iso, end: iso };
        }
        return undefined;
    }

    // 3) Caso start/end
    if (!range.start || !range.end) return undefined;

    const s = moment(range.start, "YYYY-MM-DD", true);
    const e = moment(range.end, "YYYY-MM-DD", true);

    if (!s.isValid() || !e.isValid() || e.isBefore(s, "day")) {
        return undefined;
    }

    return {
        start: s.format("YYYY-MM-DD"),
        end: e.format("YYYY-MM-DD"),
    };
}


export function listDaysInclusive(startISO: DateISO, endISO: DateISO): DateISO[] {
    const out: DateISO[] = [];
    let cur = moment(startISO, "YYYY-MM-DD");
    const end = moment(endISO, "YYYY-MM-DD");
    while (!cur.isAfter(end, "day")) {
        out.push(cur.format("YYYY-MM-DD"));
        cur = cur.add(1, "day");
    }
    return out;
}

export const WEEKDAY_NAMES = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const;
export type WeekdayName = typeof WEEKDAY_NAMES[number];
export type WorkerHoursMapType = {
    [userId: string]: {
        [weekday: string]: string[][] | null; // 'MONDAY': [['10:00','13:00'], ...] | null (cerrado)
    };
};

export function weekdayNameFromISO(dateISO: DateISO): WeekdayName {
    const d = moment(dateISO, "YYYY-MM-DD");
    return WEEKDAY_NAMES[d.day()];
}

export function isWithin(dateStr: DateISO, startISO: DateISO, endISO: DateISO): boolean {
    const d = moment(dateStr, "YYYY-MM-DD", true);
    return d.isValid() && d.isSameOrAfter(startISO, "day") && d.isSameOrBefore(endISO, "day");
}