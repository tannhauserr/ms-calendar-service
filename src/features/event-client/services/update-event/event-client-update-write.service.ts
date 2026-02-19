import { Event, Prisma } from "@prisma/client";
import prisma from "../../../../lib/prisma";
import CustomError from "../../../../models/custom-error/CustomError";
import { ErrorCatalogByDomain } from "../../../../models/error-codes";
import moment from "moment";
import { CONSOLE_COLOR } from "../../../../constant/console-color";
import { TIME_SECONDS } from "../../../../constant/time";
import {
    computeSlotConfig,
} from "../../../../services/@database/event/availability-special.service";
import { RedisStrategyFactory } from "../../../../services/@redis/cache/strategies/redisStrategyFactory";
import { _getServicesSnapshotById } from "../../../../services/@database/event/util/getInfoServices";
import { IRedisRoundRobinStrategy } from "../../../../services/@redis/cache/strategies/roundRobin/interfaces";
import {
    AvailabilityRecheckPolicy,
    BookingInPastPolicy,
    EventOwnershipPolicy,
    EventWorkspacePolicy,
    FastPathSingleUpdateFlowStrategy,
    GroupEditServiceSetPolicy,
    InputFormatPolicy,
    InputRequiredPolicy,
    OriginalEventExistsPolicy,
    OverlappingAssignmentPolicy,
    PureClassEditUpdateFlowStrategy,
    RebuildBookingUpdateFlowStrategy,
    StaffAssignablePolicy,
    resolveUpdateFlowStrategy,
    type UpdateFlowStrategy,
} from "../../domain";
import type { AddFromWebDeps, UpdateFromWebInput } from "../create-event/event-client-write.types";
import { EventClientAvailabilityService } from "../availability";
import { EventClientUpdatePersistence } from "../persistence";
import {
    runFastPathSingleFlow,
    runPureClassEditFlow,
    runRebuildBookingFlow,
} from "./flows";

type UpdateMode = "single" | "group";
const withCatalogMessage = (catalogMessage: string, detail: string) => `${catalogMessage} ${detail}`;

export class EventClientUpdateWriteService {
    private readonly persistence = new EventClientUpdatePersistence();
    private readonly availabilityService = new EventClientAvailabilityService();

    private readonly updateFlowStrategies: UpdateFlowStrategy[] = [
        new PureClassEditUpdateFlowStrategy(),
        new FastPathSingleUpdateFlowStrategy(),
        new RebuildBookingUpdateFlowStrategy(),
    ];

    /**
     * Punto de entrada para actualizar citas individuales desde la web publica.
     */
    public async updateEventFromWeb(input: UpdateFromWebInput, deps: AddFromWebDeps) {
        console.log(`${CONSOLE_COLOR.FgCyan}[updateSingleEventFromWeb] input SINGLE:`, input, `${CONSOLE_COLOR.Reset}`);
        return this.updateEventFromWebBase(input, deps, "single");
    }

    private _withGroupFields<T extends { groupEvents?: any }>(event: T | null) {
        if (!event || !event.groupEvents) return event;
        const group = event.groupEvents;
        return {
            ...event,
            idWorkspaceFk: group.idWorkspaceFk,
            idCompanyFk: group.idCompanyFk,
            commentClient: group.commentClient,
            isCommentRead: group.isCommentRead,
            eventSourceType: group.eventSourceType,
            eventStatusType: group.eventStatusType,
            timeZone: group.timeZone,
            eventParticipant: group.eventParticipant ?? (event as any).eventParticipant ?? [],
        };
    }

