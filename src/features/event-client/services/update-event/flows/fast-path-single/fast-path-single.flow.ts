import moment from "moment";
import { CONSOLE_COLOR } from "../../../../../../constant/console-color";
import { ErrorCatalogByDomain, withCatalogMessage } from "../../../../../../models/error-codes";
import {
    ServiceWindowAvailabilityPolicy,
    StaffAssignablePolicy,
} from "../../../../domain";
import type { EventClientAvailabilityService } from "../../../availability";
import type { AddFromWebDeps } from "../../../create-event/event-client-write.types";
import type { EventClientUpdatePersistence } from "../../../persistence";

type RunFastPathSingleFlowParams = {
    attendees: any[];
    serviceById: Record<string, any>;
    idWorkspace: string;
    cache: any;
    idCompany: string;
    businessHoursService: AddFromWebDeps["businessHoursService"];
    workerHoursService: AddFromWebDeps["workerHoursService"];
    temporaryHoursService: AddFromWebDeps["temporaryHoursService"];
    dateWS: string;
    idEvent: string;
    originalIds: Set<string>;
    startWS: moment.Moment;
    timeZoneWorkspace: string;
    isToday: boolean;
    roundedNow: moment.Moment;
    weightsMap: Record<string, number>;
    cancelledStates: string[];
    groupId: string;
    note?: string | null;
    isCommentRead?: boolean;
    original: any;
    timeZoneClient: string;
    bookingId: string;
    availabilityService: EventClientAvailabilityService;
    persistence: EventClientUpdatePersistence;
    chooseStaffWithRR: (
        idWorkspace: string,
        idBookingPage: string | undefined,
        idService: string,
        start: Date,
        end: Date,
        eligibles: string[],
        weightsMap: Record<string, number>
    ) => Promise<string | null>;
};

/**
 * Ejecuta el flujo rápido de actualización para una cita de un solo segmento.
 */
export const runFastPathSingleFlow = async (params: RunFastPathSingleFlowParams) => {
    const {
        attendees,
        serviceById,
        idWorkspace,
        cache,
        idCompany,
        businessHoursService,
        workerHoursService,
        temporaryHoursService,
        dateWS,
        idEvent,
        originalIds,
        startWS,
        timeZoneWorkspace,
        isToday,
        roundedNow,
        weightsMap,
        cancelledStates,
        groupId,
        note,
        isCommentRead,
        original,
        timeZoneClient,
        bookingId,
        availabilityService,
        persistence,
        chooseStaffWithRR,
    } = params;

    const svcReq = attendees[0];
    const svcSnap = (serviceById as any)[svcReq.serviceId];
    if (!svcSnap) {
        throw new Error(
            withCatalogMessage(
                ErrorCatalogByDomain.booking.common.BOOKING_ERR_GENERIC.message,
                "Servicio no disponible en snapshot"
            )
        );
    }

    const availabilityContext = await availabilityService.buildContext({
        idCompany,
        idWorkspace,
        dateWS,
        startWS,
        isToday,
        roundedNow,
        attendees,
        timeZoneWorkspace,
        cache,
        businessHoursService,
        workerHoursService,
        temporaryHoursService,
        excludeEventId: idEvent,
        ignoredBusyEventIds: originalIds,
        preloadedServiceById: serviceById as any,
        preloadedWeightsMap: weightsMap,
    });

    if (!availabilityContext) {
        console.log(CONSOLE_COLOR.BgRed, "[update][single] No hay profesionales elegibles", CONSOLE_COLOR.Reset);
        return {
            ok: false as const,
            code: "BOOKING_ERR_NO_ELIGIBLE_STAFF",
            message: "No hay profesionales elegibles para el servicio seleccionado.",
        };
    }
    const { userIdsByService, freeWindowsByUser, weightsMap: availabilityWeightsMap } =
        availabilityContext;

    const dur = svcReq.durationMin ?? (svcSnap.duration ?? 0);
    const endWS = startWS.clone().add(dur, "minutes");

    const eligibleUserIds = userIdsByService.get(svcReq.serviceId) ?? [];
    if (!ServiceWindowAvailabilityPolicy.hasAnyAvailableWindow({
        eligibleUserIds,
        freeWindowsByUser,
        requiredDurationMin: dur,
    })) {
        console.log(CONSOLE_COLOR.BgRed, "[update][single] Sin ventanas disponibles para el servicio", CONSOLE_COLOR.Reset);
        return {
            ok: false as const,
            code: "BOOKING_ERR_NO_AVAILABLE_WINDOW",
            message: "Ningun profesional tiene ese hueco disponible.",
        };
    }

    const eligAvail = eligibleUserIds.filter((uid) =>
        (freeWindowsByUser[uid] ?? []).some(
            (window) => startWS.isSameOrAfter(window.start) && endWS.isSameOrBefore(window.end)
        )
    );
    if (!eligAvail.length) {
        console.log(CONSOLE_COLOR.BgRed, "[update][single] Ningun pro disponible para el slot", CONSOLE_COLOR.Reset);
        return {
            ok: false as const,
            code: "BOOKING_ERR_NO_AVAILABLE_WINDOW",
            message: "Ningun profesional tiene ese hueco disponible.",
        };
    }

    const chosen = await chooseStaffWithRR(
        idWorkspace,
        undefined,
        svcReq.serviceId,
        startWS.toDate(),
        endWS.toDate(),
        eligAvail,
        availabilityWeightsMap
    );
    if (!StaffAssignablePolicy.canAssign(chosen)) {
        console.log(CONSOLE_COLOR.BgRed, "[update][single] RR no pudo elegir pro", CONSOLE_COLOR.Reset);
        return {
            ok: false as const,
            code: "BOOKING_ERR_RR_NO_CANDIDATE",
            message: "No se pudo seleccionar un profesional para el slot.",
        };
    }

    const segment = {
        serviceId: svcReq.serviceId,
        userId: chosen as string,
        start: startWS.clone().seconds(0).milliseconds(0),
        end: endWS.clone().seconds(0).milliseconds(0),
    };

    const { updatedEvent } = await persistence.updateSingleEvent({
        segment: {
            serviceId: segment.serviceId,
            userId: segment.userId,
            start: segment.start.toDate(),
            end: segment.end.toDate(),
        },
        idWorkspace,
        cancelledStates,
        originalEventId: original.id,
        groupId,
        note,
        isCommentRead,
        timeZoneWorkspace,
        serviceSnapshot: (serviceById as any)[segment.serviceId] ?? {},
    });

    return {
        ok: true as const,
        outcome: "updated_in_place",
        fromEventId: original.id,
        notification: {
            idBooking: bookingId,
            type: "single-service" as const,
        },
        appointment: {
            startLocalISO: segment.start.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
            endLocalISO: segment.end.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
            timeZoneClient,
            timeZoneWorkspace,
            totalDurationMin: dur,
        },
        assignments: [
            {
                serviceId: segment.serviceId,
                userId: segment.userId,
                startUTC: segment.start.toISOString(),
                endUTC: segment.end.toISOString(),
                startLocalClient: segment.start.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
                endLocalClient: segment.end.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
            },
        ],
        created: [],
        updated: [updatedEvent],
        deleted: [],
    };
};
