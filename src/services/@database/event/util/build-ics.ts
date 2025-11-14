// Tipado mínimo
export type IcsMeta = {
    uid: string;                 // único y estable, p.ej. `${event.id}@reserflow`
    summary: string;             // título
    startUtc: string | Date;     // ISO o Date (UTC)
    endUtc?: string | Date | null;
    allDay?: boolean;
    description?: string;
    location?: string;
    url?: string;
    organizer?: { name?: string; email: string };
    status?: "CONFIRMED" | "CANCELLED" | "TENTATIVE";
    createdUtc?: string | Date;
    lastModifiedUtc?: string | Date;
    sequence?: number;           // 0,1,2… si re-publicas cambios
};

// ──────────────────────────────────────────────────────────────────────────
// Helpers súper mínimos
function pad(n: number) { return n < 10 ? "0" + n : String(n); }

function toUtc(v: string | Date): string {
    const d = (v instanceof Date) ? v : new Date(v);
    // YYYYMMDDTHHMMSSZ
    return (
        d.getUTCFullYear().toString() +
        pad(d.getUTCMonth() + 1) +
        pad(d.getUTCDate()) + "T" +
        pad(d.getUTCHours()) +
        pad(d.getUTCMinutes()) +
        pad(d.getUTCSeconds()) + "Z"
    );
}

function toDateVal(v: string | Date): string {
    const d = (v instanceof Date) ? v : new Date(v);
    // YYYYMMDD (sin hora)
    return d.getUTCFullYear().toString() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate());
}

function escapeText(s: string) {
    return s
        .replace(/\\/g, "\\\\")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,")
        .replace(/\r?\n/g, "\\n");
}

// iCalendar recomienda plegar líneas >75 octetos; aquí lo dejamos simple (opcional)
function foldLine(line: string): string {
    const max = 75;
    if (line.length <= max) return line;
    let out = "";
    for (let i = 0; i < line.length; i += max) {
        out += (i === 0 ? "" : "\r\n ") + line.slice(i, i + max);
    }
    return out;
}

function prop(name: string, value: string) {
    return foldLine(`${name}:${value}`);
}

// ──────────────────────────────────────────────────────────────────────────
// ICS básico (siempre PUBLISH, sin ATTENDEE)
// ──────────────────────────────────────────────────────────────────────────
export function buildIcs(meta: IcsMeta): string {
    const now = toUtc(new Date());

    const isAllDay = !!meta.allDay;
    const dtstart = isAllDay ? toDateVal(meta.startUtc) : toUtc(meta.startUtc);
    const dtend = isAllDay
        ? (() => {
            // si no te pasan end → start + 1 día
            const start = (meta.startUtc instanceof Date) ? meta.startUtc : new Date(meta.startUtc);
            const end = meta.endUtc ? ((meta.endUtc instanceof Date) ? meta.endUtc : new Date(meta.endUtc))
                : new Date(start.getTime() + 24 * 60 * 60 * 1000);
            return toDateVal(end);
        })()
        : (meta.endUtc ? toUtc(meta.endUtc) : null);

    const lines: string[] = [];
    lines.push("BEGIN:VCALENDAR");
    lines.push("VERSION:2.0");
    lines.push("PRODID:-//Reserflow//Calendar//ES");
    lines.push("CALSCALE:GREGORIAN");
    lines.push("METHOD:PUBLISH"); // ← fijo

    lines.push("BEGIN:VEVENT");
    lines.push(prop("UID", escapeText(meta.uid)));
    lines.push(prop("DTSTAMP", now));

    if (isAllDay) {
        lines.push(prop("DTSTART;VALUE=DATE", dtstart));
        lines.push(prop("DTEND;VALUE=DATE", dtend!));
    } else {
        lines.push(prop("DTSTART", dtstart));
        if (dtend) lines.push(prop("DTEND", dtend));
    }

    lines.push(prop("SUMMARY", escapeText(meta.summary)));
    if (meta.description) lines.push(prop("DESCRIPTION", escapeText(meta.description)));
    if (meta.location) lines.push(prop("LOCATION", escapeText(meta.location)));
    if (meta.url) lines.push(prop("URL", escapeText(meta.url)));
    lines.push(prop("STATUS", meta.status || "CONFIRMED"));

    if (meta.organizer?.email) {
        const cn = meta.organizer.name ? `;CN=${escapeText(meta.organizer.name)}` : "";
        lines.push(foldLine(`ORGANIZER${cn}:mailto:${meta.organizer.email}`));
    }

    if (meta.createdUtc) lines.push(prop("CREATED", toUtc(meta.createdUtc)));
    if (meta.lastModifiedUtc) lines.push(prop("LAST-MODIFIED", toUtc(meta.lastModifiedUtc)));
    if (typeof meta.sequence === "number") lines.push(prop("SEQUENCE", String(meta.sequence)));

    lines.push("END:VEVENT");
    lines.push("END:VCALENDAR");

    return lines.join("\r\n") + "\r\n"; // CRLF final
}
