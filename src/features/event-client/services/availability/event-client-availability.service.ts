import moment from "moment";
import {
    getEventsOverlappingRange_SPECIAL,
    getUsersWhoCanPerformService_SPECIAL,
    groupEventsByUser_SPECIAL,
    mergeTouchingWindows_SPECIAL,
    subtractBusyFromShift_SPECIAL,
} from "../../../../services/@database/event/availability-special.service";
import { _getServicesSnapshotById } from "../../../../services/@database/event/util/getInfoServices";
import { EligibleProfessionalsPolicy, ServiceById } from "../../domain";
import type { AddFromWebDeps, AddFromWebInput, MomentRange } from "../create-event/event-client-write.types";

type BuildAvailabilityContextInput = {
    idCompany: string;
    idWorkspace: string;
    dateWS: string;
    startWS: moment.Moment;
    isToday: boolean;
    roundedNow: moment.Moment;
    attendees: AddFromWebInput["attendees"];
    timeZoneWorkspace: string;
    cache?: AddFromWebDeps["cache"];
    bookingConfig?: AddFromWebDeps["bookingConfig"];
    businessHoursService: AddFromWebDeps["businessHoursService"];
    workerHoursService: AddFromWebDeps["workerHoursService"];
    temporaryHoursService: AddFromWebDeps["temporaryHoursService"];
    excludeEventId?: string;
    ignoredBusyEventIds?: Set<string>;
    preloadedServiceById?: ServiceById;
    preloadedWeightsMap?: Record<string, number>;
};

type BuildAvailabilityContextResult = {
    userIdsByService: Map<string, string[]>;
    allUserIds: string[];
    freeWindowsByUser: Record<string, MomentRange[]>;
    serviceById: ServiceById;
    weightsMap: Record<string, number>;
};

/**
 * Servicio compartido para calcular disponibilidad efectiva de profesionales.
 */
export class EventClientAvailabilityService {
    /**
     * Construye el contexto de disponibilidad para una fecha concreta.
     */
    public async buildContext(
        params: BuildAvailabilityContextInput
    ): Promise<BuildAvailabilityContextResult | null> {
        const userIdsByService = await this._buildUserIdsByService(
            params.attendees,
            params.idWorkspace,
            params.cache
        );

        const allUserIds = Array.from(new Set(Array.from(userIdsByService.values()).flat()));
        if (!EligibleProfessionalsPolicy.hasAny(allUserIds)) {
            return null;
        }

        const [businessHours, workerHoursMap, temporaryHoursMap, overlappingEvents] = await Promise.all([
            params.businessHoursService.getBusinessHoursFromRedis(params.idCompany, params.idWorkspace),
            params.workerHoursService.getWorkerHoursFromRedis(allUserIds, params.idWorkspace),
            params.temporaryHoursService.getTemporaryHoursFromRedis(
                allUserIds,
                params.idWorkspace,
                { date: params.dateWS }
            ),
            getEventsOverlappingRange_SPECIAL(
                params.idWorkspace,
                allUserIds,
                params.dateWS,
                params.dateWS,
                params.excludeEventId
            ),
        ]);

        const events = (overlappingEvents || []).filter(
            (event: any) => !params.ignoredBusyEventIds?.has(event.id)
        );
        const eventsByUser = groupEventsByUser_SPECIAL(events);

        const weekDay = params.startWS.format("dddd").toUpperCase() as any;
        const bizShifts: string[][] = (() => {
            const biz = (businessHours as any)?.[weekDay];
            return biz === null ? [] : Array.isArray(biz) ? biz : [];
        })();

        const shiftsByUserLocal: Record<string, MomentRange[]> = {};
        for (const userId of allUserIds) {
            let workShifts: string[][] = [];
            const temporaryDay = (temporaryHoursMap as any)?.[userId]?.[params.dateWS];

            if (temporaryDay === null) {
                workShifts = [];
            } else if (Array.isArray(temporaryDay) && temporaryDay.length > 0) {
                workShifts = temporaryDay;
            } else {
                const workerDay = (workerHoursMap as any)?.[userId]?.[weekDay];
                if (workerDay === null) {
                    workShifts = [];
                } else if (Array.isArray(workerDay) && workerDay.length > 0) {
                    workShifts = workerDay;
                } else {
                    workShifts = bizShifts;
                }
            }

            shiftsByUserLocal[userId] = (workShifts || []).map(([start, end]) => ({
                start: moment.tz(
                    `${params.dateWS}T${start}`,
                    "YYYY-MM-DDTHH:mm:ss",
                    params.timeZoneWorkspace
                ),
                end: moment.tz(
                    `${params.dateWS}T${end}`,
                    "YYYY-MM-DDTHH:mm:ss",
                    params.timeZoneWorkspace
                ),
            }));
        }

        const freeWindowsByUser: Record<string, MomentRange[]> = {};
        for (const userId of allUserIds) {
            const busy = (eventsByUser[userId] || []).map((event: any) => ({
                start: moment(event.startDate).tz(params.timeZoneWorkspace),
                end: moment(event.endDate).tz(params.timeZoneWorkspace),
            }));

            const rawShifts = shiftsByUserLocal[userId] || [];
            const free: MomentRange[] = [];

            for (const shift of rawShifts) {
                const startClamped = params.isToday
                    ? moment.max(shift.start, params.roundedNow)
                    : shift.start.clone();

                if (!startClamped.isBefore(shift.end)) {
                    continue;
                }

                free.push(...subtractBusyFromShift_SPECIAL(startClamped, shift.end, busy));
            }

            freeWindowsByUser[userId] = mergeTouchingWindows_SPECIAL(free);
        }

        const serviceById = params.preloadedServiceById
            ? params.preloadedServiceById
            : (await _getServicesSnapshotById({
                  idCompany: params.idCompany,
                  idWorkspace: params.idWorkspace,
                  attendees: params.attendees,
              })) as ServiceById;

        const weightsMap = params.preloadedWeightsMap ?? this._buildWeightsMap(params.bookingConfig);

        return {
            userIdsByService,
            allUserIds,
            freeWindowsByUser,
            serviceById,
            weightsMap,
        };
    }

    /**
     * Construye mapa de usuarios elegibles por servicio.
     */
    private async _buildUserIdsByService(
        attendees: AddFromWebInput["attendees"],
        idWorkspace: string,
        cache?: AddFromWebDeps["cache"]
    ): Promise<Map<string, string[]>> {
        const userIdsByService = new Map<string, string[]>();

        for (const attendee of attendees) {
            if (attendee.staffId) {
                userIdsByService.set(attendee.serviceId, [attendee.staffId]);
                continue;
            }

            const users = await getUsersWhoCanPerformService_SPECIAL(
                idWorkspace,
                attendee.serviceId,
                attendee.categoryId,
                cache
            );
            userIdsByService.set(attendee.serviceId, users);
        }

        return userIdsByService;
    }

    /**
     * Construye mapa de pesos para round-robin a partir de config.
     */
    private _buildWeightsMap(bookingConfig?: AddFromWebDeps["bookingConfig"]): Record<string, number> {
        const rawIds = Array.isArray(bookingConfig?.resources?.ids)
            ? (bookingConfig.resources.ids as unknown as [string, number][])
            : [];

        return Object.fromEntries(
            rawIds.map(([id, weight]) => [id, Number.isFinite(weight) ? weight : 100])
        );
    }
}
