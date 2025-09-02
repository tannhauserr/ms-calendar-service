// helpers/event-availability.ts (o en el mismo service si prefieres)
import moment from "moment-timezone";
import prisma from "../../../../lib/prisma";
import CustomError from "../../../../models/custom-error/CustomError";
import { BusinessHoursType, WorkerHoursMapType } from "../../../../models/interfaces";
import { TemporaryHoursMapType } from "../../../../models/interfaces/temporary-business-hours-type";



// Obtiene usuarios que pueden hacer un servicio (tu función adaptada)
export async function getUsersWhoCanPerformService(
    idWorkspace: string,
    idService: string,
    idCategory?: string
): Promise<string[]> {
    try {
        // Si tienes otra ruta para mapear servicio → users, úsala aquí.
        // El código de tu consumer usaba category -> service -> userServices:
        const result = await prisma.category.findMany({
            where: {
                id: idCategory,
                idWorkspaceFk: idWorkspace,
            },
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
                    select: {
                        service: {
                            select: {
                                userServices: { select: { idUserFk: true } },
                            },
                        },
                    },
                },
            },
        });

        const userIds = result.flatMap((ce) =>
            ce.categoryServices.flatMap((cs) => cs.service.userServices.map((us) => us.idUserFk))
        );

        return Array.from(new Set(userIds));
    } catch (error: any) {
        throw new CustomError("getUsersWhoCanPerformService", error);
    }
}

// Devuelve eventos que SOLAPAN el rango (no solo dentro)
export async function getEventsOverlappingRange(
    userIds: string[],
    startISO: string,                // YYYY-MM-DD
    endISO: string,                  // YYYY-MM-DD
    excludeEventId?: string
) {
    const start = moment.utc(startISO, "YYYY-MM-DD").startOf("day").toDate();
    const end = moment.utc(endISO, "YYYY-MM-DD").endOf("day").toDate();
    // console.log("mira que es fecha start entrante", startISO);
    // console.log("mira que es fecha end entrante", endISO);
    // console.log("mira que fecha es start formateado", start);
    // console.log("mira que fecha es end formateado", end);
    const where: any = {
        idUserPlatformFk: { in: userIds },
        deletedDate: null,
        // solapamiento: start < rangeEnd && end > rangeStart
        startDate: { lt: end },
        endDate: { gt: start },
    };

    if (excludeEventId && !Number.isNaN(Number(excludeEventId))) {
        where.id = { not: Number(excludeEventId) };
    }

    const events = await prisma.event.findMany({ where });
    return events as {
        id: string | number;
        idUserPlatformFk: string;
        startDate: Date;
        endDate: Date;
    }[];
}

// Genera lista de YYYY-MM-DD entre start..end, inclusive
export function enumerateDays(startISO: string, endISO: string) {
    const out: string[] = [];
    const cur = moment.utc(startISO, "YYYY-MM-DD").startOf("day");
    const end = moment.utc(endISO, "YYYY-MM-DD").startOf("day");
    while (cur.isSameOrBefore(end)) {
        out.push(cur.format("YYYY-MM-DD"));
        cur.add(1, "day");
    }
    return out;
}

/**
 * Versión “booleana”: ¿existe al menos 1 slot para ese servicio en ese día
 * y para alguno de los usuarios candidatos?
 * (Corta en cuanto encuentra uno.)
 */
