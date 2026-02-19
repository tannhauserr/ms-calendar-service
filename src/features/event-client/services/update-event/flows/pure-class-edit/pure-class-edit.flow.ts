import type { Event, Prisma } from "@prisma/client";
import moment from "moment";
import { ErrorCatalogByDomain } from "../../../../../../models/error-codes";
import { getUsersWhoCanPerformService_SPECIAL } from "../../../../../../services/@database/event/availability-special.service";
import { EligibleProfessionalsPolicy, StaffAssignablePolicy } from "../../../../domain";
import type { EventClientUpdatePersistence } from "../../../persistence";

type EventSourceType = "PLATFORM" | "WEB" | "WIDGET" | "GOOGLE" | "BOT";
const withCatalogMessage = (catalogMessage: string, detail: string) => `${catalogMessage} ${detail}`;

type RunPureClassEditFlowParams = {
    idCompany: string;
    idWorkspace: string;
    timeZoneClient: string;
    timeZoneWorkspace: string;
    startWS: moment.Moment;
    attendees: any[];
    original: any;
    bookingId: string;
    groupId: string;
    serviceById: Record<string, any>;
    weightsMap: Record<string, number>;
    cache: any;
    customer: { id: string; idClientWorkspace: string };
    note?: string | null;
    eventSourceType: EventSourceType;
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
    createOrJoinGroupEvent: (
        tx: Prisma.TransactionClient,
        params: {
            idCompany: string;
            idWorkspace: string;
            idGroup?: string;
            seg: { serviceId: string; userId: string; start: moment.Moment; end: moment.Moment };
            svc: {
                id: string;
                name?: string | null;
                price?: number | null;
                discount?: number | null;
                duration?: number | null;
                maxParticipants?: number | null;
            };
            timeZoneWorkspace: string;
            note?: string | null;
            isCommentRead?: boolean;
            customer: { id: string; idClientWorkspace: string };
            autoConfirmClientBookings: boolean;
            eventSourceType: EventSourceType;
        }
    ) => Promise<{ event: Event; action: "created" | "joined" | "already-in" }>;
};

/**
 * Ejecuta el flujo de edición de clase moviendo un participante.
 */
export const runPureClassEditFlow = async (params: RunPureClassEditFlowParams) => {
    const {
        idCompany,
        idWorkspace,
        timeZoneClient,
        timeZoneWorkspace,
        startWS,
        attendees,
        original,
        bookingId,
        groupId,
        serviceById,
        weightsMap,
        cache,
        customer,
        note,
        eventSourceType,
        persistence,
        chooseStaffWithRR,
        createOrJoinGroupEvent,
    } = params;

    const svcReq = attendees[0];
    const svcSnap = serviceById[svcReq.serviceId];
    if (!svcSnap) {
        throw new Error(
            withCatalogMessage(
                ErrorCatalogByDomain.booking.common.BOOKING_ERR_GENERIC.message,
                "Servicio no disponible en snapshot"
            )
        );
    }

    const dur = svcReq.durationMin ?? (svcSnap.duration ?? 0);
    const endWS = startWS.clone().add(dur, "minutes");

    const userIdsByService = new Map<string, string[]>();
    if (svcReq.staffId) {
        userIdsByService.set(svcReq.serviceId, [svcReq.staffId]);
    } else {
        const users = await getUsersWhoCanPerformService_SPECIAL(
            idWorkspace,
            svcReq.serviceId,
            svcReq.categoryId,
            cache
        );
        userIdsByService.set(svcReq.serviceId, users);
    }

    const allUserIds = Array.from(new Set(Array.from(userIdsByService.values()).flat()));
    if (!EligibleProfessionalsPolicy.hasAny(allUserIds)) {
        return {
            ok: false as const,
            code: "BOOKING_ERR_NO_ELIGIBLE_STAFF",
            message: "No hay profesionales elegibles para el servicio seleccionado.",
        };
    }

    const chosen = await chooseStaffWithRR(
        idWorkspace,
        undefined,
        svcReq.serviceId,
        startWS.toDate(),
        endWS.toDate(),
        allUserIds,
        weightsMap
    );
    if (!StaffAssignablePolicy.canAssign(chosen)) {
        return {
            ok: false as const,
            code: "BOOKING_ERR_RR_NO_CANDIDATE",
            message: "No se pudo seleccionar un profesional para el slot.",
        };
    }

    const seg = {
        serviceId: svcReq.serviceId,
        userId: chosen,
        start: startWS.clone().seconds(0).milliseconds(0),
        end: endWS.clone().seconds(0).milliseconds(0),
    };

    const { targetEvent, action, deletedEventIds } = await persistence.moveSingleParticipantInClassEdit({
        originalGroupId: original.idGroup ?? original.id,
        originalEventId: original.id,
        customer,
        groupId,
        createOrJoin: async (tx, originalGroupId) => {
            const { event: targetEventRaw, action } = await createOrJoinGroupEvent(tx, {
                idCompany,
                idWorkspace,
                idGroup: originalGroupId,
                seg,
                svc: {
                    id: svcSnap.id,
                    name: svcSnap.name,
                    price: svcSnap.price,
                    discount: svcSnap.discount,
                    duration: svcSnap.duration,
                    maxParticipants: svcSnap.maxParticipants,
                },
                timeZoneWorkspace,
                note: note ?? null,
                customer,
                autoConfirmClientBookings: true,
                eventSourceType,
            });

            return { targetEventRaw, action };
        },
    });

    return {
        ok: true as const,
        outcome: "move_single_participant_in_class" as const,
        fromEventId: original.id,
        notification: {
            idBooking: bookingId,
            type: "single-service" as const,
        },
        appointment: {
            startLocalISO: seg.start.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
            endLocalISO: seg.end.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
            timeZoneClient,
            timeZoneWorkspace,
            totalDurationMin: dur,
        },
        assignments: [
            {
                serviceId: seg.serviceId,
                userId: seg.userId,
                startUTC: seg.start.toISOString(),
                endUTC: seg.end.toISOString(),
                startLocalClient: seg.start.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
                endLocalClient: seg.end.clone().tz(timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
            },
        ],
        created: action === "created" ? [targetEvent] : [],
        updated: action === "joined" || action === "already-in" ? [targetEvent] : [],
        deleted: deletedEventIds,
    };
};
