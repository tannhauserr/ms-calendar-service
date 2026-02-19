import moment from "moment";
import { CONSOLE_COLOR } from "../../../../../../constant/console-color";
import { ErrorCatalogByDomain, withCatalogMessage } from "../../../../../../models/error-codes";
import {
    MaxServicesPerBookingPolicy,
    ServiceWindowAvailabilityPolicy,
    StaffAssignablePolicy,
} from "../../../../domain";
import type { EventClientAvailabilityService } from "../../../availability";
import type { AddFromWebDeps } from "../../../create-event/event-client-write.types";
import type { EventClientUpdatePersistence } from "../../../persistence";

type RunRebuildBookingFlowParams = {
    attendees: any[];
    maxPerBooking: number;
    idWorkspace: string;
    cache: any;
    idCompany: string;
    businessHoursService: AddFromWebDeps["businessHoursService"];
    workerHoursService: AddFromWebDeps["workerHoursService"];
    temporaryHoursService: AddFromWebDeps["temporaryHoursService"];
    dateWS: string;
    originalIds: Set<string>;
    explicitDeletes: Set<string>;
    originalEvents: any[];
    startWS: moment.Moment;
    timeZoneWorkspace: string;
    isToday: boolean;
    roundedNow: moment.Moment;
    serviceById: Record<string, any>;
    weightsMap: Record<string, number>;
    groupId: string;
    note?: string | null;
    isCommentRead?: boolean;
    customer: { id: string; idClientWorkspace?: string };
    timeZoneClient: string;
    bookingId: string;
    original: any;
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
 * Ejecuta el flujo de reconstrucción de reserva para updates complejos.
 */
export const runRebuildBookingFlow = async (params: RunRebuildBookingFlowParams) => {
    const {
        attendees,
        maxPerBooking,
        idWorkspace,
        cache,
        idCompany,
        businessHoursService,
        workerHoursService,
        temporaryHoursService,
        dateWS,
        originalIds,
        explicitDeletes,
        originalEvents,
        startWS,
        timeZoneWorkspace,
        isToday,
        roundedNow,
        serviceById,
        weightsMap,
        groupId,
        note,
        isCommentRead,
        customer,
        timeZoneClient,
        bookingId,
        original,
        availabilityService,
        persistence,
        chooseStaffWithRR,
    } = params;

    if (!MaxServicesPerBookingPolicy.isWithinLimit(attendees.length, maxPerBooking)) {
        throw new Error(
            withCatalogMessage(
                ErrorCatalogByDomain.booking.validation.BOOKING_ERR_MAX_SERVICES.message,
                `Maximo ${maxPerBooking} servicios por reserva`
            )
        );
    }

    const ignoredBusyEventIds = new Set([...originalIds, ...explicitDeletes]);
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
        ignoredBusyEventIds,
        preloadedServiceById: serviceById as any,
        preloadedWeightsMap: weightsMap,
    });

    if (!availabilityContext) {
        console.log(CONSOLE_COLOR.BgRed, "[update][multi] No hay profesionales elegibles", CONSOLE_COLOR.Reset);
        return {
            ok: false as const,
            code: "BOOKING_ERR_NO_ELIGIBLE_STAFF",
            message: "No hay profesionales elegibles para los servicios seleccionados.",
        };
    }
    const {
        userIdsByService,
        freeWindowsByUser,
        weightsMap: availabilityWeightsMap,
    } = availabilityContext;

    type Segment = {
        serviceId: string;
        userId: string;
        start: moment.Moment;
        end: moment.Moment;
    };

    let cursor = startWS.clone();
    const chosenSegments: Segment[] = [];

    for (const attendee of attendees) {
        const snapshot = (serviceById as any)[attendee.serviceId];
        if (!snapshot) {
            throw new Error(
                withCatalogMessage(
                    ErrorCatalogByDomain.booking.common.BOOKING_ERR_GENERIC.message,
                    "Servicio no disponible"
                )
            );
        }

        const duration = attendee.durationMin ?? (snapshot.duration ?? 0);
        const segStart = cursor.clone().seconds(0).milliseconds(0);
        const segEnd = cursor.clone().add(duration, "minutes").seconds(0).milliseconds(0);

        const eligibleUserIds = userIdsByService.get(attendee.serviceId) ?? [];
        if (!ServiceWindowAvailabilityPolicy.hasAnyAvailableWindow({
            eligibleUserIds,
            freeWindowsByUser,
            requiredDurationMin: duration,
        })) {
            console.log(CONSOLE_COLOR.BgRed, "[update][multi] Sin ventanas por duracion", { serviceId: attendee.serviceId }, CONSOLE_COLOR.Reset);
            return {
                ok: false as const,
                code: "BOOKING_ERR_MULTI_SEGMENT_DOES_NOT_FIT",
                message: "Un segmento no encuentra hueco disponible en la secuencia.",
            };
        }

        const eligAvail = eligibleUserIds.filter((uid) =>
            (freeWindowsByUser[uid] ?? []).some(
                (window) => segStart.isSameOrAfter(window.start) && segEnd.isSameOrBefore(window.end)
            )
        );
        if (!eligAvail.length) {
            console.log(CONSOLE_COLOR.BgRed, "[update][multi] No encaja un segmento", { serviceId: attendee.serviceId }, CONSOLE_COLOR.Reset);
            return {
                ok: false as const,
                code: "BOOKING_ERR_MULTI_SEGMENT_DOES_NOT_FIT",
                message: "Un segmento no encuentra hueco disponible en la secuencia.",
            };
        }

        const chosen = await chooseStaffWithRR(
            idWorkspace,
            undefined,
            attendee.serviceId,
            segStart.toDate(),
            segEnd.toDate(),
            eligAvail,
            availabilityWeightsMap
        );
        if (!StaffAssignablePolicy.canAssign(chosen)) {
            console.log(CONSOLE_COLOR.BgRed, "[update][multi] RR no pudo elegir pro", CONSOLE_COLOR.Reset);
            return {
                ok: false as const,
                code: "BOOKING_ERR_MULTI_RR_NO_CANDIDATE",
                message: "No se pudo seleccionar profesional para uno de los segmentos.",
            };
        }

        chosenSegments.push({
            serviceId: attendee.serviceId,
            userId: chosen,
            start: segStart,
            end: segEnd,
        });
        cursor = segEnd.clone();
    }

    const originalsKept = originalEvents.filter((event: any) => !explicitDeletes.has(event.id));

    const totalDurationMin = chosenSegments.reduce(
        (acc, segment) => acc + segment.end.diff(segment.start, "minutes"),
        0
    );
    const endWS = startWS.clone().add(totalDurationMin, "minutes");

    const result = await persistence.rebuildBooking({
        idCompany,
        idWorkspace,
        groupId,
        note,
        isCommentRead,
        timeZoneWorkspace,
        customer: {
            id: customer.id,
            idClientWorkspace: customer.idClientWorkspace!,
        },
        chosenSegments: chosenSegments.map((segment) => ({
            serviceId: segment.serviceId,
            userId: segment.userId,
            start: segment.start.toDate(),
            end: segment.end.toDate(),
        })),
        originalIds: Array.from(originalIds),
        originalsKept: originalsKept.map((event: any) => ({ id: event.id })),
        serviceById: serviceById as Record<string, any>,
        explicitDeleteIds: Array.from(explicitDeletes),
    });

    const notificationType =
        chosenSegments.length <= 1
            ? ("single-service" as const)
            : ("several-services" as const);

    return {
        ok: true as const,
        message: "Evento actualizado reconstruyendo segmentos.",
        code: "BOOKING_INFO_EVENT_REBUILT",
        notification: {
            idBooking: bookingId,
            type: notificationType,
        },
        item: {
            outcome: "rebuild_group",
            fromEventId: original.id,
            appointment: {
                startLocalISO: startWS.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
                endLocalISO: endWS.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
                timeZoneClient,
                timeZoneWorkspace,
                totalDurationMin: totalDurationMin,
            },
            assignments: chosenSegments.map((segment) => ({
                serviceId: segment.serviceId,
                userId: segment.userId,
                startUTC: segment.start.toISOString(),
                endUTC: segment.end.toISOString(),
                startLocalClient: segment.start.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
                endLocalClient: segment.end.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
            })),
            ...result,
        },
    };
};