export function hasAnySlotForDay(params: {
    dateISO: string;                         // "YYYY-MM-DD" (día a evaluar en la TZ del workspace)
    serviceDuration: number;                 // minutos
    usersToConsider: string[];               // candidatos
    intervalMinutes: number;                 // p.ej. 30
    businessHours: BusinessHoursType;        // { MONDAY: [["09:00:00","14:00:00"], ...], ... } o null/[]
    workerHoursMap: WorkerHoursMapType;      // { userId: { MONDAY: null | [] | [["..",".."],..] } }
    temporaryHoursMap: TemporaryHoursMapType;// { userId: { "YYYY-MM-DD": null | [] | [["..",".."],..] } }
    events: {
        id: string | number;
        idUserPlatformFk: string;
        startDate: Date;                       // UTC
        endDate: Date;                         // UTC
    }[];
    workspaceTimeZone: string;               // "Europe/Madrid"
}): boolean {
    const {
        dateISO,
        serviceDuration,
        usersToConsider,
        intervalMinutes,
        businessHours,
        workerHoursMap,
        temporaryHoursMap,
        events,
        workspaceTimeZone,
    } = params;

    // Ventana del día en TZ del workspace (en UTC para comparar con eventos)
    const dayStartLocal = moment.tz(`${dateISO}T00:00:00`, "YYYY-MM-DDTHH:mm:ss", workspaceTimeZone);
    const dayEndLocal = dayStartLocal.clone().endOf("day");
    const dayStartUTC = dayStartLocal.clone().utc();
    const dayEndUTC = dayEndLocal.clone().utc();

    const weekDay = dayStartLocal.format("dddd").toUpperCase(); // MONDAY...

    // Horario de negocio del día (si no hay, el negocio está cerrado)
    const biz = (businessHours as any)?.[weekDay];
    const businessShifts: string[][] =
        biz === null ? [] : Array.isArray(biz) ? biz : [];
    if (businessShifts.length === 0) {
        // negocio cerrado ese día → imposible ofrecer slots
        return false;
    }

    // Pre-filtra eventos por usuario que SOLAPEN la ventana del día (no por igualdad de fecha)
    const eventsByUser: Record<string, { startUTC: moment.Moment; endUTC: moment.Moment }[]> = {};
    for (const uid of usersToConsider) eventsByUser[uid] = [];

    for (const ev of events) {
        const uid = ev.idUserPlatformFk;
        if (!eventsByUser[uid]) continue;
        const evStartUTC = moment.utc(ev.startDate);
        const evEndUTC = moment.utc(ev.endDate);
        // solape: evStart < dayEnd && evEnd > dayStart
        if (evStartUTC.isBefore(dayEndUTC) && evEndUTC.isAfter(dayStartUTC)) {
            eventsByUser[uid].push({ startUTC: evStartUTC, endUTC: evEndUTC });
        }
    }

    // Para cada usuario candidato, intenta encontrar al menos un slot
    for (const uid of usersToConsider) {
        // 1) Horario temporal para ese día (clave YYYY-MM-DD)
        const tmp = (temporaryHoursMap as any)?.[uid]?.[dateISO];
        let workShifts: string[][] = [];

        if (tmp === null) {
            // temporal explícito: cerrado → siguiente usuario
            continue;
        } else if (Array.isArray(tmp) && tmp.length > 0) {
            workShifts = tmp;
        } else {
            // 2) Horario del trabajador ese weekday
            const workerDay = (workerHoursMap as any)?.[uid]?.[weekDay];
            if (workerDay === null) {
                // worker explícito: cerrado ese weekday → NO caer a negocio
                continue;
            } else if (Array.isArray(workerDay) && workerDay.length > 0) {
                workShifts = workerDay;
            } else {
                // 3) Fallback a negocio solo si workerDay es undefined o vacío (no definido)
                workShifts = businessShifts;
            }
        }

        if (!workShifts || workShifts.length === 0) continue;

        // Eventos del usuario (UTC) que solapan el día
        const userEvents = eventsByUser[uid];

        // Recorre todos los turnos del día
        for (const [startStr, endStr] of workShifts) {
            // Turno en TZ del workspace (guardado como HH:mm:ss)
            // const shiftStartLocal = moment
            //     .tz(`${dateISO}T${startStr}`, "YYYY-MM-DDTHH:mm:ss", workspaceTimeZone);
            // const shiftEndLocal = moment
            //     .tz(`${dateISO}T${endStr}`, "YYYY-MM-DDTHH:mm:ss", workspaceTimeZone);
            const shiftStartLocal = moment.tz(`${dateISO}T${startStr}`, "YYYY-MM-DDTHH:mm:ss", workspaceTimeZone);
            const shiftEndLocal = moment.tz(`${dateISO}T${endStr}`, "YYYY-MM-DDTHH:mm:ss", workspaceTimeZone);

            let slotLocal = shiftStartLocal.clone();

            // Si es hoy en esa TZ, no ofrecer horas pasadas
            const nowLocal = moment.tz(workspaceTimeZone);
            if (dayStartLocal.isSame(nowLocal, "day") && slotLocal.isBefore(nowLocal)) {
                slotLocal = nowLocal
                    .clone()
                    .minute(Math.ceil(nowLocal.minute() / intervalMinutes) * intervalMinutes)
                    .second(0);
            }

            while (slotLocal.isBefore(shiftEndLocal)) {
                const slotEndLocal = slotLocal.clone().add(serviceDuration, "minutes");
                if (slotEndLocal.isAfter(shiftEndLocal)) break;

                // Compara el slot (convertido a UTC) contra eventos en UTC
                const slotStartUTC = shiftStartLocal.clone().utc();
                const slotEndUTC = shiftEndLocal.clone().utc();

                let free = true;
                for (const ev of userEvents) {
                    if (slotStartUTC.isBefore(ev.endUTC) && slotEndUTC.isAfter(ev.startUTC)) {
                        free = false;
                        break;
                    }
                }
                if (free) return true; // encontrado un hueco para este usuario → día disponible
                slotLocal.add(intervalMinutes, "minutes");
            }
        }
    }

    // Ningún usuario tuvo hueco ese día
    return false;
}



