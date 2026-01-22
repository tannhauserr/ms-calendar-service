import moment from "moment-timezone";
import prisma from "../../../lib/prisma";
import { HoursRangeInput } from "../all-business-services/interfaces";
import {
    computeSlotConfig,
    getUsersWhoCanPerformService_SPECIAL,
    getEventsOverlappingRange_SPECIAL,
    groupEventsByUser_SPECIAL,
    subtractBusyFromShift_SPECIAL,
    mergeTouchingWindows_SPECIAL,
    assignSequentially_SPECIAL,
    alignToGridCeil_SPECIAL,
    buildShiftsByUser_SPECIAL,
    dedupeAndSortSlots_SPECIAL
} from "./availability-special.service";
import CustomError from "../../../models/custom-error/CustomError";
import { OnlineBookingConfig } from "../../@redis/cache/interfaces/models/booking-config";
import { a } from "@react-spring/web";
import { DayStatus } from "./types";
import { CONSOLE_COLOR } from "../../../constant/console-color";

/* ────────────────────────────────────────────────────────────
   Tipos
────────────────────────────────────────────────────────────── */
type Weekday =
    | "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY"
    | "FRIDAY" | "SATURDAY" | "SUNDAY";

export type MinimalServiceSnapshot = {
    id: string;
    name?: string | null;
    price: number;
    discount: number;
    duration: number;
    durationMin: number;
    maxParticipants: number; // 1 ⇒ individual, >1 ⇒ grupal
};

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
    startLocalISO: string;
    endLocalISO: string;
    label: string;
    /** "X / C" si es grupal; null si es individual */
    labelParticipant?: string | null;
};

export type GetTimeSlotsInputSpecial = {
    idCompany: string;
    idWorkspace: string;
    timeZoneWorkspace: string;
    timeZoneClient: string;
    date: string; // "YYYY-MM-DD"
    attendees: ServiceAttendeeSpecial[];
    intervalMinutes?: number;
    excludeEventId?: string;
    /** Si viene y el cliente ya está en el grupo de ese slot, NO devolver el slot */
    idClient?: string;
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
    /** ← tu _getServicesSnapshotById inyectado */
    servicesSnapshot: {
        getServicesSnapshotById(params: {
            idCompany: string;
            idWorkspace: string;
            attendees?: Array<{ serviceId: string | undefined | null }>;
            ids?: string[];
            includeInvisible?: boolean;
            requireAll?: boolean;
        }): Promise<Record<string, MinimalServiceSnapshot>>;
    };
    cache?: {
        get<T>(key: string): Promise<T | undefined>;
        set<T>(key: string, value: T, ttlSec: number): Promise<void>;
    };
};

/* ────────────────────────────────────────────────────────────
   Service que devuelve los tiempos de eventos
────────────────────────────────────────────────────────────── */
export class EventTimesService {
    /**
     * Devuelve eventos de un servicio en el día/rango, con:
     *  - user (pro) asignado
     *  - start/end
     *  - participantes (ids) y conteo
     */
    async getGroupEventsWithCounts_SPECIAL(
        idCompany: string,
        idWorkspace: string,
        idService: string,
        startISOOrDay: string,
        endISOOrDay: string,
        excludeEventId?: string
    ): Promise<Array<{
        id: string;
        idUserPlatformFk: string | null;
        startDate: Date;
        endDate: Date;
        participantClientIds: string[];          // idClientFk
        participantClientWorkspaceIds: string[]; // idClientWorkspaceFk
        participantsCount: number;
    }>> {
        // const calendar = await prisma.calendar.findFirst({
        //     where: { idCompanyFk: idCompany, idWorkspaceFk: idWorkspace, deletedDate: null },
        //     select: { id: true },
        // });
        // if (!calendar) return [];

        const parseStart = (s: string) =>
            s.length > 10 ? moment.utc(s) : moment.utc(s, "YYYY-MM-DD").startOf("day");
        const parseEnd = (s: string) =>
            s.length > 10 ? moment.utc(s) : moment.utc(s, "YYYY-MM-DD").endOf("day");

        const start = parseStart(startISOOrDay).toDate();
        const end = parseEnd(endISOOrDay).toDate();

        const events = await prisma.event.findMany({
            where: {
                // idCalendarFk: calendar.id,
                groupEvents: { idWorkspaceFk: idWorkspace },
                idServiceFk: idService,
                startDate: { lt: end },
                endDate: { gt: start },
                ...(excludeEventId ? { id: { not: excludeEventId } } : {}),
                // deletedDate: null, // si quieres ignorar borrados lógicos
            },
            select: {
                id: true,
                idUserPlatformFk: true,
                startDate: true,
                endDate: true,
                groupEvents: {
                    select: {
                        eventParticipant: {
                            where: { deletedDate: null },
                            select: { idClientFk: true, idClientWorkspaceFk: true },
                        },
                    },
                },
            },
        });

        return events.map(ev => {
            const participants = ev.groupEvents?.eventParticipant ?? [];
            return {
                id: ev.id,
                idUserPlatformFk: ev.idUserPlatformFk,
                startDate: ev.startDate,
                endDate: ev.endDate,
                participantClientIds: participants.map(p => p.idClientFk).filter((x): x is string => !!x),
                participantClientWorkspaceIds: participants.map(p => p.idClientWorkspaceFk).filter((x): x is string => !!x),
                participantsCount: participants.length,
            };
        });
    }


