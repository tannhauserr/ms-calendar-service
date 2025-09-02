// availability-special.ts
// ────────────────────────────────────────────────────────────
// Ajusta este import a tu proyecto

import moment from "moment-timezone";
import prisma from "../../../lib/prisma";
import { HoursRangeInput } from "../all-business-services/interfaces";

// ────────────────────────────────────────────────────────────
// Tipos mínimos (autónomos para no depender de tus modelos)
type Weekday =
    | "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY"
    | "FRIDAY" | "SATURDAY" | "SUNDAY";

export type BusinessHoursType = Partial<Record<Weekday, string[][] | null>>;
export type WorkerHoursMapType = Record<string, Partial<Record<Weekday, string[][] | null>>>;
export type TemporaryHoursMapType = Record<string, Record<string, string[][] | null>>;

export type ServiceAttendeeSpecial = {
    serviceId: string;
    durationMin: number;
    staffId?: string | null;
    categoryId?: string | null;
};

export type TimeSlotSpecial = {
    startLocalISO: string; // en TZ del cliente (local para el cliente)
    endLocalISO: string;   // en TZ del cliente
    label: string;         // "HH:mm" en TZ del cliente
};

export type GetTimeSlotsInputSpecial = {
    idCompany: string;
    idWorkspace: string;
    timeZoneWorkspace: string;   // ej: "Europe/Madrid"
    timeZoneClient: string;      // ej: "America/New_York"
    date: string;                // "YYYY-MM-DD" (día en TZ del workspace)
    attendees: ServiceAttendeeSpecial[];
    intervalMinutes?: number;    // paso base de tu UI (por defecto 30)
    excludeEventId?: string;
};

export type AvailabilityDepsSpecial = {
    businessHoursService: {
        getBusinessHoursFromRedis(idCompany: string, idWorkspace: string): Promise<BusinessHoursType>;
    };
    workerHoursService: {
        getWorkerHoursFromRedis(userIds: string[], idWorkspace: string): Promise<WorkerHoursMapType>;
    };
    temporaryHoursService: {
        getTemporaryHoursFromRedis(userIds: string[], idWorkspace: string, range?: HoursRangeInput): Promise<TemporaryHoursMapType>;
    };
    bookingConfig: {
        slot: {
            alignMode: "clock" | "service";
        };
    };
    cache?: {
        get<T>(key: string): Promise<T | undefined>;
        set<T>(key: string, value: T, ttlSec: number): Promise<void>;
    };
};

// ────────────────────────────────────────────────────────────
// Helpers rendimiento
export const gcd_SPECIAL = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd_SPECIAL(b, a % b));
export const minutesFromMidnight_SPECIAL = (m: moment.Moment) => m.hour() * 60 + m.minute();

export function toIdxRange_SPECIAL(
    start: moment.Moment,
    end: moment.Moment,
    stepMinutes: number
) {
    const sMin = minutesFromMidnight_SPECIAL(start);
    const eMin = minutesFromMidnight_SPECIAL(end);
    const slotsPerDay = Math.ceil(24 * 60 / stepMinutes);
    const i0 = Math.max(0, Math.min(slotsPerDay, Math.floor(sMin / stepMinutes)));
    const i1 = Math.max(0, Math.min(slotsPerDay, Math.ceil(eMin / stepMinutes))); // exclusivo
    return [i0, i1] as const;
}

// ────────────────────────────────────────────────────────────
// Eventos (robusto con YYYY-MM-DD o ISO completo; select mínimo; sin cast numérico)
export async function getEventsOverlappingRange_SPECIAL(
    userIds: string[],
    startISOOrDay: string,
    endISOOrDay: string,
    excludeEventId?: string
) {
    const parseStart = (s: string) =>
        s.length > 10 ? moment.utc(s) : moment.utc(s, "YYYY-MM-DD").startOf("day");
    const parseEnd = (s: string) =>
        s.length > 10 ? moment.utc(s) : moment.utc(s, "YYYY-MM-DD").endOf("day");

    const start = parseStart(startISOOrDay).toDate();
    const end = parseEnd(endISOOrDay).toDate();

    const where: any = {
        idUserPlatformFk: { in: userIds },
        // deletedDate: null,
        // TODO: Poner en el futuro los estados de un evento que no se quiere que sí se lean / o los que no sean
        startDate: { lt: end },
        endDate: { gt: start },
    };
    if (excludeEventId) where.id = { not: excludeEventId };

    const events = await prisma.event.findMany({
        where,
        select: { id: true, idUserPlatformFk: true, startDate: true, endDate: true },
    });

    return events as {
        id: string;
        idUserPlatformFk: string;
        startDate: Date;
        endDate: Date;
    }[];
}

