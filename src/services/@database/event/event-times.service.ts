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
    assignSequentially_SPECIAL
} from "./availability-special.service";
import CustomError from "../../../models/custom-error/CustomError";
import { OnlineBookingConfig } from "../../@redis/cache/interfaces/models/booking-config";
import { a } from "@react-spring/web";

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
   Service con soporte grupal (conteo + miembros)
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
        const calendar = await prisma.calendar.findFirst({
            where: { idCompanyFk: idCompany, idWorkspaceFk: idWorkspace, deletedDate: null },
            select: { id: true },
        });
        if (!calendar) return [];

        const parseStart = (s: string) =>
            s.length > 10 ? moment.utc(s) : moment.utc(s, "YYYY-MM-DD").startOf("day");
        const parseEnd = (s: string) =>
            s.length > 10 ? moment.utc(s) : moment.utc(s, "YYYY-MM-DD").endOf("day");

        const start = parseStart(startISOOrDay).toDate();
        const end = parseEnd(endISOOrDay).toDate();

        const events = await prisma.event.findMany({
            where: {
                idCalendarFk: calendar.id,
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
                eventParticipant: {
                    where: { deletedDate: null },
                    select: { idClientFk: true, idClientWorkspaceFk: true },
                },
            },
        });

        return events.map(ev => ({
            id: ev.id,
            idUserPlatformFk: ev.idUserPlatformFk,
            startDate: ev.startDate,
            endDate: ev.endDate,
            participantClientIds: ev.eventParticipant.map(p => p.idClientFk).filter((x): x is string => !!x),
            participantClientWorkspaceIds: ev.eventParticipant.map(p => p.idClientWorkspaceFk).filter((x): x is string => !!x),
            participantsCount: ev.eventParticipant.length,
        }));
    }

    /* ────────────────────────────────────────────────────────────
       FUNCIÓN PRINCIPAL: ahora con soporte grupal real
    ────────────────────────────────────────────────────────────── */
    // async publicGetAvailableTimeSlots_SPECIAL(
    //     input: GetTimeSlotsInputSpecial,
    //     deps: AvailabilityDepsSpecial
    // ): Promise<{ timeSlots: TimeSlotSpecial[] }> {
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

    //         const BOOKING_PAGE_CONFIG: OnlineBookingConfig = deps.bookingConfig;

    //         const { maxAdvanceDays = 60, minLeadTimeMin = 60 } = BOOKING_PAGE_CONFIG.bookingWindow;

    //         const alignMode: "clock" | "service" = BOOKING_PAGE_CONFIG.slot?.alignMode === "service" ? "service" : "clock";
    //         const intervalMinutes =
    //             alignMode === "service"
    //                 ? attendees?.reduce((acc, a) => acc + (a.durationMin ?? 0), 0)
    //                 : BOOKING_PAGE_CONFIG?.slot?.stepMinutes;

    //         const professionalAllowed = BOOKING_PAGE_CONFIG?.resources?.ids
    //             ?.map(r => Array.isArray(r) ? r?.[0] : r) ?? [];

    //         console.log("que es intervalMinutes", intervalMinutes)


    //         if (!idCompany || !idWorkspace) throw new Error("Faltan idCompany / idWorkspace");
    //         if (!timeZoneWorkspace) throw new Error("Falta timeZoneWorkspace");
    //         if (!timeZoneClient) throw new Error("Falta timeZoneClient");
    //         if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("date inválido");
    //         if (!Array.isArray(attendees) || attendees.length === 0) return { timeSlots: [] };
    //         if (professionalAllowed.length === 0) return { timeSlots: [] };


    //         // Snapshot servicios (duración/capacidad)
    //         const servicesSnapshot = await deps.servicesSnapshot.getServicesSnapshotById({
    //             idCompany,
    //             idWorkspace,
    //             attendees: attendees.map(a => ({ serviceId: a.serviceId })),
    //             requireAll: true,
    //         });


    //         // No permitir combinar grupales con otros servicios
    //         const hasGroupService = attendees.some(a => {
    //             const s = servicesSnapshot[a.serviceId];
    //             return s && s.maxParticipants > 1;
    //         });
    //         if (hasGroupService && attendees.length > 1) {
    //             throw new Error("Los servicios grupales no se pueden combinar con otros en la misma reserva.");
    //         }



    //         // Step / HOY
    //         // const alignMode: "service" = "service";
    //         // const alignMode: "clock" | "service" = bookingConfig.slot?.alignMode === "service" ? "service" : "clock";
    //         const dayStartLocal = moment.tz(`${date}T00:00:00`, "YYYY-MM-DDTHH:mm:ss", timeZoneWorkspace);
    //         const { stepMinutes, roundedNow, isToday } = computeSlotConfig({
    //             intervalMinutes,
    //             timeZoneWorkspace,
    //             dayStartLocal,
    //         });

    //         // Día pasado (en TZ negocio) → vacío
    //         const todayLocal = moment().tz(timeZoneWorkspace).startOf("day");
    //         if (dayStartLocal.clone().startOf("day").isBefore(todayLocal, "day")) {
    //             return { timeSlots: [] };
    //         }
    //         const dayEndLocal = dayStartLocal.clone().endOf("day");

    //         // Filtrado de profesionales permitidos (si viene idClient)
    //         const withinAllowed = (ids: string[]) =>
    //             ids.filter(id => professionalAllowed.includes(id));

    //         // Elegibles por servicio
    //         const userIdsByService = new Map<string, string[]>();
    //         for (const a of attendees) {
    //             if (a.staffId) {
    //                 const elig = professionalAllowed.includes(a.staffId) ? [a.staffId] : [];
    //                 userIdsByService.set(a.serviceId, elig);
    //                 // userIdsByService.set(a.serviceId, [a.staffId]);
    //             } else {
    //                 const users = await getUsersWhoCanPerformService_SPECIAL(
    //                     idWorkspace,
    //                     a.serviceId,
    //                     a.categoryId,
    //                     deps.cache
    //                 );
    //                 // userIdsByService.set(a.serviceId, users);
    //                 userIdsByService.set(a.serviceId, withinAllowed(users));
    //             }
    //         }
    //         const allUserIds = Array.from(new Set(Array.from(userIdsByService.values()).flat()));
    //         if (allUserIds.length === 0) return { timeSlots: [] };

    //         // Reglas/turnos
    //         const businessHours = await deps.businessHoursService.getBusinessHoursFromRedis(idCompany, idWorkspace);
    //         const workerHoursMap = await deps.workerHoursService.getWorkerHoursFromRedis(allUserIds, idWorkspace);
    //         const temporaryHoursMap = await deps.temporaryHoursService.getTemporaryHoursFromRedis(allUserIds, idWorkspace, { date });

    //         // Eventos del día (para ocupar ventanas)
    //         const events = await getEventsOverlappingRange_SPECIAL(allUserIds, date, date, excludeEventId);

    //         // Ventanas libres por usuario
    //         const weekDay = dayStartLocal.format("dddd").toUpperCase() as Weekday;
    //         const bizShifts: string[][] = (() => {
    //             const biz = (businessHours as any)?.[weekDay];
    //             return biz === null ? [] : Array.isArray(biz) ? biz : [];
    //         })();

    //         const shiftsByUserLocal: Record<string, Array<{ start: moment.Moment; end: moment.Moment }>> = {};
    //         for (const uid of allUserIds) {
    //             let workShifts: string[][] = [];
    //             const tmp = (temporaryHoursMap as any)?.[uid]?.[date];

    //             if (tmp === null) workShifts = [];
    //             else if (Array.isArray(tmp) && tmp.length > 0) workShifts = tmp;
    //             else {
    //                 const workerDay = (workerHoursMap as any)?.[uid]?.[weekDay];
    //                 if (workerDay === null) workShifts = [];
    //                 else if (Array.isArray(workerDay) && workerDay.length > 0) workShifts = workerDay;
    //                 else workShifts = bizShifts;
    //             }

    //             shiftsByUserLocal[uid] = (workShifts || []).map(([s, e]) => ({
    //                 start: moment.tz(`${date}T${s}`, "YYYY-MM-DDTHH:mm:ss", timeZoneWorkspace),
    //                 end: moment.tz(`${date}T${e}`, "YYYY-MM-DDTHH:mm:ss", timeZoneWorkspace),
    //             }));
    //         }

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

    //         // // Pruning simple por duración
    //         // for (const a of attendees) {
    //         //     const elig = userIdsByService.get(a.serviceId) ?? [];
    //         //     const dur = servicesSnapshot[a.serviceId]?.durationMin ?? a.durationMin;
    //         //     const algunoTieneHueco = elig.some((uid) =>
    //         //         (freeWindowsByUser[uid] ?? []).some((w) => w.end.diff(w.start, "minutes") >= dur)
    //         //     );
    //         //     if (!algunoTieneHueco) return { timeSlots: [] };
    //         // }

    //         // Pruning simple por duración
    //         // 👉 Solo aplica cuando hay MULTI-servicio.
    //         // En single-servicio (incluye grupos) lo calculamos en el fast-path y
    //         // no debemos cortar aquí porque los eventos grupales existentes se
    //         // reinsertan más adelante.
    //         if (attendees.length > 1) {
    //             for (const a of attendees) {
    //                 const elig = userIdsByService.get(a.serviceId) ?? [];
    //                 const dur = servicesSnapshot[a.serviceId]?.durationMin ?? a.durationMin;
    //                 const algunoTieneHueco = elig.some((uid) =>
    //                     (freeWindowsByUser[uid] ?? []).some(
    //                         (w) => w.end.diff(w.start, "minutes") >= dur
    //                     )
    //                 );
    //                 if (!algunoTieneHueco) return { timeSlots: [] };
    //             }
    //         }

    //         /* ────────────────────────────────────────────────────────
    //            FAST-PATH: 1 servicio (soporta grupo)
    //         ───────────────────────────────────────────────────────── */
    //         if (attendees.length === 1) {
    //             const svcReq = attendees[0];
    //             const svcSnap = servicesSnapshot[svcReq.serviceId];
    //             const svcDuration = svcSnap?.durationMin ?? svcReq.durationMin;
    //             const capacity = Math.max(1, svcSnap?.maxParticipants ?? 1);
    //             const isGroup = capacity > 1;

    //             // Carga de eventos del servicio con conteo y miembros (para el día)
    //             const groupEvents = isGroup
    //                 ? await this.getGroupEventsWithCounts_SPECIAL(
    //                     idCompany,
    //                     idWorkspace,
    //                     svcReq.serviceId,
    //                     date,
    //                     date,
    //                     excludeEventId
    //                 )
    //                 : [];

    //             // Indexamos por user las ventanas exactas de los eventos de grupo
    //             const groupEventsByUser: Record<string, Array<{ start: moment.Moment; end: moment.Moment }>> = {};
    //             for (const ev of groupEvents) {
    //                 const u = ev.idUserPlatformFk ?? "";
    //                 if (!u) continue; // si no hay user asignado, no podemos reinsertar en un staff concreto
    //                 const s = moment(ev.startDate).tz(timeZoneWorkspace).seconds(0).milliseconds(0);
    //                 const e = moment(ev.endDate).tz(timeZoneWorkspace).seconds(0).milliseconds(0);
    //                 (groupEventsByUser[u] ||= []).push({ start: s, end: e });
    //             }

    //             // Índices de ocupación y miembros por slot exacto (user + start + end)
    //             const countIndex = new Map<string, number>();
    //             const membersIndex = new Map<string, Set<string>>();
    //             const keyOf = (
    //                 userId: string | null | undefined,
    //                 start: moment.Moment,
    //                 end: moment.Moment
    //             ) => `${userId ?? ""}|${start.format("YYYY-MM-DDTHH:mm:ss")}|${end.format("YYYY-MM-DDTHH:mm:ss")}`;

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

    //             // Helper: ceil al step
    //             // const ceilToStep = (m: moment.Moment, step: number) => {
    //             //     const x = m.clone().seconds(0).milliseconds(0);
    //             //     const r = x.minute() % step;
    //             //     if (r !== 0) x.add(step - r, "minutes");
    //             //     return x;
    //             // };

    //             const ceilToStep = (m: moment.Moment, step: number, origin: moment.Moment) => {
    //                 const ref = origin.clone().seconds(0).milliseconds(0);
    //                 const diffMin = Math.max(0, Math.floor((m.valueOf() - ref.valueOf()) / 60000)); // minutos desde origin
    //                 const rem = diffMin % step;
    //                 const add = rem === 0 ? 0 : step - rem;
    //                 return m.clone().add(add, "minutes").seconds(0).milliseconds(0);
    //             };

    //             const eligible = userIdsByService.get(svcReq.serviceId) ?? [];
    //             const timeSlots: TimeSlotSpecial[] = [];

    //             for (const uid of eligible) {
    //                 // Reinsertamos ventanas de los eventos grupales existentes para ese user
    //                 const baseWins = freeWindowsByUser[uid] ?? [];
    //                 const addWinsRaw = isGroup ? groupEventsByUser[uid] ?? [] : [];
    //                 const addWins = addWinsRaw
    //                     .map((w) => {
    //                         const startClamped = isToday ? moment.max(w.start, roundedNow) : w.start;
    //                         return startClamped.isBefore(w.end) ? { start: startClamped, end: w.end } : null;
    //                     })
    //                     .filter(Boolean) as Array<{ start: moment.Moment; end: moment.Moment }>;

    //                 const wins =
    //                     isGroup && addWins.length
    //                         ? mergeTouchingWindows_SPECIAL([...baseWins, ...addWins])
    //                         : baseWins;

    //                 for (const w of wins) {
    //                     const latestStart = w.end.clone().subtract(svcDuration, "minutes");
    //                     // let cur = ceilToStep(moment.max(w.start, dayStartLocal.clone().startOf("day")), stepMinutes);
    //                     let cur = ceilToStep(
    //                         moment.max(w.start, dayStartLocal.clone().startOf("day")),
    //                         stepMinutes,
    //                         w.start // ← anclaje a la ventana, así 16:10 se mantiene en 16:10
    //                     );

    //                     while (cur.isSameOrBefore(latestStart)) {
    //                         const end = cur.clone().add(svcDuration, "minutes");

    //                         if (isGroup) {
    //                             const k = keyOf(uid, cur, end);
    //                             const booked = countIndex.get(k) ?? 0; // ya ocupadas
    //                             const left = Math.max(0, capacity - booked);

    //                             // Si viene idClient y ya está en este grupo/slot, ocultar
    //                             const members = membersIndex.get(k);
    //                             const clientAlreadyInGroup = !!(idClient && members && members.has(idClient));

    //                             if (left > 0 && !clientAlreadyInGroup) {
    //                                 timeSlots.push({
    //                                     startLocalISO: cur.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
    //                                     endLocalISO: end.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
    //                                     label: cur.clone().tz(timeZoneClient).format("HH:mm"),
    //                                     // mostramos "ocupados / capacidad"
    //                                     labelParticipant: `${booked} / ${capacity}`,
    //                                 });
    //                             }
    //                         } else {
    //                             // Cita individual normal
    //                             timeSlots.push({
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

    //             timeSlots.sort((a, b) =>
    //                 a.startLocalISO < b.startLocalISO ? -1 : a.startLocalISO > b.startLocalISO ? 1 : 0
    //             );
    //             return { timeSlots };
    //         }

    //         /* ────────────────────────────────────────────────────────
    //            Multi-servicio (solo si NINGUNO es grupal)
    //         ───────────────────────────────────────────────────────── */
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
    //                 const s = moment.max(w.start, dayStartLocal).clone().seconds(0).milliseconds(0);
    //                 const e = moment.min(w.end, latestStart).clone().seconds(0).milliseconds(0);
    //                 if (!s.isBefore(e)) continue;

    //                 let cur = s.clone().minute(Math.ceil(s.minute() / stepMinutes) * stepMinutes);
    //                 while (!cur.isAfter(e)) {
    //                     candidateKeys.add(cur.format("YYYY-MM-DDTHH:mm:ss"));
    //                     cur.add(stepMinutes, "minutes");
    //                 }
    //             }
    //         }

    //         const candidates = Array.from(candidateKeys)
    //             .map((k) => moment.tz(k, "YYYY-MM-DDTHH:mm:ss", timeZoneWorkspace))
    //             .sort((a, b) => a.valueOf() - b.valueOf());

    //         const timeSlots: TimeSlotSpecial[] = [];
    //         const eligibleUsersByService: Record<string, string[]> = {};
    //         for (const a of attendees) eligibleUsersByService[a.serviceId] = userIdsByService.get(a.serviceId) ?? [];

    //         for (const start of candidates) {
    //             const assignment: Array<{ serviceId: string; userId: string; start: moment.Moment; end: moment.Moment }> = [];
    //             const attendeesWithRealDur = attendees.map(a => ({
    //                 serviceId: a.serviceId,
    //                 durationMin: servicesSnapshot[a.serviceId]?.durationMin ?? a.durationMin
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
    //                 timeSlots.push({
    //                     startLocalISO: start.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
    //                     endLocalISO: end.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
    //                     label: start.clone().tz(timeZoneClient).format("HH:mm"),
    //                     labelParticipant: null,
    //                 });
    //             }
    //         }

    //         return { timeSlots };
    //     } catch (error: any) {
    //         throw new CustomError("EventTimesService.publicGetAvailableTimeSlots_SPECIAL", error);
    //     }
    // }



    /* ────────────────────────────────────────────────────────────
   FUNCIÓN PRINCIPAL: ahora con soporte grupal real + bookingWindow
─────────────────────────────────────────────────────────────── */
    async publicGetAvailableTimeSlots_SPECIAL(
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
            excludeEventId,
            idClient,
        } = input;

        try {
            const BOOKING_PAGE_CONFIG: OnlineBookingConfig = deps.bookingConfig;

            // 🆕 Booking window (con defaults seguros)
            const { maxAdvanceDays = 60, minLeadTimeMin = 60 } =
                BOOKING_PAGE_CONFIG.bookingWindow ?? {};

            const alignMode: "clock" | "service" =
                BOOKING_PAGE_CONFIG.slot?.alignMode === "service" ? "service" : "clock";
            const intervalMinutes =
                alignMode === "service"
                    ? attendees?.reduce((acc, a) => acc + (a.durationMin ?? 0), 0)
                    : BOOKING_PAGE_CONFIG?.slot?.stepMinutes;

            const professionalAllowed =
                BOOKING_PAGE_CONFIG?.resources?.ids
                    ?.map((r) => (Array.isArray(r) ? r?.[0] : r)) ?? [];

            if (!idCompany || !idWorkspace) throw new Error("Faltan idCompany / idWorkspace");
            if (!timeZoneWorkspace) throw new Error("Falta timeZoneWorkspace");
            if (!timeZoneClient) throw new Error("Falta timeZoneClient");
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("date inválido");
            if (!Array.isArray(attendees) || attendees.length === 0) return { timeSlots: [] };
            if (professionalAllowed.length === 0) return { timeSlots: [] };

            // Snapshot servicios (duración/capacidad)
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
                throw new Error(
                    "Los servicios grupales no se pueden combinar con otros en la misma reserva."
                );
            }

            // Step / HOY
            const dayStartLocal = moment.tz(
                `${date}T00:00:00`,
                "YYYY-MM-DDTHH:mm:ss",
                timeZoneWorkspace
            );
            const { stepMinutes, roundedNow, isToday } = computeSlotConfig({
                intervalMinutes,
                timeZoneWorkspace,
                dayStartLocal,
            });

            // Día pasado (en TZ negocio) → vacío
            const todayLocal = moment().tz(timeZoneWorkspace).startOf("day");
            if (dayStartLocal.clone().startOf("day").isBefore(todayLocal, "day")) {
                return { timeSlots: [] };
            }

            const dayEndLocal = dayStartLocal.clone().endOf("day");

            // 🆕 Calcular ventana absoluta permitida (en TZ del negocio)
            const nowWS = moment.tz(timeZoneWorkspace);
            const earliestAllowed = nowWS
                .clone()
                .add(minLeadTimeMin, "minutes")
                .seconds(0)
                .milliseconds(0);
            const latestAllowedEnd = nowWS.clone().add(maxAdvanceDays, "days").endOf("day");

            // 🆕 Cortes rápidos por día completo
            if (dayStartLocal.isAfter(latestAllowedEnd)) return { timeSlots: [] };
            if (dayEndLocal.isBefore(earliestAllowed)) return { timeSlots: [] };

            // 🆕 Helper para validar cada slot
            const withinBookingWindow = (startWS: moment.Moment) =>
                startWS.isSameOrAfter(earliestAllowed) &&
                startWS.isSameOrBefore(latestAllowedEnd);

            // Filtrado de profesionales permitidos (si viene idClient)
            const withinAllowed = (ids: string[]) =>
                ids.filter((id) => professionalAllowed.includes(id));

            // Elegibles por servicio
            const userIdsByService = new Map<string, string[]>();
            for (const a of attendees) {
                if (a.staffId) {
                    const elig = professionalAllowed.includes(a.staffId) ? [a.staffId] : [];
                    userIdsByService.set(a.serviceId, elig);
                } else {
                    const users = await getUsersWhoCanPerformService_SPECIAL(
                        idWorkspace,
                        a.serviceId,
                        a.categoryId,
                        deps.cache
                    );
                    userIdsByService.set(a.serviceId, withinAllowed(users));
                }
            }
            const allUserIds = Array.from(
                new Set(Array.from(userIdsByService.values()).flat())
            );
            if (allUserIds.length === 0) return { timeSlots: [] };

            // Reglas/turnos
            const businessHours = await deps.businessHoursService.getBusinessHoursFromRedis(
                idCompany,
                idWorkspace
            );
            const workerHoursMap = await deps.workerHoursService.getWorkerHoursFromRedis(
                allUserIds,
                idWorkspace
            );
            const temporaryHoursMap =
                await deps.temporaryHoursService.getTemporaryHoursFromRedis(
                    allUserIds,
                    idWorkspace,
                    { date }
                );

            // Eventos del día (para ocupar ventanas)
            const events = await getEventsOverlappingRange_SPECIAL(
                allUserIds,
                date,
                date,
                excludeEventId
            );

            // Ventanas libres por usuario
            const weekDay = dayStartLocal.format("dddd").toUpperCase() as Weekday;
            const bizShifts: string[][] = (() => {
                const biz = (businessHours as any)?.[weekDay];
                return biz === null ? [] : Array.isArray(biz) ? biz : [];
            })();

            const shiftsByUserLocal: Record<
                string,
                Array<{ start: moment.Moment; end: moment.Moment }>
            > = {};
            for (const uid of allUserIds) {
                let workShifts: string[][] = [];
                const tmp = (temporaryHoursMap as any)?.[uid]?.[date];

                if (tmp === null) workShifts = [];
                else if (Array.isArray(tmp) && tmp.length > 0) workShifts = tmp;
                else {
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

            const eventsByUser = groupEventsByUser_SPECIAL(events);
            const freeWindowsByUser: Record<
                string,
                Array<{ start: moment.Moment; end: moment.Moment }>
            > = {};
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

            // Pruning simple por duración (solo multi-servicio)
            if (attendees.length > 1) {
                for (const a of attendees) {
                    const elig = userIdsByService.get(a.serviceId) ?? [];
                    const dur = servicesSnapshot[a.serviceId]?.durationMin ?? a.durationMin;
                    const algunoTieneHueco = elig.some((uid) =>
                        (freeWindowsByUser[uid] ?? []).some(
                            (w) => w.end.diff(w.start, "minutes") >= dur
                        )
                    );
                    if (!algunoTieneHueco) return { timeSlots: [] };
                }
            }

            /* ────────────────────────────────────────────────────────
               FAST-PATH: 1 servicio (soporta grupo)
            ───────────────────────────────────────────────────────── */
            if (attendees.length === 1) {
                const svcReq = attendees[0];
                const svcSnap = servicesSnapshot[svcReq.serviceId];
                const svcDuration = svcSnap?.durationMin ?? svcReq.durationMin;
                const capacity = Math.max(1, svcSnap?.maxParticipants ?? 1);
                const isGroup = capacity > 1;

                const groupEvents = isGroup
                    ? await this.getGroupEventsWithCounts_SPECIAL(
                        idCompany,
                        idWorkspace,
                        svcReq.serviceId,
                        date,
                        date,
                        excludeEventId
                    )
                    : [];

                const groupEventsByUser: Record<
                    string,
                    Array<{ start: moment.Moment; end: moment.Moment }>
                > = {};
                for (const ev of groupEvents) {
                    const u = ev.idUserPlatformFk ?? "";
                    if (!u) continue;
                    const s = moment(ev.startDate).tz(timeZoneWorkspace).seconds(0).milliseconds(0);
                    const e = moment(ev.endDate).tz(timeZoneWorkspace).seconds(0).milliseconds(0);
                    (groupEventsByUser[u] ||= []).push({ start: s, end: e });
                }

                const countIndex = new Map<string, number>();
                const membersIndex = new Map<string, Set<string>>();
                const keyOf = (
                    userId: string | null | undefined,
                    start: moment.Moment,
                    end: moment.Moment
                ) =>
                    `${userId ?? ""}|${start.format("YYYY-MM-DDTHH:mm:ss")}|${end.format(
                        "YYYY-MM-DDTHH:mm:ss"
                    )}`;

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

                const ceilToStep = (m: moment.Moment, step: number, origin: moment.Moment) => {
                    const ref = origin.clone().seconds(0).milliseconds(0);
                    const diffMin = Math.max(
                        0,
                        Math.floor((m.valueOf() - ref.valueOf()) / 60000)
                    );
                    const rem = diffMin % step;
                    const add = rem === 0 ? 0 : step - rem;
                    return m.clone().add(add, "minutes").seconds(0).milliseconds(0);
                };

                const eligible = userIdsByService.get(svcReq.serviceId) ?? [];
                const timeSlots: TimeSlotSpecial[] = [];

                for (const uid of eligible) {
                    const baseWins = freeWindowsByUser[uid] ?? [];
                    const addWinsRaw = isGroup ? groupEventsByUser[uid] ?? [] : [];
                    const addWins = addWinsRaw
                        .map((w) => {
                            const startClamped = isToday ? moment.max(w.start, roundedNow) : w.start;
                            return startClamped.isBefore(w.end)
                                ? { start: startClamped, end: w.end }
                                : null;
                        })
                        .filter(Boolean) as Array<{ start: moment.Moment; end: moment.Moment }>;

                    const wins =
                        isGroup && addWins.length
                            ? mergeTouchingWindows_SPECIAL([...baseWins, ...addWins])
                            : baseWins;

                    for (const w of wins) {
                        const latestStart = w.end.clone().subtract(svcDuration, "minutes");
                        let cur = ceilToStep(
                            moment.max(w.start, dayStartLocal.clone().startOf("day")),
                            stepMinutes,
                            w.start // anclaje a la ventana
                        );

                        while (cur.isSameOrBefore(latestStart)) {
                            // 🆕 Enforzar bookingWindow por slot (TZ negocio)
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
                                const clientAlreadyInGroup = !!(
                                    idClient &&
                                    members &&
                                    members.has(idClient)
                                );

                                if (left > 0 && !clientAlreadyInGroup) {
                                    timeSlots.push({
                                        startLocalISO: cur
                                            .clone()
                                            .tz(timeZoneClient)
                                            .format("YYYY-MM-DDTHH:mm:ss"),
                                        endLocalISO: end
                                            .clone()
                                            .tz(timeZoneClient)
                                            .format("YYYY-MM-DDTHH:mm:ss"),
                                        label: cur.clone().tz(timeZoneClient).format("HH:mm"),
                                        labelParticipant: `${booked} / ${capacity}`,
                                    });
                                }
                            } else {
                                timeSlots.push({
                                    startLocalISO: cur
                                        .clone()
                                        .tz(timeZoneClient)
                                        .format("YYYY-MM-DDTHH:mm:ss"),
                                    endLocalISO: end
                                        .clone()
                                        .tz(timeZoneClient)
                                        .format("YYYY-MM-DDTHH:mm:ss"),
                                    label: cur.clone().tz(timeZoneClient).format("HH:mm"),
                                    labelParticipant: null,
                                });
                            }

                            cur.add(stepMinutes, "minutes");
                        }
                    }
                }

                timeSlots.sort((a, b) =>
                    a.startLocalISO < b.startLocalISO ? -1 : a.startLocalISO > b.startLocalISO ? 1 : 0
                );
                return { timeSlots };
            }

            /* ────────────────────────────────────────────────────────
               Multi-servicio (solo si NINGUNO es grupal)
            ───────────────────────────────────────────────────────── */
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
            for (const a of attendees)
                eligibleUsersByService[a.serviceId] = userIdsByService.get(a.serviceId) ?? [];

            for (const start of candidates) {
                // 🆕 Enforzar bookingWindow antes del backtracking caro
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
                    timeSlots.push({
                        startLocalISO: start
                            .clone()
                            .tz(timeZoneClient)
                            .format("YYYY-MM-DDTHH:mm:ss"),
                        endLocalISO: end.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
                        label: start.clone().tz(timeZoneClient).format("HH:mm"),
                        labelParticipant: null,
                    });
                }
            }

            return { timeSlots };
        } catch (error: any) {
            throw new CustomError(
                "EventTimesService.publicGetAvailableTimeSlots_SPECIAL",
                error
            );
        }
    }

}