    // ────────────────────────────────────────────────────────────
    // publicGetAvailableTimeSlots_SPECIAL (versión alineada con getAvailableDays)
    // ────────────────────────────────────────────────────────────
    async publicGetAvailableTimeSlots_SPECIAL(
        input: GetTimeSlotsInputSpecial,
        deps: AvailabilityDepsSpecial
    ): Promise<{ timeSlots: TimeSlotSpecial[]; dayStatus: DayStatus }> {
        const {
            idCompany,
            idWorkspace,
            timeZoneWorkspace,
            timeZoneClient,
            date,
            attendees,
            excludeEventId,
            idClient,
        } = input;

        try {
            console.log("[publicGetAvailableTimeSlots_SPECIAL] called", {
                date,
                attendees: attendees.map((a) => a.serviceId),
            });

            const BOOKING_PAGE_CONFIG: OnlineBookingConfig = deps.bookingConfig;

            console.log("mira booking page config en time slots", BOOKING_PAGE_CONFIG);
            console.log(`${CONSOLE_COLOR.BgMagenta} [Resources]`, JSON.stringify(BOOKING_PAGE_CONFIG.resources), `${CONSOLE_COLOR.Reset}`);

            // Booking window (con defaults seguros)
            const { maxAdvanceDays = 60, minLeadTimeMin = 60 } =
                BOOKING_PAGE_CONFIG.bookingWindow ?? {};

            const alignMode: "clock" | "service" =
                BOOKING_PAGE_CONFIG.slot?.alignMode === "service" ? "service" : "clock";

            const intervalMinutes =
                alignMode === "service"
                    ? attendees?.reduce((acc, a) => acc + (a.durationMin ?? 0), 0)
                    : BOOKING_PAGE_CONFIG?.slot?.stepMinutes;

            const professionalAllowed =
                BOOKING_PAGE_CONFIG?.resources?.ids?.map((r) =>
                    Array.isArray(r) ? r?.[0] : r
                ) ?? [];

            // Validaciones rápidas
            if (!idCompany || !idWorkspace) throw new Error("Faltan idCompany / idWorkspace");
            if (!timeZoneWorkspace) throw new Error("Falta timeZoneWorkspace");
            if (!timeZoneClient) throw new Error("Falta timeZoneClient");
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("date inválido");
            if (!Array.isArray(attendees) || attendees.length === 0)
                return { timeSlots: [], dayStatus: "no_services" };
            if (professionalAllowed.length === 0) return { timeSlots: [], dayStatus: "no_staff" };

            // Día / ventana booking
            const dayStartLocal = moment.tz(`${date}T00:00:00`, "YYYY-MM-DDTHH:mm:ss", timeZoneWorkspace);
            const { stepMinutes, roundedNow, isToday } = computeSlotConfig({
                intervalMinutes,
                timeZoneWorkspace,
                dayStartLocal,
            });

            // Día pasado (en TZ negocio) → vacío
            const todayLocal = moment().tz(timeZoneWorkspace).startOf("day");
            if (dayStartLocal.clone().startOf("day").isBefore(todayLocal, "day")) {
                return { timeSlots: [], dayStatus: "past" };
            }

            const dayEndLocal = dayStartLocal.clone().endOf("day");
            const gridOrigin = dayStartLocal.clone().startOf("day"); // Rejilla global del día

            // Ventana absoluta permitida (TZ negocio)
            const nowWS = moment.tz(timeZoneWorkspace);
            const earliestAllowed = nowWS.clone().add(minLeadTimeMin, "minutes").seconds(0).milliseconds(0);
            const latestAllowedEnd = nowWS.clone().add(maxAdvanceDays, "days").endOf("day");

            // Cortes rápidos por día completo
            if (dayStartLocal.isAfter(latestAllowedEnd)) return { timeSlots: [], dayStatus: "out_of_window" };
            if (dayEndLocal.isBefore(earliestAllowed)) return { timeSlots: [], dayStatus: "out_of_window" };

            const withinBookingWindow = (startWS: moment.Moment) =>
                startWS.isSameOrAfter(earliestAllowed) && startWS.isSameOrBefore(latestAllowedEnd);

            const withinAllowed = (ids: string[]) => ids.filter((id) => professionalAllowed.includes(id));

            // 1) Snapshot servicios
            const servicesSnapshot = await deps.servicesSnapshot.getServicesSnapshotById({
                idCompany,
                idWorkspace,
                attendees: attendees.map((a) => ({ serviceId: a.serviceId })),
                requireAll: true,
            });

            // No permitir combinar grupales con otros servicios
            const hasGroupService = attendees.some((a) => {
                const s = servicesSnapshot[a.serviceId];
                return s && s.maxParticipants > 1;
            });
            if (hasGroupService && attendees.length > 1) {
                throw new Error("Los servicios grupales no se pueden combinar con otros en la misma reserva.");
            }

            // 2) Usuarios elegibles por servicio (PARALELO por attendee)
            const userIdsByServiceEntries = await Promise.all(
                attendees.map(async (a) => {
                    const svcId = a.serviceId;
                    if (!svcId) return [null, []] as const;

                    if (a.staffId) {
                        const elig = professionalAllowed.includes(a.staffId) ? [a.staffId] : [];
                        return [svcId, elig] as const;
                    }

                    const users = await getUsersWhoCanPerformService_SPECIAL(
                        idWorkspace,
                        svcId,
                        a.categoryId,
                        deps.cache
                    );
                    return [svcId, withinAllowed(users)] as const;
                })
            );

            const userIdsByService = new Map<string, string[]>();
            for (const [svcId, ids] of userIdsByServiceEntries) {
                if (svcId) userIdsByService.set(svcId, ids as any);
            }

            const allUserIds = Array.from(new Set(Array.from(userIdsByService.values()).flat()));
            if (allUserIds.length === 0) return { timeSlots: [], dayStatus: "no_staff" };

            // 3) Horarios + eventos (+grupo opcional) EN PARALELO
            const isSingleService = attendees.length === 1;
            let shouldFetchGroupEvents = false;

            if (isSingleService) {
                const svcReq = attendees[0];
                const svcSnap = servicesSnapshot[svcReq.serviceId];
                const capacity = Math.max(1, svcSnap?.maxParticipants ?? 1);
                shouldFetchGroupEvents = capacity > 1;
            }

            const [
                businessHours,
                workerHoursMap,
                temporaryHoursMap,
                events,
                groupEventsRaw,
            ] = await Promise.all([
                deps.businessHoursService.getBusinessHoursFromRedis(idCompany, idWorkspace),
                deps.workerHoursService.getWorkerHoursFromRedis(allUserIds, idWorkspace),
                deps.temporaryHoursService.getTemporaryHoursFromRedis(allUserIds, idWorkspace, { date }),
                getEventsOverlappingRange_SPECIAL(idWorkspace, allUserIds, date, date, excludeEventId),
                shouldFetchGroupEvents
                    ? this.getGroupEventsWithCounts_SPECIAL(
                        idCompany,
                        idWorkspace,
                        attendees[0].serviceId as string,
                        date,
                        date,
                        excludeEventId
                    )
                    : Promise.resolve([]),
            ]);

            // 4) Construir ventanas libres por usuario (USANDO HELPER con fallback por defecto = true)
            const weekDay = dayStartLocal.format("dddd").toUpperCase() as Weekday;
            const useBizFallback =
                (BOOKING_PAGE_CONFIG as any)?.resources?.useBusinessHoursAsWorkerFallback ?? true;

            const shiftsByUserLocal = buildShiftsByUser_SPECIAL({
                userIds: allUserIds,
                date,
                timeZoneWorkspace,
                weekDay,
                businessHours,
                workerHoursMap,
                temporaryHoursMap,
                useBizFallback, // ← default true para igualar getAvailableDays
            });

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
                    const startClamped = isToday ? moment.max(sh.start, roundedNow) : sh.start.clone();
                    if (!startClamped.isBefore(sh.end)) continue;
                    free.push(...subtractBusyFromShift_SPECIAL(startClamped, sh.end, busy));
                }

                free = mergeTouchingWindows_SPECIAL(free);
                freeWindowsByUser[uid] = free;
            }

            // 5) Multi-servicio: pruning rápido
            if (attendees.length > 1) {
                for (const a of attendees) {
                    const elig = userIdsByService.get(a.serviceId) ?? [];
                    const dur = servicesSnapshot[a.serviceId]?.durationMin ?? a.durationMin;
                    const algunoTieneHueco = elig.some((uid) =>
                        (freeWindowsByUser[uid] ?? []).some((w) => w.end.diff(w.start, "minutes") >= dur)
                    );
                    if (!algunoTieneHueco) return { timeSlots: [], dayStatus: "no_services" };
                }
            }