// ────────────────────────────────────────────────────────────
// QPS cacheable: quién puede hacer un servicio (opcional cache)
export async function getUsersWhoCanPerformService_SPECIAL(
    idWorkspace: string,
    idService: string,
    idCategory: string | null | undefined,
    cache?: AvailabilityDepsSpecial["cache"],
    ttlSec: number = 600 // 10 min
): Promise<string[]> {
    const cacheKey = `svc-users:${idWorkspace}:${idCategory ?? "null"}:${idService}`;
    if (cache) {
        const cached = await cache.get<string[]>(cacheKey);
        if (cached) return cached;
    }

    const result = await prisma.category.findMany({
        where: { id: idCategory ?? undefined, idWorkspaceFk: idWorkspace },
        select: {
            categoryServices: {
                where: {
                    deletedDate: null,
                    service: {
                        deletedDate: null,
                        id: idService,
                        userServices: { some: {} },
                    },
                },
                select: { service: { select: { userServices: { select: { idUserFk: true } } } } },
            },
        },
    });

    const users = Array.from(
        new Set(
            result.flatMap((ce) => ce.categoryServices.flatMap((cs) => cs.service.userServices.map((us) => us.idUserFk)))
        )
    );

    if (cache) await cache.set(cacheKey, users, ttlSec);
    return users;
}

// ────────────────────────────────────────────────────────────
// Ventanas libres
export function groupEventsByUser_SPECIAL(events: Array<{ idUserPlatformFk: string; startDate: Date; endDate: Date }>) {
    const m: Record<string, typeof events> = {};
    for (const ev of events) {
        const uid = ev.idUserPlatformFk;
        if (!m[uid]) m[uid] = [];
        m[uid].push(ev);
    }
    return m;
}

export function subtractBusyFromShift_SPECIAL(
    shiftStart: moment.Moment,
    shiftEnd: moment.Moment,
    busy: Array<{ start: moment.Moment; end: moment.Moment }>
): Array<{ start: moment.Moment; end: moment.Moment }> {
    const evs = busy
        .map((b) => ({
            start: moment.max(b.start, shiftStart),
            end: moment.min(b.end, shiftEnd),
        }))
        .filter((b) => b.start.isBefore(b.end))
        .sort((a, b) => a.start.valueOf() - b.start.valueOf());

    const free: Array<{ start: moment.Moment; end: moment.Moment }> = [];
    let cur = shiftStart.clone();

    for (const e of evs) {
        if (e.start.isAfter(cur)) free.push({ start: cur.clone(), end: e.start.clone() });
        cur = moment.max(cur, e.end);
        if (cur.isSameOrAfter(shiftEnd)) break;
    }
    if (cur.isBefore(shiftEnd)) free.push({ start: cur, end: shiftEnd });
    return free;
}

