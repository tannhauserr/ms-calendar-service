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


    // // ────────────────────────────────────────────────────────────
    // // publicGetAvailableTimeSlots_SPECIAL (versión alineada con getAvailableDays)
    // // ────────────────────────────────────────────────────────────
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

    //     try {
    //         console.log("[publicGetAvailableTimeSlots_SPECIAL] called", {
    //             date,
    //             attendees: attendees.map((a) => a.serviceId),
    //         });

    //         const BOOKING_PAGE_CONFIG: OnlineBookingConfig = deps.bookingConfig;

    //         console.log("mira booking page config en time slots", BOOKING_PAGE_CONFIG);
    //         console.log(`${CONSOLE_COLOR.BgMagenta} [Resources]`, JSON.stringify(BOOKING_PAGE_CONFIG.resources), `${CONSOLE_COLOR.Reset}`);

    //         // Booking window (con defaults seguros)
    //         const { maxAdvanceDays = 60, minLeadTimeMin = 60 } =
    //             BOOKING_PAGE_CONFIG.bookingWindow ?? {};

    //         const alignMode: "clock" | "service" =
    //             BOOKING_PAGE_CONFIG.slot?.alignMode === "service" ? "service" : "clock";

    //         const intervalMinutes =
    //             alignMode === "service"
    //                 ? attendees?.reduce((acc, a) => acc + (a.durationMin ?? 0), 0)
    //                 : BOOKING_PAGE_CONFIG?.slot?.stepMinutes;

    //         const professionalAllowed =
    //             BOOKING_PAGE_CONFIG?.resources?.ids?.map((r) =>
    //                 Array.isArray(r) ? r?.[0] : r
    //             ) ?? [];

    //         // Validaciones rápidas
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

    //         // Día pasado (en TZ negocio) → vacío
    //         const todayLocal = moment().tz(timeZoneWorkspace).startOf("day");
    //         if (dayStartLocal.clone().startOf("day").isBefore(todayLocal, "day")) {
    //             return { timeSlots: [], dayStatus: "past" };
    //         }

    //         const dayEndLocal = dayStartLocal.clone().endOf("day");
    //         const gridOrigin = dayStartLocal.clone().startOf("day"); // Rejilla global del día

    //         // Ventana absoluta permitida (TZ negocio)
    //         const nowWS = moment.tz(timeZoneWorkspace);
    //         const earliestAllowed = nowWS.clone().add(minLeadTimeMin, "minutes").seconds(0).milliseconds(0);
    //         const latestAllowedEnd = nowWS.clone().add(maxAdvanceDays, "days").endOf("day");

    //         // Cortes rápidos por día completo
    //         if (dayStartLocal.isAfter(latestAllowedEnd)) return { timeSlots: [], dayStatus: "out_of_window" };
    //         if (dayEndLocal.isBefore(earliestAllowed)) return { timeSlots: [], dayStatus: "out_of_window" };

    //         const withinBookingWindow = (startWS: moment.Moment) =>
    //             startWS.isSameOrAfter(earliestAllowed) && startWS.isSameOrBefore(latestAllowedEnd);

    //         const withinAllowed = (ids: string[]) => ids.filter((id) => professionalAllowed.includes(id));

    //         // 1) Snapshot servicios
    //         const servicesSnapshot = await deps.servicesSnapshot.getServicesSnapshotById({
    //             idCompany,
    //             idWorkspace,
    //             attendees: attendees.map((a) => ({ serviceId: a.serviceId })),
    //             requireAll: true,
    //         });

    //         // No permitir combinar grupales con otros servicios
    //         const hasGroupService = attendees.some((a) => {
    //             const s = servicesSnapshot[a.serviceId];
    //             return s && s.maxParticipants > 1;
    //         });
    //         if (hasGroupService && attendees.length > 1) {
    //             throw new Error("Los servicios grupales no se pueden combinar con otros en la misma reserva.");
    //         }

    //         // 2) Usuarios elegibles por servicio (PARALELO por attendee)
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
    //                     a.categoryId,
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

    //         const [
    //             businessHours,
    //             workerHoursMap,
    //             temporaryHoursMap,
    //             events,
    //             groupEventsRaw,
    //         ] = await Promise.all([
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

    //         // 4) Construir ventanas libres por usuario (USANDO HELPER con fallback por defecto = true)
    //         const weekDay = dayStartLocal.format("dddd").toUpperCase() as Weekday;
    //         const useBizFallback =
    //             (BOOKING_PAGE_CONFIG as any)?.resources?.useBusinessHoursAsWorkerFallback ?? true;

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

    //         const eventsByUser = groupEventsByUser_SPECIAL(events);
    //         const freeWindowsByUser: Record<string, Array<{ start: moment.Moment; end: moment.Moment }>> = {};

    //         for (const uid of allUserIds) {
    //             const busy = (eventsByUser[uid] || []).map((ev) => ({
    //                 start: moment(ev.startDate).tz(timeZoneWorkspace),
    //                 end: moment(ev.endDate).tz(timeZoneWorkspace),
    //             }));

    //             const rawShifts = shiftsByUserLocal[uid] || [];
    //             let free: Array<{ start: moment.Moment; end: moment.Moment }> = [];

    //             for (const sh of rawShifts) {
    //                 const startClamped = isToday ? moment.max(sh.start, roundedNow) : sh.start.clone();
    //                 if (!startClamped.isBefore(sh.end)) continue;
    //                 free.push(...subtractBusyFromShift_SPECIAL(startClamped, sh.end, busy));
    //             }

    //             free = mergeTouchingWindows_SPECIAL(free);
    //             freeWindowsByUser[uid] = free;
    //         }

    //         // 5) Multi-servicio: pruning rápido
    //         if (attendees.length > 1) {
    //             for (const a of attendees) {
    //                 const elig = userIdsByService.get(a.serviceId) ?? [];
    //                 const dur = servicesSnapshot[a.serviceId]?.durationMin ?? a.durationMin;
    //                 const algunoTieneHueco = elig.some((uid) =>
    //                     (freeWindowsByUser[uid] ?? []).some((w) => w.end.diff(w.start, "minutes") >= dur)
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

    //             const groupEventsByUser: Record<string, Array<{ start: moment.Moment; end: moment.Moment }>> =
    //                 {};
    //             for (const ev of groupEvents) {
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

    //             for (const ev of groupEvents) {
    //                 const s = moment(ev.startDate).tz(timeZoneWorkspace).seconds(0).milliseconds(0);
    //                 const e = moment(ev.endDate).tz(timeZoneWorkspace).seconds(0).milliseconds(0);
    //                 const k = keyOf(ev.idUserPlatformFk, s, e);
    //                 countIndex.set(k, ev.participantsCount);
    //                 const set = new Set<string>();
    //                 ev.participantClientIds.forEach((id) => set.add(id));
    //                 ev.participantClientWorkspaceIds.forEach((id) => set.add(id));
    //                 membersIndex.set(k, set);
    //             }

    //             const eligible = userIdsByService.get(svcReq.serviceId) ?? [];
    //             const rawSlots: TimeSlotSpecial[] = [];

    //             for (const uid of eligible) {
    //                 const baseWins = freeWindowsByUser[uid] ?? [];
    //                 const addWinsRaw = isGroup ? groupEventsByUser[uid] ?? [] : [];
    //                 const addWins = addWinsRaw
    //                     .map((w) => {
    //                         const startClamped = isToday ? moment.max(w.start, roundedNow) : w.start;
    //                         return startClamped.isBefore(w.end) ? { start: startClamped, end: w.end } : null;
    //                     })
    //                     .filter(Boolean) as Array<{ start: moment.Moment; end: moment.Moment }>;

    //                 const wins = isGroup && addWins.length ? mergeTouchingWindows_SPECIAL([...baseWins, ...addWins]) : baseWins;

    //                 for (const w of wins) {
    //                     const latestStart = w.end.clone().subtract(svcDuration, "minutes");
    //                     let cur = alignToGridCeil_SPECIAL(
    //                         moment.max(w.start, dayStartLocal.clone().startOf("day")),
    //                         stepMinutes,
    //                         gridOrigin
    //                     );

    //                     while (cur.isSameOrBefore(latestStart)) {
    //                         if (!withinBookingWindow(cur)) {
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

    //                             if (left > 0 && !clientAlreadyInGroup) {
    //                                 rawSlots.push({
    //                                     startLocalISO: cur.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
    //                                     endLocalISO: end.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
    //                                     label: cur.clone().tz(timeZoneClient).format("HH:mm"),
    //                                     labelParticipant: `${booked} / ${capacity}`,
    //                                 });
    //                             }
    //                         } else {
    //                             rawSlots.push({
    //                                 startLocalISO: cur.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
    //                                 endLocalISO: end.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
    //                                 label: cur.clone().tz(timeZoneClient).format("HH:mm"),
    //                                 labelParticipant: null,
    //                             });
    //                         }

    //                         cur.add(stepMinutes, "minutes");
    //                     }
    //                 }
    //             }

    //             const timeSlots = dedupeAndSortSlots_SPECIAL(rawSlots);

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

    //         const timeSlotsRaw: TimeSlotSpecial[] = [];
    //         const eligibleUsersByService: Record<string, string[]> = {};
    //         for (const a of attendees)
    //             eligibleUsersByService[a.serviceId] = userIdsByService.get(a.serviceId) ?? [];

    //         for (const start of candidates) {
    //             if (!withinBookingWindow(start)) continue;

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
    //                 const end = start.clone().add(totalDuration, "minutes");
    //                 timeSlotsRaw.push({
    //                     startLocalISO: start.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
    //                     endLocalISO: end.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
    //                     label: start.clone().tz(timeZoneClient).format("HH:mm"),
    //                     labelParticipant: null,
    //                 });
    //             }
    //         }

    //         const timeSlots = dedupeAndSortSlots_SPECIAL(timeSlotsRaw);
    //         return { timeSlots, dayStatus: timeSlots.length > 0 ? "available" : "completed" };
    //     } catch (error: any) {
    //         throw new CustomError("EventTimesService.publicGetAvailableTimeSlots_SPECIAL", error);
    //     }
    // }

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


        console.log("mira attendees en time slots", attendees);
        console.log("mira attendees en time slots", attendees);
        console.log("mira attendees en time slots", attendees);
        console.log("mira attendees en time slots", attendees);
        console.log("mira attendees en time slots", attendees);
        console.log("mira attendees en time slots", attendees);
        console.log("mira attendees en time slots", attendees);


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


}
