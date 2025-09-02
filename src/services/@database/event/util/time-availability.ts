/* ====================== Helpers ====================== */

import moment from "moment";

/** Agrupa eventos por usuario */
export function groupEventsByUser(events: Array<{ idUserPlatformFk: string; startDate: Date; endDate: Date }>) {
    const m: Record<string, typeof events> = {};
    for (const ev of events) {
        const uid = ev.idUserPlatformFk;
        if (!m[uid]) m[uid] = [];
        m[uid].push(ev);
    }
    return m;
}

/** Resta eventos ocupados a un turno, devolviendo ventanas libres (en TZ local) */
export function subtractBusyFromShift(
    shiftStart: moment.Moment,
    shiftEnd: moment.Moment,
    busy: Array<{ start: moment.Moment; end: moment.Moment }>
): Array<{ start: moment.Moment; end: moment.Moment }> {
    // Ordena eventos y recorta a [shiftStart, shiftEnd]
    const evs = busy
        .map(b => ({
            start: moment.max(b.start, shiftStart),
            end: moment.min(b.end, shiftEnd),
        }))
        .filter(b => b.start.isBefore(b.end))
        .sort((a, b) => a.start.valueOf() - b.start.valueOf());

    const free: Array<{ start: moment.Moment; end: moment.Moment }> = [];
    let cur = shiftStart.clone();

    for (const e of evs) {
        if (e.start.isAfter(cur)) {
            free.push({ start: cur.clone(), end: e.start.clone() });
        }
        cur = moment.max(cur, e.end);
        if (cur.isSameOrAfter(shiftEnd)) break;
    }
    if (cur.isBefore(shiftEnd)) free.push({ start: cur, end: shiftEnd });
    return free;
}

/** Une tramos libres contiguos/tocantes */
export function mergeTouchingWindows(w: Array<{ start: moment.Moment; end: moment.Moment }>) {
    if (w.length <= 1) return w;
    const s = w
        .slice()
        .sort((a, b) => a.start.valueOf() - b.start.valueOf());
    const out: typeof s = [];
    let cur = { start: s[0].start.clone(), end: s[0].end.clone() };
    for (let i = 1; i < s.length; i++) {
        const x = s[i];
        if (!x.start.isAfter(cur.end)) {
            cur.end = moment.max(cur.end, x.end);
        } else {
            out.push(cur);
            cur = { start: x.start.clone(), end: x.end.clone() };
        }
    }
    out.push(cur);
    return out;
}

/** Comprueba si una ventana contiene completamente [t0, t1] */
// export function windowContains(win: { start: moment.Moment; end: moment.Moment }, t0: moment.Moment, t1: moment.Moment) {
//     return !t0.isBefore(win.start) && !t1.isAfter(win.end);
// }
export function windowContains(
    win: { start: moment.Moment; end: moment.Moment },
    t0: moment.Moment,
    t1: moment.Moment
) {
    const s = win.start.clone().seconds(0).milliseconds(0);
    const e = win.end.clone().seconds(0).milliseconds(0);
    const a = t0.clone().seconds(0).milliseconds(0);
    const b = t1.clone().seconds(0).milliseconds(0);

    //   console.log(
    //     "[windowContains]",
    //     "slot", a.format("HH:mm"), "-", b.format("HH:mm"),
    //     "win", s.format("HH:mm"), "-", e.format("HH:mm"),
    //     "res", a.isSameOrAfter(s), b.isSameOrBefore(e)
    //   );

    return a.isSameOrAfter(s) && b.isSameOrBefore(e);
}

type AssignCtx = {
    idx: number; // índice de servicio a colocar
    start: moment.Moment;
    attendees: Array<{ serviceId: string; durationMin: number }>;
    eligibleUsersByService: Record<string, string[]>;
    freeWindowsByUser: Record<string, Array<{ start: moment.Moment; end: moment.Moment }>>;
    usedByUserAt: Array<{ userId: string; start: moment.Moment; end: moment.Moment }>;
    assignment: Array<{ serviceId: string; userId: string; start: moment.Moment; end: moment.Moment }>;
};

/**
 * Intenta asignar TODOS los servicios en secuencia empezando en `start`.
 * Devuelve true si consigue una asignación válida sin solapes por usuario.
 */
export function assignSequentially(ctx: AssignCtx): boolean {
    const { idx, start, attendees } = ctx;
    if (idx >= attendees.length) return true;

    const service = attendees[idx];
    const segStart = start
        .clone()
        .add(attendees.slice(0, idx).reduce((acc, a) => acc + a.durationMin, 0), "minutes");
    const segEnd = segStart.clone().add(service.durationMin, "minutes");

    const candidates = ctx.eligibleUsersByService[service.serviceId] || [];
    if (candidates.length === 0) return false;

    for (const uid of candidates) {
        // 1) el usuario tiene una ventana libre que contenga todo el tramo
        const wins = ctx.freeWindowsByUser[uid] || [];
        let fitsWindow = false;
        for (const w of wins) {
            if (windowContains(w, segStart, segEnd)) {
                fitsWindow = true;
                break;
            }
        }
        // if (!fitsWindow) continue;

        if (!fitsWindow) {
            // ⬇️ DEBUG extra
            // console.log(
            //     "[assignSequentially] descartado slot",
            //     segStart.format("HH:mm"),
            //     "-",
            //     segEnd.format("HH:mm"),
            //     "para service",
            //     service.serviceId,
            //     "user",
            //     uid,
            //     "wins:",
            //     wins.map(w => `[${w.start.format("HH:mm")}–${w.end.format("HH:mm")}]`).join(" ")
            // );
            continue;
        }

        // 2) el usuario no está ya reservado en este candidato en ese tramo
        let conflicts = false;
        for (const u of ctx.usedByUserAt) {
            if (u.userId !== uid) continue;
            // solape: a < B && b > A
            if (segStart.isBefore(u.end) && segEnd.isAfter(u.start)) {
                conflicts = true;
                break;
            }
        }
        if (conflicts) continue;

        // Acepta y continua
        ctx.usedByUserAt.push({ userId: uid, start: segStart, end: segEnd });
        ctx.assignment.push({ serviceId: service.serviceId, userId: uid, start: segStart, end: segEnd });

        const ok = assignSequentially({ ...ctx, idx: idx + 1 });
        if (ok) return true;

        // backtrack
        ctx.usedByUserAt.pop();
        ctx.assignment.pop();
    }

    return false;
}