/**
 * Igual que hasAnySlotForDay pero devuelve además un índice de capacidad (0..1)
 * - ok: existe al menos 1 inicio donde quepa el servicio
 * - capacity: minutos útiles del servicio / minutos de negocio del día (0..1)
 */
export function hasAnySlotForDayWithCapacity(params: {
    dateISO: string;                         // "YYYY-MM-DD" en TZ del workspace
    serviceDuration: number;                 // minutos
    usersToConsider: string[];               // candidatos
    intervalMinutes: number;                 // p.ej. 10/15/20/30/60
    businessHours: BusinessHoursType;        // { MONDAY: [["09:00:00","14:00:00"], ...], ... } | null
    workerHoursMap: WorkerHoursMapType;      // { userId: { MONDAY: null | [] | [["..",".."],..] } }
    temporaryHoursMap: TemporaryHoursMapType;// { userId: { "YYYY-MM-DD": null | [] | [["..",".."],..] } }
    events: {
        id: string | number;
        idUserPlatformFk: string;
        startDate: Date; // UTC
        endDate: Date;   // UTC
    }[];
    workspaceTimeZone: string;               // "Europe/Madrid"
}): { ok: boolean; capacity: number } {
    const {
        dateISO,
        serviceDuration,
        usersToConsider,
        intervalMinutes,
        businessHours,
        workerHoursMap,
        temporaryHoursMap,
        events,
        workspaceTimeZone,
    } = params;

    const dayStartLocal = moment.tz(`${dateISO}T00:00:00`, "YYYY-MM-DDTHH:mm:ss", workspaceTimeZone);
    const dayEndLocal = dayStartLocal.clone().endOf("day");
    const weekDay = dayStartLocal.format("dddd").toUpperCase();

    // ----------------------------
    // Helpers malla de tiempo
    // ----------------------------
    const slotsPerDay = Math.ceil(24 * 60 / intervalMinutes);

    const clampIdx = (i: number) => Math.max(0, Math.min(slotsPerDay, i));
    const minutesFromMidnight = (m: moment.Moment) => (m.hour() * 60) + m.minute();

    const toIdxRange = (startLocal: moment.Moment, endLocal: moment.Moment) => {
        const sMin = minutesFromMidnight(startLocal);
        const eMin = minutesFromMidnight(endLocal);
        const i0 = clampIdx(Math.floor(sMin / intervalMinutes));
        const i1 = clampIdx(Math.ceil(eMin / intervalMinutes)); // exclusivo
        return [i0, i1] as const;
    };

    // ----------------------------
    // Business mask (y bizTotal)
    // ----------------------------
    const biz = (businessHours as any)?.[weekDay];
    const businessShifts: string[][] = biz === null ? [] : Array.isArray(biz) ? biz : [];
    if (businessShifts.length === 0) return { ok: false, capacity: 0 };

    const businessMask = new Array<boolean>(slotsPerDay).fill(false);

    for (const [s, e] of businessShifts) {
        let sL = moment.tz(`${dateISO}T${s}`, "YYYY-MM-DDTHH:mm:ss", workspaceTimeZone);
        let eL = moment.tz(`${dateISO}T${e}`, "YYYY-MM-DDTHH:mm:ss", workspaceTimeZone);

        // Si es hoy en esa TZ, no ofrecer pasado
        const nowLocal = moment.tz(workspaceTimeZone);
        if (dayStartLocal.isSame(nowLocal, "day")) {
            if (eL.isBefore(nowLocal)) continue; // turno entero en pasado
            if (sL.isBefore(nowLocal)) {
                sL = nowLocal.clone()
                    .minute(Math.ceil(nowLocal.minute() / intervalMinutes) * intervalMinutes)
                    .second(0);
            }
        }

        if (!sL.isBefore(eL)) continue;
        const [i0, i1] = toIdxRange(sL, eL);
        for (let i = i0; i < i1; i++) businessMask[i] = true;
    }

    const bizTotalMinutes = businessMask.reduce((acc, v) => acc + (v ? intervalMinutes : 0), 0);
    if (bizTotalMinutes === 0) return { ok: false, capacity: 0 };

    // ----------------------------
    // Indexa eventos por usuario (en UTC)
    // ----------------------------
    const eventsByUser: Record<string, { startUTC: moment.Moment; endUTC: moment.Moment }[]> = {};
    for (const uid of usersToConsider) eventsByUser[uid] = [];
    for (const ev of events) {
        const uid = ev.idUserPlatformFk;
        if (!(uid in eventsByUser)) continue;
        const evStartUTC = moment.utc(ev.startDate);
        const evEndUTC = moment.utc(ev.endDate);
        // Sólo nos interesan los que solapan el día
        if (evStartUTC.isBefore(dayEndLocal.clone().utc()) && evEndUTC.isAfter(dayStartLocal.clone().utc())) {
            eventsByUser[uid].push({ startUTC: evStartUTC, endUTC: evEndUTC });
        }
    }

    // ----------------------------
    // Service mask (OR de candidatos)
    // ----------------------------
    const serviceMask = new Array<boolean>(slotsPerDay).fill(false);

    const buildUserMask = (uid: string) => {
        // 1) Turnos efectivos (temporary → worker → negocio)
        const tmp = (temporaryHoursMap as any)?.[uid]?.[dateISO];
        let workShifts: string[][] = [];

        if (tmp === null) {
            return null; // cerrado explícito ese día
        } else if (Array.isArray(tmp) && tmp.length > 0) {
            workShifts = tmp;
        } else {
            const workerDay = (workerHoursMap as any)?.[uid]?.[weekDay];
            if (workerDay === null) {
                return null; // cerrado explícito ese weekday
            } else if (Array.isArray(workerDay) && workerDay.length > 0) {
                workShifts = workerDay;
            } else {
                workShifts = businessShifts; // hereda negocio
            }
        }
        if (!workShifts || workShifts.length === 0) return null;

        // 2) Construye máscara del usuario limitada por businessMask
        const userMask = new Array<boolean>(slotsPerDay).fill(false);

        for (const [s, e] of workShifts) {
            let sL = moment.tz(`${dateISO}T${s}`, "YYYY-MM-DDTHH:mm:ss", workspaceTimeZone);
            let eL = moment.tz(`${dateISO}T${e}`, "YYYY-MM-DDTHH:mm:ss", workspaceTimeZone);

            const nowLocal = moment.tz(workspaceTimeZone);
            if (dayStartLocal.isSame(nowLocal, "day")) {
                if (eL.isBefore(nowLocal)) continue;
                if (sL.isBefore(nowLocal)) {
                    sL = nowLocal.clone()
                        .minute(Math.ceil(nowLocal.minute() / intervalMinutes) * intervalMinutes)
                        .second(0);
                }
            }

            if (!sL.isBefore(eL)) continue;
            const [i0, i1] = toIdxRange(sL, eL);
            for (let i = i0; i < i1; i++) {
                if (businessMask[i]) userMask[i] = true; // sólo donde negocio abre
            }
        }

        // 3) Resta eventos del usuario (convertidos a local y recortados al día)
        const userEvents = eventsByUser[uid] ?? [];
        for (const ev of userEvents) {
            const evStartLocal = ev.startUTC.clone().tz(workspaceTimeZone);
            const evEndLocal = ev.endUTC.clone().tz(workspaceTimeZone);

            const sClip = moment.max(evStartLocal, dayStartLocal);
            const eClip = moment.min(evEndLocal, dayEndLocal);
            if (!sClip.isBefore(eClip)) continue;

            const [j0, j1] = toIdxRange(sClip, eClip);
            for (let j = j0; j < j1; j++) userMask[j] = false;
        }

        return userMask;
    };

    for (const uid of usersToConsider) {
        const userMask = buildUserMask(uid);
        if (!userMask) continue;
        for (let i = 0; i < slotsPerDay; i++) {
            if (userMask[i]) serviceMask[i] = true; // OR
        }
    }

    // ----------------------------
    // Cálculo de inicios válidos y minutos útiles
    // ----------------------------
    const needed = Math.ceil(serviceDuration / intervalMinutes); // slots contiguos necesarios
    let ok = false;
    let starts = 0;

    let run = 0;
    for (let i = 0; i < slotsPerDay; i++) {
        run = serviceMask[i] ? run + 1 : 0;
        if (run >= needed) {
            starts++;
            ok = true;
            // (Si quisieras saltar para no contar cada desplazamiento de 1 slot, aquí podrías hacer: run = needed - 1)
        }
    }

    const freeUsefulMinutesForService = starts * intervalMinutes;
    const capacity = Math.min(1, freeUsefulMinutesForService / bizTotalMinutes);

    return { ok, capacity };
}