            // 6) FAST-PATH: 1 servicio (con soporte grupal)
            if (attendees.length === 1) {
                const svcReq = attendees[0];
                const svcSnap = servicesSnapshot[svcReq.serviceId];
                const svcDuration = svcSnap?.durationMin ?? svcReq.durationMin;
                const capacity = Math.max(1, svcSnap?.maxParticipants ?? 1);
                const isGroup = capacity > 1;

                const groupEvents = isGroup ? groupEventsRaw : [];

                const groupEventsByUser: Record<string, Array<{ start: moment.Moment; end: moment.Moment }>> =
                    {};
                for (const ev of groupEvents) {
                    const u = ev.idUserPlatformFk ?? "";
                    if (!u) continue;
                    const s = moment(ev.startDate).tz(timeZoneWorkspace).seconds(0).milliseconds(0);
                    const e = moment(ev.endDate).tz(timeZoneWorkspace).seconds(0).milliseconds(0);
                    (groupEventsByUser[u] ||= []).push({ start: s, end: e });
                }

                const countIndex = new Map<string, number>();
                const membersIndex = new Map<string, Set<string>>();
                const keyOf = (userId: string | null | undefined, start: moment.Moment, end: moment.Moment) =>
                    `${userId ?? ""}|${start.format("YYYY-MM-DDTHH:mm:ss")}|${end.format("YYYY-MM-DDTHH:mm:ss")}`;

                for (const ev of groupEvents) {
                    const s = moment(ev.startDate).tz(timeZoneWorkspace).seconds(0).milliseconds(0);
                    const e = moment(ev.endDate).tz(timeZoneWorkspace).seconds(0).milliseconds(0);
                    const k = keyOf(ev.idUserPlatformFk, s, e);
                    countIndex.set(k, ev.participantsCount);
                    const set = new Set<string>();
                    ev.participantClientIds.forEach((id) => set.add(id));
                    ev.participantClientWorkspaceIds.forEach((id) => set.add(id));
                    membersIndex.set(k, set);
                }

                const eligible = userIdsByService.get(svcReq.serviceId) ?? [];
                const rawSlots: TimeSlotSpecial[] = [];

                for (const uid of eligible) {
                    const baseWins = freeWindowsByUser[uid] ?? [];
                    const addWinsRaw = isGroup ? groupEventsByUser[uid] ?? [] : [];
                    const addWins = addWinsRaw
                        .map((w) => {
                            const startClamped = isToday ? moment.max(w.start, roundedNow) : w.start;
                            return startClamped.isBefore(w.end) ? { start: startClamped, end: w.end } : null;
                        })
                        .filter(Boolean) as Array<{ start: moment.Moment; end: moment.Moment }>;

                    const wins = isGroup && addWins.length ? mergeTouchingWindows_SPECIAL([...baseWins, ...addWins]) : baseWins;

                    for (const w of wins) {
                        const latestStart = w.end.clone().subtract(svcDuration, "minutes");
                        let cur = alignToGridCeil_SPECIAL(
                            moment.max(w.start, dayStartLocal.clone().startOf("day")),
                            stepMinutes,
                            gridOrigin
                        );

                        while (cur.isSameOrBefore(latestStart)) {
                            if (!withinBookingWindow(cur)) {
                                cur.add(stepMinutes, "minutes");
                                continue;
                            }

                            const end = cur.clone().add(svcDuration, "minutes");

                            if (isGroup) {
                                const k = keyOf(uid, cur, end);
                                const booked = countIndex.get(k) ?? 0;
                                const left = Math.max(0, capacity - booked);

                                const members = membersIndex.get(k);
                                const clientAlreadyInGroup = !!(idClient && members && members.has(idClient));

                                if (left > 0 && !clientAlreadyInGroup) {
                                    rawSlots.push({
                                        startLocalISO: cur.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
                                        endLocalISO: end.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
                                        label: cur.clone().tz(timeZoneClient).format("HH:mm"),
                                        labelParticipant: `${booked} / ${capacity}`,
                                    });
                                }
                            } else {
                                rawSlots.push({
                                    startLocalISO: cur.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
                                    endLocalISO: end.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
                                    label: cur.clone().tz(timeZoneClient).format("HH:mm"),
                                    labelParticipant: null,
                                });
                            }

                            cur.add(stepMinutes, "minutes");
                        }
                    }
                }

                const timeSlots = dedupeAndSortSlots_SPECIAL(rawSlots);

                return { timeSlots, dayStatus: timeSlots.length > 0 ? "available" : "completed" };
            }

            // 7) Multi-servicio (igual que antes, usando freeWindowsByUser), con rejilla global y dedupe
            const totalDuration = attendees.reduce(
                (acc, a) => acc + (servicesSnapshot[a.serviceId]?.durationMin ?? a.durationMin),
                0
            );
            const seedService = attendees[0];
            const seedElig = userIdsByService.get(seedService.serviceId) ?? [];
            const candidateKeys = new Set<string>();
            const latestStart = dayEndLocal.clone().subtract(totalDuration, "minutes");

            for (const uid of seedElig) {
                const wins = freeWindowsByUser[uid] ?? [];
                for (const w of wins) {
                    const s0 = moment.max(w.start, dayStartLocal).clone().seconds(0).milliseconds(0);
                    const e0 = moment.min(w.end, latestStart).clone().seconds(0).milliseconds(0);
                    if (!s0.isBefore(e0)) continue;

                    let cur = alignToGridCeil_SPECIAL(s0, stepMinutes, gridOrigin);
                    while (!cur.isAfter(e0)) {
                        candidateKeys.add(cur.format("YYYY-MM-DDTHH:mm:ss"));
                        cur.add(stepMinutes, "minutes");
                    }
                }
            }

            const candidates = Array.from(candidateKeys)
                .map((k) => moment.tz(k, "YYYY-MM-DDTHH:mm:ss", timeZoneWorkspace))
                .sort((a, b) => a.valueOf() - b.valueOf());

            const timeSlotsRaw: TimeSlotSpecial[] = [];
            const eligibleUsersByService: Record<string, string[]> = {};
            for (const a of attendees)
                eligibleUsersByService[a.serviceId] = userIdsByService.get(a.serviceId) ?? [];

            for (const start of candidates) {
                if (!withinBookingWindow(start)) continue;

                const assignment: Array<{
                    serviceId: string;
                    userId: string;
                    start: moment.Moment;
                    end: moment.Moment;
                }> = [];
                const attendeesWithRealDur = attendees.map((a) => ({
                    serviceId: a.serviceId,
                    durationMin: servicesSnapshot[a.serviceId]?.durationMin ?? a.durationMin,
                }));

                const ok = assignSequentially_SPECIAL({
                    idx: 0,
                    start,
                    attendees: attendeesWithRealDur,
                    eligibleUsersByService,
                    freeWindowsByUser,
                    usedByUserAt: [],
                    assignment,
                });
                if (ok) {
                    const end = start.clone().add(totalDuration, "minutes");
                    timeSlotsRaw.push({
                        startLocalISO: start.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
                        endLocalISO: end.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
                        label: start.clone().tz(timeZoneClient).format("HH:mm"),
                        labelParticipant: null,
                    });
                }
            }