export function mergeTouchingWindows_SPECIAL(
    w: Array<{ start: moment.Moment; end: moment.Moment }>
) {
    if (w.length <= 1) return w;
    const s = w.slice().sort((a, b) => a.start.valueOf() - b.start.valueOf());
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

// Inclusivo + sin milisegundos
export function windowContains_SPECIAL(
    win: { start: moment.Moment; end: moment.Moment },
    t0: moment.Moment,
    t1: moment.Moment
) {
    const s = win.start.clone().seconds(0).milliseconds(0);
    const e = win.end.clone().seconds(0).milliseconds(0);
    const a = t0.clone().seconds(0).milliseconds(0);
    const b = t1.clone().seconds(0).milliseconds(0);
    return a.isSameOrAfter(s) && b.isSameOrBefore(e);
}

// ────────────────────────────────────────────────────────────
// Backtracking (multi-servicio)
type AssignCtxSpecial = {
    idx: number;
    start: moment.Moment; // en TZ del workspace
    attendees: Array<{ serviceId: string; durationMin: number }>;
    eligibleUsersByService: Record<string, string[]>;
    freeWindowsByUser: Record<string, Array<{ start: moment.Moment; end: moment.Moment }>>;
    usedByUserAt: Array<{ userId: string; start: moment.Moment; end: moment.Moment }>;
    assignment: Array<{ serviceId: string; userId: string; start: moment.Moment; end: moment.Moment }>;
};

export function assignSequentially_SPECIAL(ctx: AssignCtxSpecial): boolean {
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
        const wins = ctx.freeWindowsByUser[uid] || [];

        let fitsWindow = false;
        for (const w of wins) {
            if (windowContains_SPECIAL(w, segStart, segEnd)) {
                fitsWindow = true;
                break;
            }
        }
        if (!fitsWindow) continue;

        let conflicts = false;
        for (const u of ctx.usedByUserAt) {
            if (u.userId !== uid) continue;
            if (segStart.isBefore(u.end) && segEnd.isAfter(u.start)) {
                conflicts = true;
                break;
            }
        }
        if (conflicts) continue;

        ctx.usedByUserAt.push({ userId: uid, start: segStart, end: segEnd });
        ctx.assignment.push({ serviceId: service.serviceId, userId: uid, start: segStart, end: segEnd });

        const ok = assignSequentially_SPECIAL({ ...ctx, idx: idx + 1 });
        if (ok) return true;

        ctx.usedByUserAt.pop();
        ctx.assignment.pop();
    }

    return false;
}


export function computeSlotConfig(params: {
    alignMode: "clock" | "service";
    attendees: { durationMin: number }[];
    intervalMinutes: number;
    timeZoneWorkspace: string;
    dayStartLocal: moment.Moment;
}) {
    const { alignMode, attendees, intervalMinutes, timeZoneWorkspace, dayStartLocal } = params;

    const durations = attendees.map(a => a.durationMin).filter(Boolean) as number[];
    const gcdDur = durations.reduce((acc, d) => (acc ? gcd_SPECIAL(acc, d) : d), 0) || intervalMinutes;

    let stepMinutes: number;
    if (alignMode === "service") {
        // 1 servicio → step = duración exacta; varios → step = MCD (gcd) de duraciones
        stepMinutes = durations.length === 1 ? durations[0] : gcdDur;

        // (Opcional) capar por slider:
        // stepMinutes = gcd_SPECIAL(stepMinutes, intervalMinutes);
    } else {
        stepMinutes = intervalMinutes;
    }

    if (!Number.isFinite(stepMinutes) || stepMinutes <= 0) stepMinutes = intervalMinutes;

    const slotsPerDay = Math.ceil((24 * 60) / stepMinutes);

    const nowLocal = moment.tz(timeZoneWorkspace).seconds(0).milliseconds(0);
    const isToday = dayStartLocal.isSame(nowLocal, "day");

    // Redondea "ahora" hacia arriba al múltiplo de stepMinutes solo si es hoy
    const roundedNow = (() => {
        if (!isToday) return nowLocal;
        const n = nowLocal.clone();
        const rem = n.minute() % stepMinutes;
        if (rem !== 0) n.add(stepMinutes - rem, "minutes");
        return n;
    })();

    return { stepMinutes, slotsPerDay, roundedNow, isToday };
}


