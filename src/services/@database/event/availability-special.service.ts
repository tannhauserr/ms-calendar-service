// availability-special.ts
// ────────────────────────────────────────────────────────────
// Ajusta este import a tu proyecto

import moment from "moment-timezone";
import prisma from "../../../lib/prisma";
import { HoursRangeInput } from "../all-business-services/interfaces";
import { OnlineBookingConfig } from "../../@redis/cache/interfaces/models/booking-config";

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
    maxParticipants?: number | null;
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
    range?: { start: string; end: string }; // YYYY-MM-DD (opcional, si quieres varios días)
    idClient?: string; // opcional, para reglas de usuario
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
    bookingConfig: OnlineBookingConfig;

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
    intervalMinutes: number;
    timeZoneWorkspace: string;
    dayStartLocal: moment.Moment;
}) {
    const { intervalMinutes, timeZoneWorkspace, dayStartLocal } = params;

    let stepMinutes = intervalMinutes;

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