            const timeSlots = dedupeAndSortSlots_SPECIAL(timeSlotsRaw);
            return { timeSlots, dayStatus: timeSlots.length > 0 ? "available" : "completed" };
        } catch (error: any) {
            throw new CustomError("EventTimesService.publicGetAvailableTimeSlots_SPECIAL", error);
        }
    }

    // ────────────────────────────────────────────────────────────
    // publicGetAvailableTimeSlots_SPECIAL (MISMA lógica + logs exhaustivos)
    // ────────────────────────────────────────────────────────────
    // async publicGetAvailableTimeSlots_SPECIAL(
    //     input: GetTimeSlotsInputSpecial,
    //     deps: AvailabilityDepsSpecial
    // ): Promise<{ timeSlots: TimeSlotSpecial[]; dayStatus: DayStatus }> {
    //     const {
    //         idCompany,
    //         idWorkspace,
    //         timeZoneWorkspace,
    //         timeZoneClient,
    //         date,
    //         attendees,
    //         excludeEventId,
    //         idClient,
    //     } = input;

    //     // Toggle de logs (por si lo quieres apagar fácil en prod)
    //     const DEBUG = false;

    //     // TraceId para correlacionar TODO lo de esta llamada
    //     const traceId = `AVAIL:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 7)}`;

    //     const nowIso = () => new Date().toISOString();
    //     const ms = (t0: number) => `${Date.now() - t0}ms`;

    //     const safeJson = (v: any) => {
    //         try {
    //             return JSON.stringify(v, (_k, val) => {
    //                 if (val instanceof Map) return { __type: "Map", entries: Array.from(val.entries()) };
    //                 if (val instanceof Set) return { __type: "Set", values: Array.from(val.values()) };
    //                 if (typeof val === "bigint") return val.toString();
    //                 return val;
    //             });
    //         } catch {
    //             return "[unstringifiable]";
    //         }
    //     };

    //     const fmt = (m: moment.Moment | null | undefined, tz?: string) => {
    //         if (!m) return null;
    //         const mm = tz ? m.clone().tz(tz) : m;
    //         return {
    //             iso: mm.format("YYYY-MM-DDTHH:mm:ss"),
    //             unix: mm.valueOf(),
    //             tz: tz ?? (mm as any)?._z?.name ?? "unknown",
    //         };
    //     };

    //     const dbg = (...args: any[]) => {
    //         if (!DEBUG) return;
    //         // eslint-disable-next-line no-console
    //         console.log(`[${traceId}]`, ...args);
    //     };

    //     const group = (title: string, fn: () => void) => {
    //         if (!DEBUG) return fn();
    //         // eslint-disable-next-line no-console
    //         console.groupCollapsed(`[${traceId}] ${title}`);
    //         try {
    //             fn();
    //         } finally {
    //             // eslint-disable-next-line no-console
    //             console.groupEnd();
    //         }
    //     };

    //     const table = (label: string, rows: any[]) => {
    //         if (!DEBUG) return;
    //         // eslint-disable-next-line no-console
    //         console.log(`[${traceId}] ${label}`);
    //         // eslint-disable-next-line no-console
    //         console.table(rows);
    //     };

    //     try {
    //         const tAll = Date.now();

    //         group("publicGetAvailableTimeSlots_SPECIAL: INPUT", () => {
    //             dbg("ts:", nowIso());
    //             dbg("idCompany:", idCompany);
    //             dbg("idWorkspace:", idWorkspace);
    //             dbg("date:", date);
    //             dbg("timeZoneWorkspace:", timeZoneWorkspace);
    //             dbg("timeZoneClient:", timeZoneClient);
    //             dbg("excludeEventId:", excludeEventId ?? null);
    //             dbg("idClient:", idClient ?? null);
    //             dbg(
    //                 "attendees:",
    //                 (attendees ?? []).map((a) => ({
    //                     serviceId: a.serviceId,
    //                     durationMin: a.durationMin,
    //                     staffId: a.staffId ?? null,
    //                     categoryId: (a as any).categoryId ?? null,
    //                 }))
    //             );
    //         });

    //         const BOOKING_PAGE_CONFIG: OnlineBookingConfig = deps.bookingConfig;

    //         group("BOOKING_PAGE_CONFIG (resumen)", () => {
    //             dbg("bookingWindow:", BOOKING_PAGE_CONFIG?.bookingWindow ?? null);
    //             dbg("slot:", BOOKING_PAGE_CONFIG?.slot ?? null);
    //             dbg("resources:", BOOKING_PAGE_CONFIG?.resources ?? null);
    //             dbg("resources.ids raw:", safeJson((BOOKING_PAGE_CONFIG as any)?.resources?.ids ?? null));
    //             dbg(
    //                 `${CONSOLE_COLOR.BgMagenta} [Resources]`,
    //                 safeJson(BOOKING_PAGE_CONFIG.resources),
    //                 `${CONSOLE_COLOR.Reset}`
    //             );
    //         });

    //         // Booking window (con defaults seguros)
    //         const { maxAdvanceDays = 60, minLeadTimeMin = 60 } = BOOKING_PAGE_CONFIG.bookingWindow ?? {};

    //         const alignMode: "clock" | "service" =
    //             BOOKING_PAGE_CONFIG.slot?.alignMode === "service" ? "service" : "clock";

    //         const intervalMinutes =
    //             alignMode === "service"
    //                 ? attendees?.reduce((acc, a) => acc + (a.durationMin ?? 0), 0)
    //                 : BOOKING_PAGE_CONFIG?.slot?.stepMinutes;

    //         const professionalAllowed =
    //             BOOKING_PAGE_CONFIG?.resources?.ids?.map((r) => (Array.isArray(r) ? r?.[0] : r)) ?? [];

    //         group("CONFIG DERIVADA", () => {
    //             dbg("alignMode:", alignMode);
    //             dbg("intervalMinutes:", intervalMinutes);
    //             dbg("maxAdvanceDays:", maxAdvanceDays);
    //             dbg("minLeadTimeMin:", minLeadTimeMin);
    //             dbg("professionalAllowed (len):", professionalAllowed.length);
    //             dbg("professionalAllowed:", professionalAllowed);
    //         });

    //         // Validaciones rápidas
    //         group("VALIDACIONES", () => {
    //             dbg("has idCompany/idWorkspace:", !!idCompany, !!idWorkspace);
    //             dbg("has TZs:", !!timeZoneWorkspace, !!timeZoneClient);
    //             dbg("date format ok:", /^\d{4}-\d{2}-\d{2}$/.test(date));
    //             dbg("attendees len:", Array.isArray(attendees) ? attendees.length : null);
    //             dbg("professionalAllowed len:", professionalAllowed.length);
    //         });

    //         if (!idCompany || !idWorkspace) throw new Error("Faltan idCompany / idWorkspace");
    //         if (!timeZoneWorkspace) throw new Error("Falta timeZoneWorkspace");
    //         if (!timeZoneClient) throw new Error("Falta timeZoneClient");
    //         if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("date inválido");
    //         if (!Array.isArray(attendees) || attendees.length === 0)
    //             return { timeSlots: [], dayStatus: "no_services" };
    //         if (professionalAllowed.length === 0) return { timeSlots: [], dayStatus: "no_staff" };

    //         // Día / ventana booking
    //         const dayStartLocal = moment.tz(`${date}T00:00:00`, "YYYY-MM-DDTHH:mm:ss", timeZoneWorkspace);

    //         const { stepMinutes, roundedNow, isToday } = computeSlotConfig({
    //             intervalMinutes,
    //             timeZoneWorkspace,
    //             dayStartLocal,
    //         });

    //         const dayEndLocal = dayStartLocal.clone().endOf("day");
    //         const gridOrigin = dayStartLocal.clone().startOf("day"); // Rejilla global del día

    //         group("DÍA (TZ negocio) + SLOT CONFIG", () => {
    //             dbg("dayStartLocal:", fmt(dayStartLocal, timeZoneWorkspace));
    //             dbg("dayEndLocal:", fmt(dayEndLocal, timeZoneWorkspace));
    //             dbg("gridOrigin:", fmt(gridOrigin, timeZoneWorkspace));
    //             dbg("stepMinutes:", stepMinutes);
    //             dbg("isToday:", isToday);
    //             dbg("roundedNow:", fmt(roundedNow, timeZoneWorkspace));
    //         });

    //         // Día pasado (en TZ negocio) → vacío
    //         const todayLocal = moment().tz(timeZoneWorkspace).startOf("day");
    //         if (dayStartLocal.clone().startOf("day").isBefore(todayLocal, "day")) {
    //             group("CORTE: past", () => {
    //                 dbg("todayLocal:", fmt(todayLocal, timeZoneWorkspace));
    //                 dbg("dayStartLocal:", fmt(dayStartLocal, timeZoneWorkspace));
    //             });
    //             return { timeSlots: [], dayStatus: "past" };
    //         }

    //         // Ventana absoluta permitida (TZ negocio)
    //         const nowWS = moment.tz(timeZoneWorkspace);
    //         const earliestAllowed = nowWS
    //             .clone()
    //             .add(minLeadTimeMin, "minutes")
    //             .seconds(0)
    //             .milliseconds(0);
    //         const latestAllowedEnd = nowWS.clone().add(maxAdvanceDays, "days").endOf("day");

    //         group("BOOKING WINDOW ABSOLUTA (TZ negocio)", () => {
    //             dbg("nowWS:", fmt(nowWS, timeZoneWorkspace));
    //             dbg("earliestAllowed:", fmt(earliestAllowed, timeZoneWorkspace));
    //             dbg("latestAllowedEnd:", fmt(latestAllowedEnd, timeZoneWorkspace));
    //             dbg("dayStartLocal after latestAllowedEnd:", dayStartLocal.isAfter(latestAllowedEnd));
    //             dbg("dayEndLocal before earliestAllowed:", dayEndLocal.isBefore(earliestAllowed));
    //         });

    //         // Cortes rápidos por día completo
    //         if (dayStartLocal.isAfter(latestAllowedEnd)) return { timeSlots: [], dayStatus: "out_of_window" };
    //         if (dayEndLocal.isBefore(earliestAllowed)) return { timeSlots: [], dayStatus: "out_of_window" };

    //         const withinBookingWindow = (startWS: moment.Moment) =>
    //             startWS.isSameOrAfter(earliestAllowed) && startWS.isSameOrBefore(latestAllowedEnd);

    //         const withinAllowed = (ids: string[]) => ids.filter((id) => professionalAllowed.includes(id));

    //         // 1) Snapshot servicios
    //         const tSnap = Date.now();
    //         const servicesSnapshot = await deps.servicesSnapshot.getServicesSnapshotById({
    //             idCompany,
    //             idWorkspace,
    //             attendees: attendees.map((a) => ({ serviceId: a.serviceId })),
    //             requireAll: true,
    //         });

    //         group(`SERVICES SNAPSHOT (${ms(tSnap)})`, () => {
    //             const rows = (attendees ?? []).map((a) => {
    //                 const s = servicesSnapshot[a.serviceId];
    //                 return {
    //                     serviceId: a.serviceId,
    //                     reqDuration: a.durationMin,
    //                     snapDuration: s?.durationMin ?? null,
    //                     maxParticipants: s?.maxParticipants ?? null,
    //                 };
    //             });
    //             table("servicesSnapshot (por attendee)", rows);
    //         });

    //         // No permitir combinar grupales con otros servicios
    //         const hasGroupService = attendees.some((a) => {
    //             const s = servicesSnapshot[a.serviceId];
    //             return s && s.maxParticipants > 1;
    //         });

    //         group("REGLA: no mezclar grupales", () => {
    //             dbg("hasGroupService:", hasGroupService);
    //             dbg("attendees.length:", attendees.length);
    //         });

    //         if (hasGroupService && attendees.length > 1) {
    //             throw new Error("Los servicios grupales no se pueden combinar con otros en la misma reserva.");
    //         }

    //         // 2) Usuarios elegibles por servicio (PARALELO por attendee)
    //         const tElig = Date.now();
    //         const userIdsByServiceEntries = await Promise.all(
    //             attendees.map(async (a) => {
    //                 const svcId = a.serviceId;
    //                 if (!svcId) return [null, []] as const;

    //                 if (a.staffId) {
    //                     const elig = professionalAllowed.includes(a.staffId) ? [a.staffId] : [];
    //                     return [svcId, elig] as const;
    //                 }

    //                 const users = await getUsersWhoCanPerformService_SPECIAL(
    //                     idWorkspace,
    //                     svcId,
    //                     (a as any).categoryId,
    //                     deps.cache
    //                 );

    //                 return [svcId, withinAllowed(users)] as const;
    //             })
    //         );

    //         const userIdsByService = new Map<string, string[]>();
    //         for (const [svcId, ids] of userIdsByServiceEntries) {
    //             if (svcId) userIdsByService.set(svcId, ids as any);
    //         }

    //         const allUserIds = Array.from(new Set(Array.from(userIdsByService.values()).flat()));

    //         group(`ELIGIBILIDAD (${ms(tElig)})`, () => {
    //             const rows = Array.from(userIdsByService.entries()).map(([svcId, ids]) => ({
    //                 serviceId: svcId,
    //                 eligibleCount: ids.length,
    //                 eligibleUserIds: ids.join(", "),
    //             }));
    //             table("eligible users por servicio", rows);

    //             dbg("allUserIds (unique) len:", allUserIds.length);
    //             dbg("allUserIds:", allUserIds);
    //         });

    //         if (allUserIds.length === 0) return { timeSlots: [], dayStatus: "no_staff" };

    //         // 3) Horarios + eventos (+grupo opcional) EN PARALELO
    //         const isSingleService = attendees.length === 1;
    //         let shouldFetchGroupEvents = false;

    //         if (isSingleService) {
    //             const svcReq = attendees[0];
    //             const svcSnap = servicesSnapshot[svcReq.serviceId];
    //             const capacity = Math.max(1, svcSnap?.maxParticipants ?? 1);
    //             shouldFetchGroupEvents = capacity > 1;
    //         }

    //         group("FETCH PLAN", () => {
    //             dbg("isSingleService:", isSingleService);
    //             dbg("shouldFetchGroupEvents:", shouldFetchGroupEvents);
    //             dbg("excludeEventId:", excludeEventId ?? null);
    //         });

    //         const tFetch = Date.now();
    //         const [businessHours, workerHoursMap, temporaryHoursMap, events, groupEventsRaw] = await Promise.all([
    //             deps.businessHoursService.getBusinessHoursFromRedis(idCompany, idWorkspace),
    //             deps.workerHoursService.getWorkerHoursFromRedis(allUserIds, idWorkspace),
    //             deps.temporaryHoursService.getTemporaryHoursFromRedis(allUserIds, idWorkspace, { date }),
    //             getEventsOverlappingRange_SPECIAL(idWorkspace, allUserIds, date, date, excludeEventId),
    //             shouldFetchGroupEvents
    //                 ? this.getGroupEventsWithCounts_SPECIAL(
    //                     idCompany,
    //                     idWorkspace,
    //                     attendees[0].serviceId as string,
    //                     date,
    //                     date,
    //                     excludeEventId
    //                 )
    //                 : Promise.resolve([]),
    //         ]);

    //         group(`FETCH RESULTADOS (${ms(tFetch)})`, () => {
    //             dbg("businessHours:", businessHours ?? null);

    //             // workerHoursMap / temporaryHoursMap suelen ser grandes -> logs resumidos por usuario
    //             const whRows = allUserIds.map((uid) => {
    //                 const wh = (workerHoursMap as any)?.[uid];
    //                 return { userId: uid, hasWorkerHours: !!wh, workerHoursKeys: wh ? Object.keys(wh).join(", ") : "" };
    //             });
    //             table("workerHoursMap (resumen)", whRows);

    //             const thRows = allUserIds.map((uid) => {
    //                 const th = (temporaryHoursMap as any)?.[uid];
    //                 return {
    //                     userId: uid,
    //                     hasTemporaryHours: !!th,
    //                     temporaryCount: Array.isArray(th) ? th.length : th ? Object.keys(th).length : 0,
    //                 };
    //             });
    //             table("temporaryHoursMap (resumen)", thRows);

    //             dbg("events len:", Array.isArray(events) ? events.length : null);
    //             dbg(
    //                 "events sample (first 5):",
    //                 (events ?? []).slice(0, 5).map((e: any) => ({
    //                     idUserPlatformFk: e?.idUserPlatformFk,
    //                     start: e?.startDate,
    //                     end: e?.endDate,
    //                     id: e?.id,
    //                 }))
    //             );

    //             dbg("groupEventsRaw len:", Array.isArray(groupEventsRaw) ? groupEventsRaw.length : null);
    //             dbg(
    //                 "groupEventsRaw sample (first 5):",
    //                 (groupEventsRaw ?? []).slice(0, 5).map((e: any) => ({
    //                     idUserPlatformFk: e?.idUserPlatformFk,
    //                     start: e?.startDate,
    //                     end: e?.endDate,
    //                     participantsCount: e?.participantsCount,
    //                     participantClientIdsLen: e?.participantClientIds?.length ?? 0,
    //                     participantClientWorkspaceIdsLen: e?.participantClientWorkspaceIds?.length ?? 0,
    //                 }))
    //             );
    //         });

    //         // 4) Construir ventanas libres por usuario (USANDO HELPER con fallback por defecto = true)
    //         const weekDay = dayStartLocal.format("dddd").toUpperCase() as Weekday;
    //         const useBizFallback = (BOOKING_PAGE_CONFIG as any)?.resources?.useBusinessHoursAsWorkerFallback ?? true;

    //         group("BUILD SHIFTS PARAMS", () => {
    //             dbg("weekDay:", weekDay);
    //             dbg("useBizFallback:", useBizFallback);
    //         });

    //         const shiftsByUserLocal = buildShiftsByUser_SPECIAL({
    //             userIds: allUserIds,
    //             date,
    //             timeZoneWorkspace,
    //             weekDay,
    //             businessHours,
    //             workerHoursMap,
    //             temporaryHoursMap,
    //             useBizFallback, // ← default true para igualar getAvailableDays
    //         });

    //         group("SHIFTS BUILT (por usuario)", () => {
    //             const rows = allUserIds.map((uid) => {
    //                 const shifts = shiftsByUserLocal?.[uid] ?? [];
    //                 const mins = shifts.reduce((acc: number, s: any) => acc + moment(s.end).diff(moment(s.start), "minutes"), 0);
    //                 return {
    //                     userId: uid,
    //                     shiftsCount: shifts.length,
    //                     totalShiftMin: mins,
    //                     shiftsPreview: shifts
    //                         .slice(0, 3)
    //                         .map((s: any) => `${moment(s.start).tz(timeZoneWorkspace).format("HH:mm")}-${moment(s.end).tz(timeZoneWorkspace).format("HH:mm")}`)
    //                         .join(" | "),
    //                 };
    //             });
    //             table("shiftsByUserLocal", rows);
    //         });

    //         const eventsByUser = groupEventsByUser_SPECIAL(events);

    //         group("EVENTS agrupados por usuario (resumen)", () => {
    //             const rows = allUserIds.map((uid) => ({
    //                 userId: uid,
    //                 busyEventsCount: (eventsByUser?.[uid] ?? []).length,
    //             }));
    //             table("eventsByUser counts", rows);
    //         });

    //         const freeWindowsByUser: Record<string, Array<{ start: moment.Moment; end: moment.Moment }>> = {};

    //         const tFree = Date.now();
    //         for (const uid of allUserIds) {
    //             const busy = (eventsByUser[uid] || []).map((ev: any) => ({
    //                 start: moment(ev.startDate).tz(timeZoneWorkspace),
    //                 end: moment(ev.endDate).tz(timeZoneWorkspace),
    //             }));

    //             const rawShifts = shiftsByUserLocal[uid] || [];
    //             let free: Array<{ start: moment.Moment; end: moment.Moment }> = [];

    //             if (DEBUG) {
    //                 group(`FREE WINDOWS: uid=${uid}`, () => {
    //                     dbg("rawShifts:", rawShifts.map((s: any) => ({ start: fmt(s.start, timeZoneWorkspace), end: fmt(s.end, timeZoneWorkspace) })));
    //                     dbg("busy:", busy.map((b) => ({ start: fmt(b.start, timeZoneWorkspace), end: fmt(b.end, timeZoneWorkspace) })));
    //                 });
    //             }

    //             for (const sh of rawShifts) {
    //                 const startClamped = isToday ? moment.max(sh.start, roundedNow) : sh.start.clone();
    //                 if (!startClamped.isBefore(sh.end)) continue;
    //                 free.push(...subtractBusyFromShift_SPECIAL(startClamped, sh.end, busy));
    //             }

    //             free = mergeTouchingWindows_SPECIAL(free);
    //             freeWindowsByUser[uid] = free;

    //             if (DEBUG) {
    //                 group(`FREE WINDOWS RESULT: uid=${uid}`, () => {
    //                     dbg(
    //                         "free windows:",
    //                         free.map((w) => ({
    //                             start: fmt(w.start, timeZoneWorkspace),
    //                             end: fmt(w.end, timeZoneWorkspace),
    //                             minutes: w.end.diff(w.start, "minutes"),
    //                         }))
    //                     );
    //                     dbg("free total minutes:", free.reduce((acc, w) => acc + w.end.diff(w.start, "minutes"), 0));
    //                 });
    //             }
    //         }

    //         group(`FREE WINDOWS TOTAL (${ms(tFree)})`, () => {
    //             const rows = allUserIds.map((uid) => {
    //                 const wins = freeWindowsByUser[uid] ?? [];
    //                 const mins = wins.reduce((acc, w) => acc + w.end.diff(w.start, "minutes"), 0);
    //                 return {
    //                     userId: uid,
    //                     freeWindowsCount: wins.length,
    //                     freeMinutes: mins,
    //                     preview: wins
    //                         .slice(0, 3)
    //                         .map((w) => `${w.start.clone().tz(timeZoneWorkspace).format("HH:mm")}-${w.end.clone().tz(timeZoneWorkspace).format("HH:mm")}`)
    //                         .join(" | "),
    //                 };
    //             });
    //             table("freeWindowsByUser (resumen)", rows);
    //         });

    //         // 5) Multi-servicio: pruning rápido
    //         if (attendees.length > 1) {
    //             group("PRUNING MULTI-SERVICIO", () => {
    //                 attendees.forEach((a) => {
    //                     const elig = userIdsByService.get(a.serviceId) ?? [];
    //                     const dur = servicesSnapshot[a.serviceId]?.durationMin ?? a.durationMin;
    //                     const okSomeone = elig.some((uid) =>
    //                         (freeWindowsByUser[uid] ?? []).some((w) => w.end.diff(w.start, "minutes") >= (dur ?? 0))
    //                     );
    //                     dbg("serviceId:", a.serviceId, "dur:", dur, "eligibleUsers:", elig.length, "algunoTieneHueco:", okSomeone);
    //                 });
    //             });

    //             for (const a of attendees) {
    //                 const elig = userIdsByService.get(a.serviceId) ?? [];
    //                 const dur = servicesSnapshot[a.serviceId]?.durationMin ?? a.durationMin;
    //                 const algunoTieneHueco = elig.some((uid) =>
    //                     (freeWindowsByUser[uid] ?? []).some((w) => w.end.diff(w.start, "minutes") >= (dur ?? 0))
    //                 );
    //                 if (!algunoTieneHueco) return { timeSlots: [], dayStatus: "no_services" };
    //             }
    //         }

    //         // 6) FAST-PATH: 1 servicio (con soporte grupal)
    //         if (attendees.length === 1) {
    //             const svcReq = attendees[0];
    //             const svcSnap = servicesSnapshot[svcReq.serviceId];
    //             const svcDuration = svcSnap?.durationMin ?? svcReq.durationMin;
    //             const capacity = Math.max(1, svcSnap?.maxParticipants ?? 1);
    //             const isGroup = capacity > 1;

    //             const groupEvents = isGroup ? groupEventsRaw : [];

    //             group("FAST-PATH (1 servicio)", () => {
    //                 dbg("serviceId:", svcReq.serviceId);
    //                 dbg("svcDuration:", svcDuration);
    //                 dbg("capacity:", capacity);
    //                 dbg("isGroup:", isGroup);
    //             });

    //             const groupEventsByUser: Record<string, Array<{ start: moment.Moment; end: moment.Moment }>> = {};
    //             for (const ev of groupEvents as any[]) {
    //                 const u = ev.idUserPlatformFk ?? "";
    //                 if (!u) continue;
    //                 const s = moment(ev.startDate).tz(timeZoneWorkspace).seconds(0).milliseconds(0);
    //                 const e = moment(ev.endDate).tz(timeZoneWorkspace).seconds(0).milliseconds(0);
    //                 (groupEventsByUser[u] ||= []).push({ start: s, end: e });
    //             }

    //             const countIndex = new Map<string, number>();
    //             const membersIndex = new Map<string, Set<string>>();
    //             const keyOf = (userId: string | null | undefined, start: moment.Moment, end: moment.Moment) =>
    //                 `${userId ?? ""}|${start.format("YYYY-MM-DDTHH:mm:ss")}|${end.format("YYYY-MM-DDTHH:mm:ss")}`;

    //             for (const ev of groupEvents as any[]) {
    //                 const s = moment(ev.startDate).tz(timeZoneWorkspace).seconds(0).milliseconds(0);
    //                 const e = moment(ev.endDate).tz(timeZoneWorkspace).seconds(0).milliseconds(0);
    //                 const k = keyOf(ev.idUserPlatformFk, s, e);
    //                 countIndex.set(k, ev.participantsCount);

    //                 const set = new Set<string>();
    //                 ev.participantClientIds?.forEach((id: string) => set.add(id));
    //                 ev.participantClientWorkspaceIds?.forEach((id: string) => set.add(id));
    //                 membersIndex.set(k, set);
    //             }

    //             group("GRUPO (índices)", () => {
    //                 dbg("groupEvents len:", groupEvents.length);
    //                 dbg("countIndex size:", countIndex.size);
    //                 dbg("membersIndex size:", membersIndex.size);
    //                 dbg("groupEventsByUser keys:", Object.keys(groupEventsByUser));
    //             });

    //             const eligible = userIdsByService.get(svcReq.serviceId) ?? [];
    //             const rawSlots: TimeSlotSpecial[] = [];

    //             group("ELIGIBLE USERS (FAST-PATH)", () => {
    //                 dbg("eligible len:", eligible.length);
    //                 dbg("eligible:", eligible);
    //             });

    //             let iterTotalCandidates = 0;
    //             let iterFilteredByWindow = 0;

    //             for (const uid of eligible) {
    //                 const baseWins = freeWindowsByUser[uid] ?? [];
    //                 const addWinsRaw = isGroup ? groupEventsByUser[uid] ?? [] : [];
    //                 const addWins = addWinsRaw
    //                     .map((w) => {
    //                         const startClamped = isToday ? moment.max(w.start, roundedNow) : w.start;
    //                         return startClamped.isBefore(w.end) ? { start: startClamped, end: w.end } : null;
    //                     })
    //                     .filter(Boolean) as Array<{ start: moment.Moment; end: moment.Moment }>;

    //                 const wins =
    //                     isGroup && addWins.length ? mergeTouchingWindows_SPECIAL([...baseWins, ...addWins]) : baseWins;

    //                 if (DEBUG) {
    //                     group(`WINS uid=${uid}`, () => {
    //                         dbg("baseWins:", baseWins.map((w) => ({ start: fmt(w.start, timeZoneWorkspace), end: fmt(w.end, timeZoneWorkspace) })));
    //                         dbg("addWins:", addWins.map((w) => ({ start: fmt(w.start, timeZoneWorkspace), end: fmt(w.end, timeZoneWorkspace) })));
    //                         dbg("wins(merged):", wins.map((w) => ({ start: fmt(w.start, timeZoneWorkspace), end: fmt(w.end, timeZoneWorkspace) })));
    //                     });
    //                 }

    //                 for (const w of wins) {
    //                     const latestStart = w.end.clone().subtract(svcDuration, "minutes");
    //                     let cur = alignToGridCeil_SPECIAL(
    //                         moment.max(w.start, dayStartLocal.clone().startOf("day")),
    //                         stepMinutes,
    //                         gridOrigin
    //                     );

    //                     if (DEBUG) {
    //                         group(`SCAN uid=${uid}`, () => {
    //                             dbg("window:", { start: fmt(w.start, timeZoneWorkspace), end: fmt(w.end, timeZoneWorkspace) });
    //                             dbg("latestStart:", fmt(latestStart, timeZoneWorkspace));
    //                             dbg("cur (aligned start):", fmt(cur, timeZoneWorkspace));
    //                             dbg("withinBookingWindow(cur):", withinBookingWindow(cur));
    //                         });
    //                     }

    //                     let localLoop = 0;

    //                     while (cur.isSameOrBefore(latestStart)) {
    //                         iterTotalCandidates++;

    //                         if (!withinBookingWindow(cur)) {
    //                             iterFilteredByWindow++;
    //                             cur.add(stepMinutes, "minutes");
    //                             continue;
    //                         }

    //                         const end = cur.clone().add(svcDuration, "minutes");

    //                         if (isGroup) {
    //                             const k = keyOf(uid, cur, end);
    //                             const booked = countIndex.get(k) ?? 0;
    //                             const left = Math.max(0, capacity - booked);

    //                             const members = membersIndex.get(k);
    //                             const clientAlreadyInGroup = !!(idClient && members && members.has(idClient));

    //                             if (DEBUG && localLoop < 8) {
    //                                 dbg("slotCandidate(group)", {
    //                                     uid,
    //                                     startWS: cur.format("HH:mm"),
    //                                     endWS: end.format("HH:mm"),
    //                                     booked,
    //                                     capacity,
    //                                     left,
    //                                     clientAlreadyInGroup,
    //                                 });
    //                             }

    //                             if (left > 0 && !clientAlreadyInGroup) {
    //                                 rawSlots.push({
    //                                     startLocalISO: cur.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
    //                                     endLocalISO: end.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
    //                                     label: cur.clone().tz(timeZoneClient).format("HH:mm"),
    //                                     labelParticipant: `${booked} / ${capacity}`,
    //                                 });
    //                             }
    //                         } else {
    //                             if (DEBUG && localLoop < 8) {
    //                                 dbg("slotCandidate(single)", {
    //                                     uid,
    //                                     startWS: cur.format("HH:mm"),
    //                                     endWS: end.format("HH:mm"),
    //                                 });
    //                             }

    //                             rawSlots.push({
    //                                 startLocalISO: cur.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
    //                                 endLocalISO: end.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
    //                                 label: cur.clone().tz(timeZoneClient).format("HH:mm"),
    //                                 labelParticipant: null,
    //                             });
    //                         }

    //                         cur.add(stepMinutes, "minutes");
    //                         localLoop++;
    //                     }
    //                 }
    //             }

    //             const timeSlots = dedupeAndSortSlots_SPECIAL(rawSlots);

    //             group("FAST-PATH RESULT", () => {
    //                 dbg("iterTotalCandidates:", iterTotalCandidates);
    //                 dbg("iterFilteredByWindow:", iterFilteredByWindow);
    //                 dbg("rawSlots len:", rawSlots.length);
    //                 dbg("timeSlots len:", timeSlots.length);
    //                 dbg("timeSlots sample (first 15):", timeSlots.slice(0, 15));
    //             });

    //             return { timeSlots, dayStatus: timeSlots.length > 0 ? "available" : "completed" };
    //         }

    //         // 7) Multi-servicio (igual que antes, usando freeWindowsByUser), con rejilla global y dedupe
    //         const totalDuration = attendees.reduce(
    //             (acc, a) => acc + (servicesSnapshot[a.serviceId]?.durationMin ?? a.durationMin),
    //             0
    //         );

    //         const seedService = attendees[0];
    //         const seedElig = userIdsByService.get(seedService.serviceId) ?? [];
    //         const candidateKeys = new Set<string>();
    //         const latestStart = dayEndLocal.clone().subtract(totalDuration, "minutes");

    //         group("MULTI-SERVICIO: CANDIDATOS (seed)", () => {
    //             dbg("totalDuration:", totalDuration);
    //             dbg("seedService:", seedService.serviceId);
    //             dbg("seedElig len:", seedElig.length);
    //             dbg("latestStart:", fmt(latestStart, timeZoneWorkspace));
    //         });

    //         for (const uid of seedElig) {
    //             const wins = freeWindowsByUser[uid] ?? [];
    //             for (const w of wins) {
    //                 const s0 = moment.max(w.start, dayStartLocal).clone().seconds(0).milliseconds(0);
    //                 const e0 = moment.min(w.end, latestStart).clone().seconds(0).milliseconds(0);
    //                 if (!s0.isBefore(e0)) continue;

    //                 let cur = alignToGridCeil_SPECIAL(s0, stepMinutes, gridOrigin);
    //                 while (!cur.isAfter(e0)) {
    //                     candidateKeys.add(cur.format("YYYY-MM-DDTHH:mm:ss"));
    //                     cur.add(stepMinutes, "minutes");
    //                 }
    //             }
    //         }

    //         const candidates = Array.from(candidateKeys)
    //             .map((k) => moment.tz(k, "YYYY-MM-DDTHH:mm:ss", timeZoneWorkspace))
    //             .sort((a, b) => a.valueOf() - b.valueOf());

    //         group("MULTI-SERVICIO: CANDIDATOS (resumen)", () => {
    //             dbg("candidateKeys size:", candidateKeys.size);
    //             dbg("candidates len:", candidates.length);
    //             dbg(
    //                 "candidates sample (first 20):",
    //                 candidates.slice(0, 20).map((m) => m.format("HH:mm"))
    //             );
    //         });

    //         const timeSlotsRaw: TimeSlotSpecial[] = [];
    //         const eligibleUsersByService: Record<string, string[]> = {};
    //         for (const a of attendees) eligibleUsersByService[a.serviceId] = userIdsByService.get(a.serviceId) ?? [];

    //         group("eligibleUsersByService (multi)", () => {
    //             const rows = Object.entries(eligibleUsersByService).map(([svc, ids]) => ({
    //                 serviceId: svc,
    //                 eligibleCount: ids.length,
    //                 eligible: ids.join(", "),
    //             }));
    //             table("eligibleUsersByService", rows);
    //         });

    //         let assignAttempts = 0;
    //         let assignOk = 0;
    //         let filteredByBookingWindow = 0;

    //         for (const start of candidates) {
    //             if (!withinBookingWindow(start)) {
    //                 filteredByBookingWindow++;
    //                 continue;
    //             }

    //             assignAttempts++;

    //             const assignment: Array<{
    //                 serviceId: string;
    //                 userId: string;
    //                 start: moment.Moment;
    //                 end: moment.Moment;
    //             }> = [];

    //             const attendeesWithRealDur = attendees.map((a) => ({
    //                 serviceId: a.serviceId,
    //                 durationMin: servicesSnapshot[a.serviceId]?.durationMin ?? a.durationMin,
    //             }));

    //             const ok = assignSequentially_SPECIAL({
    //                 idx: 0,
    //                 start,
    //                 attendees: attendeesWithRealDur,
    //                 eligibleUsersByService,
    //                 freeWindowsByUser,
    //                 usedByUserAt: [],
    //                 assignment,
    //             });

    //             if (ok) {
    //                 assignOk++;
    //                 const end = start.clone().add(totalDuration, "minutes");
    //                 timeSlotsRaw.push({
    //                     startLocalISO: start.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
    //                     endLocalISO: end.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
    //                     label: start.clone().tz(timeZoneClient).format("HH:mm"),
    //                     labelParticipant: null,
    //                 });

    //                 if (DEBUG && assignOk <= 8) {
    //                     dbg("ASSIGN OK sample", {
    //                         startWS: start.clone().tz(timeZoneWorkspace).format("HH:mm"),
    //                         endWS: end.clone().tz(timeZoneWorkspace).format("HH:mm"),
    //                         assignment: assignment.map((x) => ({
    //                             serviceId: x.serviceId,
    //                             userId: x.userId,
    //                             start: x.start.clone().tz(timeZoneWorkspace).format("HH:mm"),
    //                             end: x.end.clone().tz(timeZoneWorkspace).format("HH:mm"),
    //                         })),
    //                     });
    //                 }
    //             } else {
    //                 if (DEBUG && assignAttempts <= 8) {
    //                     dbg("ASSIGN FAIL sample", { startWS: start.clone().tz(timeZoneWorkspace).format("HH:mm") });
    //                 }
    //             }
    //         }

    //         const timeSlots = dedupeAndSortSlots_SPECIAL(timeSlotsRaw);

    //         group("MULTI-SERVICIO RESULT", () => {
    //             dbg("filteredByBookingWindow:", filteredByBookingWindow);
    //             dbg("assignAttempts:", assignAttempts);
    //             dbg("assignOk:", assignOk);
    //             dbg("timeSlotsRaw len:", timeSlotsRaw.length);
    //             dbg("timeSlots len:", timeSlots.length);
    //             dbg("timeSlots sample (first 20):", timeSlots.slice(0, 20));
    //             dbg(`TOTAL (${ms(tAll)})`);
    //         });

    //         return { timeSlots, dayStatus: timeSlots.length > 0 ? "available" : "completed" };
    //     } catch (error: any) {
    //         // Extra: log del error con contexto mínimo para que no “se pierda”
    //         try {
    //             // eslint-disable-next-line no-console
    //             console.error(`[${traceId}] ERROR publicGetAvailableTimeSlots_SPECIAL`, {
    //                 message: error?.message,
    //                 stack: error?.stack,
    //                 input: {
    //                     idCompany: input?.idCompany,
    //                     idWorkspace: input?.idWorkspace,
    //                     date: input?.date,
    //                     timeZoneWorkspace: input?.timeZoneWorkspace,
    //                     timeZoneClient: input?.timeZoneClient,
    //                     attendees: (input?.attendees ?? []).map((a: any) => ({
    //                         serviceId: a?.serviceId,
    //                         durationMin: a?.durationMin,
    //                         staffId: a?.staffId ?? null,
    //                         categoryId: a?.categoryId ?? null,
    //                     })),
    //                 },
    //             });
    //         } catch {
    //             // noop
    //         }
    //         throw new CustomError("EventTimesService.publicGetAvailableTimeSlots_SPECIAL", error);
    //     }
    // }


}