// ────────────────────────────────────────────────────────────
// Función principal optimizada (TZ workspace + fast-path 1 servicio)
export async function publicGetAvailableTimeSlots_SPECIAL(
    input: GetTimeSlotsInputSpecial,
    deps: AvailabilityDepsSpecial
): Promise<{ timeSlots: TimeSlotSpecial[] }> {
    const {
        idCompany,
        idWorkspace,
        timeZoneWorkspace,
        timeZoneClient,
        date,
        attendees,
        intervalMinutes = 5,
        excludeEventId,
    } = input;

    if (!idCompany || !idWorkspace) throw new Error("Faltan idCompany / idWorkspace");
    if (!timeZoneWorkspace) throw new Error("Falta timeZoneWorkspace");
    if (!timeZoneClient) throw new Error("Falta timeZoneClient");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("date inválido");
    if (!Array.isArray(attendees) || attendees.length === 0) return { timeSlots: [] };

    console.log("entrante", input)

    // 0) stepMinutes y helpers para HOY (usando la función computeSlotConfig)
    const alignMode = "service";
    const dayStartLocal = moment.tz(`${date}T00:00:00`, "YYYY-MM-DDTHH:mm:ss", timeZoneWorkspace);


    const { stepMinutes, slotsPerDay, roundedNow, isToday } = computeSlotConfig({
        alignMode,
        attendees,
        intervalMinutes,
        timeZoneWorkspace,
        dayStartLocal,
    });





    // ⏱️ Fast-exit: solo días pasados (en TZ del workspace)
    // const dayStartLocal = moment.tz(`${date}T00:00:00`, "YYYY-MM-DDTHH:mm:ss", timeZoneWorkspace);
    const todayLocal = moment().tz(timeZoneWorkspace).startOf("day");
    if (dayStartLocal.clone().startOf("day").isBefore(todayLocal, "day")) {
        return { timeSlots: [] };
    }

    // 0) stepMinutes y helpers para HOY (necesario antes del clamp)
    const durations = attendees.map((a) => a.durationMin).filter(Boolean) as number[];
    const gcdDur = durations.reduce((acc, d) => (acc ? gcd_SPECIAL(acc, d) : d), 0) || intervalMinutes;
    // const stepMinutes = gcd_SPECIAL(intervalMinutes, gcdDur);
    // const slotsPerDay = Math.ceil(24 * 60 / stepMinutes);

    // const nowLocal = moment.tz(timeZoneWorkspace).seconds(0).milliseconds(0);
    // const isToday = dayStartLocal.isSame(nowLocal, "day");
    // const roundedNow = (() => {
    //     if (!isToday) return nowLocal;
    //     const n = nowLocal.clone();
    //     const rem = n.minute() % stepMinutes;
    //     if (rem !== 0) n.add(stepMinutes - rem, "minutes");
    //     return n;
    // })();

    const dayEndLocal = dayStartLocal.clone().endOf("day");

    // 1) Candidatos por servicio (con cache opcional)
    const userIdsByService = new Map<string, string[]>();
    for (const a of attendees) {
        if (a.staffId) {
            userIdsByService.set(a.serviceId, [a.staffId]);
        } else {
            const users = await getUsersWhoCanPerformService_SPECIAL(
                idWorkspace,
                a.serviceId,
                a.categoryId,
                deps.cache
            );
            userIdsByService.set(a.serviceId, users);
        }
    }
    const allUserIds = Array.from(new Set(Array.from(userIdsByService.values()).flat()));
    if (allUserIds.length === 0) return { timeSlots: [] };

    // 2) Reglas/horarios (TZ workspace)
    const businessHours
        = await deps.businessHoursService
            .getBusinessHoursFromRedis(idCompany, idWorkspace);
    const workerHoursMap
        = await deps.workerHoursService
            .getWorkerHoursFromRedis(allUserIds, idWorkspace);
    const temporaryHoursMap
        = await deps.temporaryHoursService
            .getTemporaryHoursFromRedis(allUserIds, idWorkspace, { date });

    // 3) Eventos del día (ventana en TZ workspace)
    const events = await getEventsOverlappingRange_SPECIAL(allUserIds, date, date, excludeEventId);

    // 4) Turnos efectivos por usuario (temporary > worker > business) en TZ workspace
    const weekDay = dayStartLocal.format("dddd").toUpperCase() as Weekday;
    const bizShifts: string[][] = (() => {
        const biz = (businessHours as any)?.[weekDay];
        return biz === null ? [] : Array.isArray(biz) ? biz : [];
    })();

    const shiftsByUserLocal: Record<string, Array<{ start: moment.Moment; end: moment.Moment }>> = {};
    for (const uid of allUserIds) {
        let workShifts: string[][] = [];
        const tmp = (temporaryHoursMap as any)?.[uid]?.[date];

        if (tmp === null) {
            workShifts = [];
        } else if (Array.isArray(tmp) && tmp.length > 0) {
            workShifts = tmp;
        } else {
            const workerDay = (workerHoursMap as any)?.[uid]?.[weekDay];
            if (workerDay === null) workShifts = [];
            else if (Array.isArray(workerDay) && workerDay.length > 0) workShifts = workerDay;
            else workShifts = bizShifts;
        }

        shiftsByUserLocal[uid] = (workShifts || []).map(([s, e]) => ({
            start: moment.tz(`${date}T${s}`, "YYYY-MM-DDTHH:mm:ss", timeZoneWorkspace),
            end: moment.tz(`${date}T${e}`, "YYYY-MM-DDTHH:mm:ss", timeZoneWorkspace),
        }));
    }

    // 5) Ventanas libres por usuario (con clamp correcto para HOY)
    const eventsByUser = groupEventsByUser_SPECIAL(events);
    const freeWindowsByUser: Record<string, Array<{ start: moment.Moment; end: moment.Moment }>> = {};

    for (const uid of allUserIds) {
        const busy = (eventsByUser[uid] || []).map((ev) => ({
            start: moment(ev.startDate).tz(timeZoneWorkspace),
            end: moment(ev.endDate).tz(timeZoneWorkspace),
        }));

        const rawShifts = shiftsByUserLocal[uid] || [];
        let free: Array<{ start: moment.Moment; end: moment.Moment }> = [];

        for (const sh of rawShifts) {
            // ✅ CLAMP: si es hoy, empezamos en el máximo entre inicio de turno y "now redondeado"
            const startClamped = isToday ? moment.max(sh.start, roundedNow) : sh.start.clone();
            if (!startClamped.isBefore(sh.end)) continue;

            const pieces = subtractBusyFromShift_SPECIAL(startClamped, sh.end, busy);
            free.push(...pieces);
        }

        free = mergeTouchingWindows_SPECIAL(free);
        freeWindowsByUser[uid] = free;
    }

    // 🔪 Pruning: si algún servicio no tiene ni un hueco ≥ duración en ningún elegible, termina.
    for (const svc of attendees) {
        const elig = userIdsByService.get(svc.serviceId) ?? [];
        const algunoTieneHueco = elig.some((uid) =>
            (freeWindowsByUser[uid] ?? []).some((w) => w.end.diff(w.start, "minutes") >= svc.durationMin)
        );
        if (!algunoTieneHueco) return { timeSlots: [] };
    }

    // 6) FAST-PATH: un solo servicio → sin backtracking
    // if (attendees.length === 1) {
    //     const svc = attendees[0];
    //     const eligible = userIdsByService.get(svc.serviceId) ?? [];
    //     const serviceMask = new Array<boolean>(slotsPerDay).fill(false);

    //     for (const uid of eligible) {
    //         const wins = freeWindowsByUser[uid] ?? [];
    //         for (const w of wins) {
    //             const [i0, i1] = toIdxRange_SPECIAL(
    //                 w.start.clone().seconds(0).milliseconds(0),
    //                 w.end.clone().seconds(0).milliseconds(0),
    //                 stepMinutes
    //             );
    //             for (let i = i0; i < i1; i++) serviceMask[i] = true;
    //         }
    //     }

    //     const need = Math.ceil(svc.durationMin / stepMinutes);
    //     const timeSlots: TimeSlotSpecial[] = [];
    //     for (let i = 0, run = 0; i < slotsPerDay; i++) {
    //         run = serviceMask[i] ? run + 1 : 0;
    //         if (run >= need) {
    //             const startIdx = i - need + 1;
    //             const start = dayStartLocal.clone().startOf("day").add(startIdx * stepMinutes, "minutes");
    //             const end = start.clone().add(svc.durationMin, "minutes");
    //             timeSlots.push({
    //                 startLocalISO: start.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
    //                 endLocalISO: end.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
    //                 label: start.clone().tz(timeZoneClient).format("HH:mm"),
    //             });
    //         }
    //     }
    //     return { timeSlots };
    // }

    // 6) FAST-PATH: un solo servicio → sin backtracking
    if (attendees.length === 1) {
        const svc = attendees[0];
        const eligible = userIdsByService.get(svc.serviceId) ?? [];
        const timeSlots: TimeSlotSpecial[] = [];

        // helper: redondear hacia arriba al múltiplo de stepMinutes
        const ceilToStep = (m: moment.Moment, step: number) => {
            const x = m.clone().seconds(0).milliseconds(0);
            const r = x.minute() % step;
            if (r !== 0) x.add(step - r, "minutes");
            return x;
        };

        for (const uid of eligible) {
            const wins = freeWindowsByUser[uid] ?? [];
            for (const w of wins) {
                // último inicio que cabe completamente dentro de la ventana
                const latestStart = w.end.clone().subtract(svc.durationMin, "minutes");
                // primer inicio alineado al step dentro de la ventana
                let cur = ceilToStep(moment.max(w.start, dayStartLocal.clone().startOf("day")), stepMinutes);

                // generar solo inicios que cumplan: cur + dur <= w.end
                while (cur.isSameOrBefore(latestStart)) {
                    timeSlots.push({
                        startLocalISO: cur.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
                        endLocalISO: cur.clone().add(svc.durationMin, "minutes").tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
                        label: cur.clone().tz(timeZoneClient).format("HH:mm"),
                    });
                    cur.add(stepMinutes, "minutes");
                }
            }
        }

        // opcional: ordenar/unique por si dos usuarios generan el mismo inicio (normalmente no con staff fijado)
        timeSlots.sort((a, b) => (a.startLocalISO < b.startLocalISO ? -1 : a.startLocalISO > b.startLocalISO ? 1 : 0));

        return { timeSlots };
    }

    // 7) Multi-servicio
    const totalDuration = attendees.reduce((acc, a) => acc + a.durationMin, 0);
    const seedService = attendees[0];
    const seedElig = userIdsByService.get(seedService.serviceId) ?? [];
    const candidateKeys = new Set<string>();
    const latestStart = dayEndLocal.clone().subtract(totalDuration, "minutes");

    for (const uid of seedElig) {
        const wins = freeWindowsByUser[uid] ?? [];
        for (const w of wins) {
            const s = moment.max(w.start, dayStartLocal).clone().seconds(0).milliseconds(0);
            const e = moment.min(w.end, latestStart).clone().seconds(0).milliseconds(0);
            if (!s.isBefore(e)) continue;

            let cur = s.clone().minute(Math.ceil(s.minute() / stepMinutes) * stepMinutes);
            while (!cur.isAfter(e)) {
                candidateKeys.add(cur.format("YYYY-MM-DDTHH:mm:ss"));
                cur.add(stepMinutes, "minutes");
            }
        }
    }

    const candidates = Array.from(candidateKeys)
        .map((k) => moment.tz(k, "YYYY-MM-DDTHH:mm:ss", timeZoneWorkspace))
        .sort((a, b) => a.valueOf() - b.valueOf());

    const timeSlots: TimeSlotSpecial[] = [];
    const eligibleUsersByService: Record<string, string[]> = {};
    for (const a of attendees) eligibleUsersByService[a.serviceId] = userIdsByService.get(a.serviceId) ?? [];

    for (const start of candidates) {
        const assignment: Array<{ serviceId: string; userId: string; start: moment.Moment; end: moment.Moment }> = [];
        const ok = assignSequentially_SPECIAL({
            idx: 0,
            start,
            attendees,
            eligibleUsersByService,
            freeWindowsByUser,
            usedByUserAt: [],
            assignment,
        });
        if (ok) {
            const end = start.clone().add(totalDuration, "minutes");
            timeSlots.push({
                startLocalISO: start.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
                endLocalISO: end.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
                label: start.clone().tz(timeZoneClient).format("HH:mm"),
            });
        }
    }

    return { timeSlots };
}