    /**
     * Elige un staff aplicando Weighted Smooth Round Robin con hold temporal en Redis.
     */
    private chooseStaffWithRR = async (
        idWorkspace: string,
        idBookingPage: string | undefined,
        idService: string,
        start: Date,
        end: Date,
        eligibles: string[],
        weightsMap: Record<string, number>
    ): Promise<string | null> => {
        if (!eligibles.length) return null;

        const rr = RedisStrategyFactory.getStrategy("roundRobin") as IRedisRoundRobinStrategy;

        const acquired = await rr.acquireHold({
            idWorkspace,
            idService,
            startISO: start.toISOString(),
            endISO: end.toISOString(),
            ttlSec: TIME_SECONDS.MINUTE,
        });
        if (!acquired) return null;

        const chosen = await rr.pickWeightedSmoothRR({
            idWorkspace,
            idService,
            eligibles,
            weights: weightsMap,
            stateTTLSec: TIME_SECONDS.WEEK * 2,
        });

        if (!StaffAssignablePolicy.canAssign(chosen)) {
            await rr.releaseHold({
                idWorkspace,
                idService,
                startISO: start.toISOString(),
                endISO: end.toISOString(),
            });
            return null;
        }

        return chosen;
    };

    /**
     * Crea o une al cliente en un evento/grupo existente para el slot calculado.
     */
    private async createOrJoinGroupEvent(
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
            eventSourceType: "PLATFORM" | "WEB" | "WIDGET" | "GOOGLE" | "BOT";
        }
    ): Promise<{ event: Event; action: "created" | "joined" | "already-in" }> {
        const {
            idWorkspace,
            idCompany,
            seg,
            svc,
            timeZoneWorkspace,
            note,
            isCommentRead,
            customer,
            autoConfirmClientBookings,
            eventSourceType: eventSourceTypeFromParams,
        } = params;

        const startDate = seg.start.toDate();
        const endDate = seg.end.toDate();
        const capacity = Math.max(1, svc.maxParticipants ?? 1);
        const isGroup = capacity > 1;

        const eventStatus = autoConfirmClientBookings ? "ACCEPTED" : "PENDING";
        const participantStatus = autoConfirmClientBookings ? "ACCEPTED" : "PENDING";
        const eventSourceType = eventSourceTypeFromParams ?? "WEB";

        const CANCELLED_STATES = ["CANCELLED_BY_CLIENT", "CANCELLED_BY_CLIENT_REMOVED", "CANCELLED"];

        await tx.$executeRawUnsafe(
            `SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`,
            `${seg.userId}|${seg.serviceId}`,
            seg.start.toISOString()
        );

        const existing = await tx.event.findFirst({
            where: {
                idServiceFk: seg.serviceId,
                idUserPlatformFk: seg.userId,
                startDate,
                endDate,
                groupEvents: { idWorkspaceFk: idWorkspace },
            },
            select: { id: true, idGroup: true },
        });

        if (existing) {
            if (!isGroup) {
                const same = await tx.eventParticipant.findFirst({
                    where: {
                        idGroup: existing.idGroup,
                        idClientWorkspaceFk: customer.idClientWorkspace,
                        deletedDate: null,
                    },
                    select: { id: true },
                });

                const ev = await tx.event.findUnique({
                    where: { id: existing.id },
                    include: { groupEvents: true },
                });

                if (same) return { event: ev!, action: "already-in" };
                throw new Error(
                    withCatalogMessage(
                        ErrorCatalogByDomain.booking.availability.BOOKING_ERR_OVERLAP_CONFLICT.message,
                        "Ese horario ya está ocupado."
                    )
                );
            }

            const [count, already] = await Promise.all([
                tx.eventParticipant.count({
                    where: { idGroup: existing.idGroup, deletedDate: null },
                }),
                tx.eventParticipant.findFirst({
                    where: {
                        idGroup: existing.idGroup,
                        idClientWorkspaceFk: customer.idClientWorkspace,
                        deletedDate: null,
                    },
                    select: { id: true },
                }),
            ]);

            const ev = await tx.event.findUnique({
                where: { id: existing.id },
                include: { groupEvents: true },
            });

            if (already) return { event: ev!, action: "already-in" };
            if (count >= capacity) {
                throw new Error(
                    withCatalogMessage(
                        ErrorCatalogByDomain.booking.common.BOOKING_ERR_GENERIC.message,
                        "No quedan plazas disponibles en ese grupo."
                    )
                );
            }

            await tx.eventParticipant.create({
                data: {
                    idGroup: existing.idGroup,
                    idClientFk: customer.id,
                    idClientWorkspaceFk: customer.idClientWorkspace,
                    eventStatusType: participantStatus,
                },
            });

            return { event: ev!, action: "joined" };
        }

        const overlappingOther = await tx.event.findFirst({
            where: {
                idUserPlatformFk: seg.userId,
                startDate: { lt: endDate },
                endDate: { gt: startDate },
                deletedDate: null,
                groupEvents: {
                    idWorkspaceFk: idWorkspace,
                    eventStatusType: {
                        notIn: CANCELLED_STATES as any,
                    },
                },
            },
            select: { id: true },
        });
        if (!AvailabilityRecheckPolicy.isAvailable(!OverlappingAssignmentPolicy.hasConflict(overlappingOther))) {
            throw new Error(
                withCatalogMessage(
                    ErrorCatalogByDomain.booking.availability.BOOKING_ERR_OVERLAP_CONFLICT.message,
                    "Ese profesional ya tiene otro evento en ese horario."
                )
            );
        }

        let group = params.idGroup
            ? await tx.groupEvents.findUnique({ where: { id: params.idGroup } })
            : null;

        if (!group) {
            group = await tx.groupEvents.create({
                data: {
                    ...(params.idGroup ? { id: params.idGroup } : {}),
                    title: (svc.name ?? "Cita").slice(0, 100),
                    startDate,
                    endDate,
                    description: null,
                    idCompanyFk: idCompany,
                    idWorkspaceFk: idWorkspace,
                    commentClient: note ?? null,
                    isCommentRead: isCommentRead ?? false,
                    eventStatusType: eventStatus,
                    timeZone: timeZoneWorkspace,
                    eventParticipant: {
                        create: {
                            idClientFk: customer.id,
                            idClientWorkspaceFk: customer.idClientWorkspace,
                            eventStatusType: participantStatus,
                        },
                    },
                    eventSourceType,
                },
            });
        } else {
            const existingParticipant = await tx.eventParticipant.findFirst({
                where: {
                    idGroup: group.id,
                    idClientWorkspaceFk: customer.idClientWorkspace,
                    deletedDate: null,
                },
                select: { id: true },
            });
            if (!existingParticipant) {
                await tx.eventParticipant.create({
                    data: {
                        idGroup: group.id,
                        idClientFk: customer.id,
                        idClientWorkspaceFk: customer.idClientWorkspace,
                        eventStatusType: participantStatus,
                    },
                });
            }
        }

        const ev = await tx.event.create({
            data: {
                idCompanyFk: idCompany,
                idGroup: group.id,
                idServiceFk: seg.serviceId,
                idUserPlatformFk: seg.userId,
                startDate,
                endDate,
                title: svc.name ?? "Cita",
                description: null,
                eventPurposeType: "APPOINTMENT",
                serviceNameSnapshot: svc.name ?? null,
                servicePriceSnapshot: typeof svc.price === "number" ? svc.price : null,
                serviceDiscountSnapshot: typeof svc.discount === "number" ? svc.discount : null,
                serviceDurationSnapshot: typeof svc.duration === "number" ? svc.duration : null,
                serviceMaxParticipantsSnapshot:
                    typeof svc.maxParticipants === "number" ? svc.maxParticipants : null,
            },
            include: { groupEvents: true },
        });

        await this._syncGroupStartEndDates(tx, group.id);

        return { event: ev as any, action: "created" };
    }

    private async _syncGroupStartEndDates(
        tx: Prisma.TransactionClient,
        idGroup: string
    ): Promise<void> {
        const agg = await tx.event.aggregate({
            where: {
                idGroup,
                deletedDate: null,
            },
            _min: { startDate: true },
            _max: { endDate: true },
        });

        const startDate = agg._min?.startDate ?? null;
        const endDate = agg._max?.endDate ?? null;
        if (!startDate || !endDate) return;

        await tx.groupEvents.update({
            where: { id: idGroup },
            data: {
                startDate,
                endDate,
            },
        });
    }

    /**
     * Ejecuta el flujo de edición pura de una clase.
     */
    private async _runPureClassEditFlow(params: {
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
        eventSourceType: "PLATFORM" | "WEB" | "WIDGET" | "GOOGLE" | "BOT";
    }) {
        return runPureClassEditFlow({
            ...params,
            persistence: this.persistence,
            chooseStaffWithRR: this.chooseStaffWithRR,
            createOrJoinGroupEvent: this.createOrJoinGroupEvent.bind(this),
        });
    }

    /**
     * Ejecuta el flujo rápido de actualización para una cita de un solo segmento.
     */
    private async _runFastPathSingleFlow(params: {
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
    }) {
        return runFastPathSingleFlow({
            ...params,
            availabilityService: this.availabilityService,
            persistence: this.persistence,
            chooseStaffWithRR: this.chooseStaffWithRR,
        });
    }

    /**
     * Ejecuta el flujo de reconstrucción de reserva para updates complejos.
     */
    private async _runRebuildBookingFlow(params: {
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
    }) {
        return runRebuildBookingFlow({
            ...params,
            availabilityService: this.availabilityService,
            persistence: this.persistence,
            chooseStaffWithRR: this.chooseStaffWithRR,
        });
    }

    private async updateEventFromWebBase(
        input: UpdateFromWebInput,
        deps: AddFromWebDeps,
        mode: UpdateMode
    ) {
        try {
            const {
                idCompany,
                idWorkspace,
                timeZoneClient,
                startLocalISO,
                attendees,
                idEvent,
                note,
                isCommentRead,
                customer,
                deletedEventIds = [],
                eventSourceType = "WEB",
            } = input;

            const {
                timeZoneWorkspace,
                businessHoursService,
                workerHoursService,
                temporaryHoursService,
                bookingConfig,
                cache,
            } = deps;

            console.log(
                CONSOLE_COLOR.FgMagenta,
                `[updateEventFromWebBase][${mode}] input:`,
                {
                    ...input,
                    attendeesLen: attendees?.length,
                    deletedEventIdsLen: deletedEventIds?.length ?? 0,
                },
                CONSOLE_COLOR.Reset
            );

            if (!idEvent) {
                throw new Error(
                    withCatalogMessage(
                        ErrorCatalogByDomain.booking.validation.BOOKING_ERR_VALIDATION_INPUT.message,
                        "Falta idEvent"
                    )
                );
            }
            if (!InputRequiredPolicy.hasRequiredContext({ idCompany, idWorkspace, timeZoneWorkspace, timeZoneClient })) {
                throw new Error(
                    withCatalogMessage(
                        ErrorCatalogByDomain.booking.validation.BOOKING_ERR_VALIDATION_INPUT.message,
                        "Faltan idCompany/idWorkspace/timeZoneWorkspace/timeZoneClient"
                    )
                );
            }
            if (!InputFormatPolicy.isStartLocalISO(startLocalISO)) {
                throw new Error(
                    withCatalogMessage(
                        ErrorCatalogByDomain.booking.validation.BOOKING_ERR_VALIDATION_INPUT.message,
                        "startLocalISO debe ser YYYY-MM-DDTHH:mm:ss"
                    )
                );
            }
            if (!InputRequiredPolicy.hasAttendees(attendees)) {
                throw new Error(
                    withCatalogMessage(
                        ErrorCatalogByDomain.booking.validation.BOOKING_ERR_VALIDATION_INPUT.message,
                        "attendees vacio"
                    )
                );
            }
            if (!InputRequiredPolicy.hasCustomerIdentifiers(customer)) {
                throw new Error(
                    withCatalogMessage(
                        ErrorCatalogByDomain.booking.validation.BOOKING_ERR_VALIDATION_INPUT.message,
                        "Falta customer.id/customer.idClientWorkspace"
                    )
                );
            }

            const startClient = moment.tz(startLocalISO, "YYYY-MM-DDTHH:mm:ss", timeZoneClient);
            const CANCELLED_STATES = ["CANCELLED_BY_CLIENT", "CANCELLED_BY_CLIENT_REMOVED", "CANCELLED"];

            if (!startClient.isValid()) {
                throw new Error(
                    withCatalogMessage(
                        ErrorCatalogByDomain.booking.validation.BOOKING_ERR_VALIDATION_INPUT.message,
                        "startLocalISO invalido"
                    )
                );
            }

            const startWS = startClient.clone().tz(timeZoneWorkspace);
            const dateWS = startWS.format("YYYY-MM-DD");

            const todayWS = moment().tz(timeZoneWorkspace).startOf("day");
            if (BookingInPastPolicy.isDayInPast(startWS, todayWS)) {
                console.log(CONSOLE_COLOR.BgRed, "[updateEventFromWebBase] Dia pasado en TZ workspace", CONSOLE_COLOR.Reset);
                return {
                    ok: false as const,
                    code: "BOOKING_ERR_DAY_IN_PAST",
                    message: "El dia seleccionado ya ha pasado en la zona horaria del negocio.",
                };
            }

            const { roundedNow, isToday } = computeSlotConfig({
                intervalMinutes: 5,
                timeZoneWorkspace,
                dayStartLocal: startWS.clone().startOf("day"),
            });

            if (BookingInPastPolicy.isTimeInPast({ isToday, startWS, minAllowedStartWS: roundedNow })) {
                console.log(CONSOLE_COLOR.BgRed, "[updateEventFromWebBase] Hora pasada en TZ workspace", CONSOLE_COLOR.Reset);
                return {
                    ok: false as const,
                    code: "BOOKING_ERR_TIME_PASSED",
                    message: "La hora seleccionada ya ha pasado hoy en la zona horaria del negocio.",
                };
            }

            const originalRaw = await prisma.event.findUnique({
                where: { id: idEvent },
                include: {
                    groupEvents: {
                        include: {
                            eventParticipant: {
                                where: { deletedDate: null },
                                select: { idClientFk: true, idClientWorkspaceFk: true },
                            },
                        },
                    },
                },
            });
            const original = this._withGroupFields(originalRaw as any);
            if (!OriginalEventExistsPolicy.exists(original)) {
                throw new Error(
                    withCatalogMessage(
                        ErrorCatalogByDomain.booking.common.BOOKING_ERR_GENERIC.message,
                        "Evento original no encontrado"
                    )
                );
            }
            if (!EventWorkspacePolicy.belongsToWorkspace(original.idWorkspaceFk, idWorkspace)) {
                throw new Error(
                    withCatalogMessage(
                        ErrorCatalogByDomain.booking.authorization.BOOKING_ERR_NOT_OWNER.message,
                        "El evento original no pertenece a este workspace"
                    )
                );
            }

            const isOwner = EventOwnershipPolicy.isOwner(original.eventParticipant, {
                id: customer.id,
                idClientWorkspace: customer.idClientWorkspace!,
            });
            if (!isOwner) {
                throw new Error(
                    withCatalogMessage(
                        ErrorCatalogByDomain.booking.authorization.BOOKING_ERR_NOT_OWNER.message,
                        "Este cliente no esta asociado al evento original"
                    )
                );
            }

            const bookingId = original.idGroup ?? original.id;
            const groupId = original.idGroup ?? original.id;
            const groupEvents = await prisma.event.findMany({
                where: {
                    idGroup: groupId,
                    deletedDate: null,
                    groupEvents: { idWorkspaceFk: idWorkspace },
                },
                orderBy: { startDate: "asc" },
            });
            const originalEvents = groupEvents.length ? groupEvents : [original];
            const originalIds = new Set(originalEvents.map((e: any) => e.id));

            const explicitDeletes = new Set((deletedEventIds || []).filter((id) => originalIds.has(id)));

            const maxPerBooking = bookingConfig?.limits?.maxServicesPerBooking ?? 5;
            const fastPathSingle =
                attendees.length === 1 &&
                originalEvents.length === 1 &&
                explicitDeletes.size === 0;

            const needServiceIds = [...new Set(attendees.map((a) => a.serviceId))];
            const [serviceById, weightsMap] = await Promise.all([
                _getServicesSnapshotById({ idCompany, idWorkspace, attendees }),
                (async () => {
                    const rawIds = Array.isArray(bookingConfig?.resources?.ids)
                        ? (bookingConfig.resources.ids as unknown as [string, number][])
                        : [];
                    return Object.fromEntries(rawIds.map(([id, w]) => [id, Number.isFinite(w) ? w : 100]));
                })(),
            ]);

            const originalServiceIds = new Set(
                originalEvents
                    .map((e: any) => e.idServiceFk)
                    .filter((id): id is string => !!id)
            );
            const requestedServiceIds = new Set(needServiceIds);
            const sameServiceSet =
                originalServiceIds.size === requestedServiceIds.size &&
                [...originalServiceIds].every((id) => requestedServiceIds.has(id));

            if (!GroupEditServiceSetPolicy.canEdit(mode, sameServiceSet)) {
                return {
                    ok: false as const,
                    code: "BOOKING_ERR_SERVICE_CHANGED_ON_EDIT",
                    message: "Solo puedes cambiar la fecha y hora de la cita, no los servicios.",
                };
            }

            const classServiceId = needServiceIds.length === 1 ? needServiceIds[0] : null;
            const classSnap = classServiceId ? (serviceById as any)[classServiceId] : undefined;
            const classCapacity = classSnap != null ? Math.max(1, classSnap.maxParticipants ?? 1) : 1;

            const isPureClassEdit =
                !!classServiceId &&
                classCapacity > 1 &&
                attendees.length === 1 &&
                originalEvents.length === 1 &&
                explicitDeletes.size === 0;

            const selectedFlowStrategy = resolveUpdateFlowStrategy(this.updateFlowStrategies, {
                isPureClassEdit,
                fastPathSingle,
            });

            return selectedFlowStrategy.execute<any>({
                runPureClassEdit: async () =>
                    this._runPureClassEditFlow({
                        idCompany,
                        idWorkspace,
                        timeZoneClient,
                        timeZoneWorkspace,
                        startWS,
                        attendees,
                        original,
                        bookingId,
                        groupId,
                        serviceById: serviceById as Record<string, any>,
                        weightsMap,
                        cache,
                        customer: {
                            id: customer.id,
                            idClientWorkspace: customer.idClientWorkspace!,
                        },
                        note,
                        eventSourceType,
                    }),
                runFastPathSingle: async () =>
                    this._runFastPathSingleFlow({
                        attendees,
                        serviceById: serviceById as Record<string, any>,
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
                        cancelledStates: CANCELLED_STATES,
                        groupId,
                        note,
                        isCommentRead,
                        original,
                        timeZoneClient,
                        bookingId,
                    }),
                runRebuildBooking: async () =>
                    this._runRebuildBookingFlow({
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
                        serviceById: serviceById as Record<string, any>,
                        weightsMap,
                        groupId,
                        note,
                        isCommentRead,
                        customer,
                        timeZoneClient,
                        bookingId,
                        original,
                    }),
            });
        } catch (error: any) {
            console.error("Error en EventV2Service.updateEventFromWebBase:", error);
            throw new CustomError("Error al actualizar evento", error);
        }
    }

}
