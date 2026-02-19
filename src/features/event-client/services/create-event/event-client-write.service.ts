import { Event, Prisma } from "@prisma/client";
import moment from "moment";

import { v4 as uuidv4 } from "uuid";
import { CONSOLE_COLOR } from "../../../../constant/console-color";
import { TIME_SECONDS } from "../../../../constant/time";
import CustomError from "../../../../models/custom-error/CustomError";
import { ErrorCatalogByDomain, withCatalogMessage } from "../../../../models/error-codes";
import { computeSlotConfig, getUsersWhoCanPerformService_SPECIAL, getEventsOverlappingRange_SPECIAL, groupEventsByUser_SPECIAL, subtractBusyFromShift_SPECIAL, mergeTouchingWindows_SPECIAL, assignSequentially_SPECIAL } from "../../../../services/@database/event/availability-special.service";
import { _getServicesSnapshotById } from "../../../../services/@database/event/util/getInfoServices";
import { RedisStrategyFactory } from "../../../../services/@redis/cache/strategies/redisStrategyFactory";
import { IRedisRoundRobinStrategy } from "../../../../services/@redis/cache/strategies/roundRobin/interfaces";
import { InputRequiredPolicy, InputFormatPolicy, BookingInPastPolicy, EligibleProfessionalsPolicy, ServiceById, AssignmentSegment, getAssignmentMode, AssignmentMode, AssignmentModeStrategy, SingleGroupAssignmentStrategy, SingleIndividualAssignmentStrategy, MultiIndividualAssignmentStrategy, AssignmentStrategyInput } from "../../domain";
import { BookingPersistence } from "../persistence";
import { AddFromWebInput, AddFromWebDeps, StartContextResult, AvailabilityContext, MomentRange, ResolveAssignmentResult } from "./event-client-write.types";


export class EventClientWriteService {
    private readonly bookingPersistence = new BookingPersistence();

    // ───────────────── addEventFromWeb ─────────────────

    async addEventFromWeb(input: AddFromWebInput, deps: AddFromWebDeps) {
        try {
            const {
                idCompany,
                idWorkspace,
                timeZoneClient,
                startLocalISO,
                attendees,
                excludeEventId,
                note,
                isCommentRead,
                customer,
                eventSourceType = "WEB",
            } = input;
            const {
                timeZoneWorkspace,
                businessHoursService,
                workerHoursService,
                temporaryHoursService,
                bookingConfig,
                cache,
                autoConfirmClientBookings,
            } = deps;

            console.log(CONSOLE_COLOR.FgMagenta, "[addEventFromWeb] input:", input, CONSOLE_COLOR.Reset);
            console.log(CONSOLE_COLOR.FgCyan, "[addEventFromWeb] startLocalISO:", startLocalISO, CONSOLE_COLOR.Reset);

            this._validateAddFromWebInput(input, timeZoneWorkspace);

            const startContext = this._resolveStartContext(
                startLocalISO,
                timeZoneClient,
                timeZoneWorkspace,
            );
            if (!startContext.ok) {
                return { ok: false as const };
            }
            const { startWS, dateWS, isToday, roundedNow } = startContext;

            const availability = await this._buildAvailabilityContext({
                idCompany,
                idWorkspace,
                dateWS,
                startWS,
                isToday,
                roundedNow,
                attendees,
                excludeEventId,
                timeZoneWorkspace,
                cache,
                bookingConfig,
                businessHoursService,
                workerHoursService,
                temporaryHoursService,
            });
            if (!availability) {
                return { ok: false as const };
            }

            const assignmentResult = await this._resolveAssignment({
                idWorkspace,
                startWS,
                attendees,
                serviceById: availability.serviceById,
                userIdsByService: availability.userIdsByService,
                freeWindowsByUser: availability.freeWindowsByUser,
                weightsMap: availability.weightsMap,
                excludeEventId,
                customer,
            });
            if (!assignmentResult.ok) {
                return { ok: false as const };
            }

            const created = await this._createEventsForAssignment({
                assignment: assignmentResult.assignment,
                serviceById: availability.serviceById,
                idWorkspace,
                idCompany,
                sharedGroupId: assignmentResult.sharedGroupId,
                timeZoneWorkspace,
                note,
                isCommentRead,
                customer,
                autoConfirmClientBookings,
                eventSourceType,
            });

            return this._buildAddFromWebResponse({
                startWS,
                timeZoneClient,
                timeZoneWorkspace,
                assignment: assignmentResult.assignment,
                attendees,
                created,
            });
        } catch (error: any) {
            console.error("Error en EventV2Service:", error);
            throw new CustomError("Error al crear evento", error);
        }
    }

    /**
     * Elige un staff aplicando Weighted Smooth Round Robin
     * con hold temporal en Redis para evitar colisiones.
     */
    chooseStaffWithRR = async (
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

        // 1) Hold del slot (scoped por workspace + service)
        const acquired = await rr.acquireHold({
            idWorkspace,
            idService,
            startISO: start.toISOString(),
            endISO: end.toISOString(),
            ttlSec: TIME_SECONDS.MINUTE,
        });
        if (!acquired) return null; // otro proceso está reservando este mismo slot

        // 2) Weighted Smooth RR
        const chosen = await rr.pickWeightedSmoothRR({
            idWorkspace,
            idService,
            eligibles,
            weights: weightsMap,
            stateTTLSec: TIME_SECONDS.WEEK * 2,
        });

        if (!chosen) {
            await rr.releaseHold({
                idWorkspace,
                idService,
                startISO: start.toISOString(),
                endISO: end.toISOString(),
            });
            return null;
        }

        // Nota: el hold se mantiene hasta que completes/abortes la creación.
        return chosen;
    };

    /**
     * Crea o une a un evento de grupo (capacidad = maxParticipants del servicio).
     */
    async createOrJoinGroupEvent(
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
            eventSourceType: 'PLATFORM' | 'WEB' | 'WIDGET' | 'GOOGLE' | 'BOT';
        }
    ): Promise<{ event: Event; action: "created" | "joined" | "already-in" }> {
        const { idWorkspace, idCompany, seg, svc, timeZoneWorkspace, note, isCommentRead, customer, autoConfirmClientBookings, eventSourceType: EventSourceTypeFromParams } = params;
        const startDate = seg.start.toDate();
        const endDate = seg.end.toDate();
        const capacity = Math.max(1, svc.maxParticipants ?? 1);
        const isGroup = capacity > 1;

        // Determinar el estado según configuración
        const eventStatus = autoConfirmClientBookings ? 'ACCEPTED' : 'PENDING';
        const participantStatus = autoConfirmClientBookings ? 'ACCEPTED' : 'PENDING';
        const eventSourceType = EventSourceTypeFromParams ?? 'WEB';


        const CANCELLED_STATES = [
            'CANCELLED_BY_CLIENT',
            'CANCELLED_BY_CLIENT_REMOVED',
            "CANCELLED"
        ];

        // Lock por (pro+servicio+inicio)
        await tx.$executeRawUnsafe(
            `SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`,
            `${seg.userId}|${seg.serviceId}`,
            seg.start.toISOString()
        );

        // ¿Evento exacto ya existe?
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
            // Individual
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

            // Grupal
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

        // Evitar solape con otros eventos del pro
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
        if (overlappingOther) {
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
                    // startDate/endDate se sincronizan al final con los eventos reales del grupo
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

        // Crear evento nuevo
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
                serviceMaxParticipantsSnapshot: typeof svc.maxParticipants === "number" ? svc.maxParticipants : null,
            },
            include: { groupEvents: true },
        });

        await this._syncGroupStartEndDates(tx, group.id);

        return { event: ev as any, action: "created" };
    }

    private async _syncGroupStartEndDates(tx: Prisma.TransactionClient, idGroup: string): Promise<void> {
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
     * Valida campos mínimos de entrada para alta web.
     */
    private _validateAddFromWebInput(
        input: AddFromWebInput,
        timeZoneWorkspace: string
    ): void {
        if (
            !InputRequiredPolicy.hasRequiredContext({
                idCompany: input.idCompany,
                idWorkspace: input.idWorkspace,
                timeZoneWorkspace,
                timeZoneClient: input.timeZoneClient,
            })
        ) {
            throw new Error(
                withCatalogMessage(
                    ErrorCatalogByDomain.booking.validation.BOOKING_ERR_VALIDATION_INPUT.message,
                    "Faltan idCompany/idWorkspace/timeZoneWorkspace/timeZoneClient"
                )
            );
        }

        if (!InputFormatPolicy.isStartLocalISO(input.startLocalISO)) {
            throw new Error(
                withCatalogMessage(
                    ErrorCatalogByDomain.booking.validation.BOOKING_ERR_VALIDATION_INPUT.message,
                    "startLocalISO debe ser YYYY-MM-DDTHH:mm:ss"
                )
            );
        }

        if (!InputRequiredPolicy.hasAttendees(input.attendees)) {
            throw new Error(
                withCatalogMessage(
                    ErrorCatalogByDomain.booking.validation.BOOKING_ERR_VALIDATION_INPUT.message,
                    "attendees vacío"
                )
            );
        }

        if (!InputRequiredPolicy.hasCustomerIdentifiers(input.customer)) {
            throw new Error(
                withCatalogMessage(
                    ErrorCatalogByDomain.booking.validation.BOOKING_ERR_VALIDATION_INPUT.message,
                    "Falta customer.id/customer.idClientWorkspace"
                )
            );
        }
    }

    /**
     * Convierte la fecha cliente a TZ workspace y valida que no esté en pasado.
     */
    private _resolveStartContext(
        startLocalISO: string,
        timeZoneClient: string,
        timeZoneWorkspace: string
    ): StartContextResult {
        const startClient = moment.tz(startLocalISO, "YYYY-MM-DDTHH:mm:ss", timeZoneClient);
        if (!startClient.isValid()) {
            throw new Error(
                withCatalogMessage(
                    ErrorCatalogByDomain.booking.validation.BOOKING_ERR_VALIDATION_INPUT.message,
                    "startLocalISO inválido"
                )
            );
        }

        const startWS = startClient.clone().tz(timeZoneWorkspace);
        const dateWS = startWS.format("YYYY-MM-DD");

        const todayWS = moment().tz(timeZoneWorkspace).startOf("day");
        if (BookingInPastPolicy.isDayInPast(startWS, todayWS)) {
            console.log(CONSOLE_COLOR.BgRed, "[addEventFromWeb] Día pasado en TZ workspace", CONSOLE_COLOR.Reset);
            return { ok: false };
        }

        const { roundedNow, isToday } = computeSlotConfig({
            intervalMinutes: 5,
            timeZoneWorkspace,
            dayStartLocal: startWS.clone().startOf("day"),
        });

        if (BookingInPastPolicy.isTimeInPast({ isToday, startWS, minAllowedStartWS: roundedNow })) {
            console.log(CONSOLE_COLOR.BgRed, "[addEventFromWeb] Hora pasada en TZ workspace", CONSOLE_COLOR.Reset);
            return { ok: false };
        }

        return {
            ok: true,
            startWS,
            dateWS,
            isToday,
            roundedNow,
        };
    }

    /**
     * Resuelve elegibles por servicio respetando staff fijo cuando viene en el payload.
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
     * Construye mapa de pesos para round-robin a partir de la config de booking.
     */
    private _buildWeightsMap(bookingConfig: AddFromWebDeps["bookingConfig"]): Record<string, number> {
        const rawIds = Array.isArray(bookingConfig?.resources?.ids)
            ? (bookingConfig.resources.ids as unknown as [string, number][])
            : [];

        return Object.fromEntries(
            rawIds.map(([id, weight]) => [id, Number.isFinite(weight) ? weight : 100])
        );
    }

    /**
     * Calcula disponibilidad efectiva por usuario para el día solicitado.
     */
    private async _buildAvailabilityContext(params: {
        idCompany: string;
        idWorkspace: string;
        dateWS: string;
        startWS: moment.Moment;
        isToday: boolean;
        roundedNow: moment.Moment;
        attendees: AddFromWebInput["attendees"];
        excludeEventId?: string;
        timeZoneWorkspace: string;
        cache?: AddFromWebDeps["cache"];
        bookingConfig: AddFromWebDeps["bookingConfig"];
        businessHoursService: AddFromWebDeps["businessHoursService"];
        workerHoursService: AddFromWebDeps["workerHoursService"];
        temporaryHoursService: AddFromWebDeps["temporaryHoursService"];
    }): Promise<AvailabilityContext | null> {
        const userIdsByService = await this._buildUserIdsByService(
            params.attendees,
            params.idWorkspace,
            params.cache
        );

        const allUserIds = Array.from(new Set(Array.from(userIdsByService.values()).flat()));
        if (!EligibleProfessionalsPolicy.hasAny(allUserIds)) {
            console.log(CONSOLE_COLOR.BgRed, "[addEventFromWeb] No hay profesionales elegibles", CONSOLE_COLOR.Reset);
            return null;
        }

        const businessHours = await params.businessHoursService.getBusinessHoursFromRedis(
            params.idCompany,
            params.idWorkspace
        );
        const workerHoursMap = await params.workerHoursService.getWorkerHoursFromRedis(
            allUserIds,
            params.idWorkspace
        );
        const temporaryHoursMap = await params.temporaryHoursService.getTemporaryHoursFromRedis(
            allUserIds,
            params.idWorkspace,
            { date: params.dateWS }
        );

        const events = await getEventsOverlappingRange_SPECIAL(
            params.idWorkspace,
            allUserIds,
            params.dateWS,
            params.dateWS,
            params.excludeEventId
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
            const busy = (eventsByUser[userId] || []).map((event) => ({
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

        const serviceById = (await _getServicesSnapshotById({
            idCompany: params.idCompany,
            idWorkspace: params.idWorkspace,
            attendees: params.attendees,
        })) as ServiceById;

        return {
            userIdsByService,
            freeWindowsByUser,
            serviceById,
            weightsMap: this._buildWeightsMap(params.bookingConfig),
        };
    }

    /**
     * Intenta asignar el evento a un grupo existente compatible.
     */
    private async _tryJoinExistingGroupAssignment(params: {
        idWorkspace: string;
        startWS: moment.Moment;
        attendees: AddFromWebInput["attendees"];
        serviceById: ServiceById;
        userIdsByService: Map<string, string[]>;
        excludeEventId?: string;
        customer: AddFromWebInput["customer"];
    }): Promise<AssignmentSegment[]> {
        const serviceRequest = params.attendees[0];
        const serviceSnapshot = params.serviceById[serviceRequest.serviceId];
        const duration = serviceRequest.durationMin ?? (serviceSnapshot?.duration ?? 0);
        const endWS = params.startWS.clone().add(duration, "minutes");
        const eligibleUsers = params.userIdsByService.get(serviceRequest.serviceId) ?? [];

        if (!eligibleUsers.length) {
            return [];
        }

        const overlappingEvents = await this.bookingPersistence.findOverlappingGroupCandidates({
            idWorkspace: params.idWorkspace,
            serviceId: serviceRequest.serviceId,
            eligibleUserIds: eligibleUsers,
            startDate: params.startWS.toDate(),
            endDate: endWS.toDate(),
            excludeEventId: params.excludeEventId,
        });

        const pick = (() => {
            if (!overlappingEvents.length) return null;
            const exact = overlappingEvents.find((event) =>
                moment(event.startDate).isSame(params.startWS, "minute") &&
                moment(event.endDate).isSame(endWS, "minute")
            );
            if (exact) return exact;
            return overlappingEvents
                .map((event) => ({
                    event,
                    diff: Math.abs(moment(event.startDate).diff(params.startWS, "minutes")),
                }))
                .sort((a, b) => a.diff - b.diff)[0].event;
        })();

        if (!pick || !pick.idUserPlatformFk) {
            return [];
        }

        const capacity = Math.max(1, serviceSnapshot?.maxParticipants ?? 1);
        const booked = pick.groupEvents?.eventParticipant?.length ?? 0;
        const hasSeat = booked < capacity;
        const alreadyIn = (pick.groupEvents?.eventParticipant ?? []).some(
            (participant) =>
                participant.idClientFk === params.customer.id ||
                participant.idClientWorkspaceFk === params.customer.idClientWorkspace
        );

        if (!hasSeat || alreadyIn) {
            return [];
        }

        return [
            {
                serviceId: serviceRequest.serviceId,
                userId: pick.idUserPlatformFk,
                start: params.startWS.clone().seconds(0).milliseconds(0),
                end: endWS.clone().seconds(0).milliseconds(0),
            },
        ];
    }

    /**
     * Resuelve asignación por estrategia y fallback a grupo existente cuando aplica.
     */
    private async _resolveAssignment(params: {
        idWorkspace: string;
        startWS: moment.Moment;
        attendees: AddFromWebInput["attendees"];
        serviceById: ServiceById;
        userIdsByService: Map<string, string[]>;
        freeWindowsByUser: Record<string, MomentRange[]>;
        weightsMap: Record<string, number>;
        excludeEventId?: string;
        customer: AddFromWebInput["customer"];
    }): Promise<ResolveAssignmentResult> {
        const mode = getAssignmentMode(params.attendees, params.serviceById);
        const sharedGroupId = mode === "multi-individual" ? uuidv4() : undefined;

        const strategies: Record<AssignmentMode, AssignmentModeStrategy> = {
            "single-group": new SingleGroupAssignmentStrategy(),
            "single-individual": new SingleIndividualAssignmentStrategy(),
            "multi-individual": new MultiIndividualAssignmentStrategy(),
        };

        const strategyInput: AssignmentStrategyInput = {
            idWorkspace: params.idWorkspace,
            startWS: params.startWS,
            attendees: params.attendees,
            serviceById: params.serviceById,
            userIdsByService: params.userIdsByService,
            freeWindowsByUser: params.freeWindowsByUser,
            weightsMap: params.weightsMap,
            chooseStaffWithRR: this.chooseStaffWithRR,
            assignSequentially: assignSequentially_SPECIAL,
        };

        let assignment: AssignmentSegment[] = [];
        if (mode === "single-group") {
            assignment = await this._tryJoinExistingGroupAssignment({
                idWorkspace: params.idWorkspace,
                startWS: params.startWS,
                attendees: params.attendees,
                serviceById: params.serviceById,
                userIdsByService: params.userIdsByService,
                excludeEventId: params.excludeEventId,
                customer: params.customer,
            });
        }

        if (assignment.length === 0) {
            const strategyResult = await strategies[mode].execute(strategyInput);
            if ("reason" in strategyResult) {
                if (mode === "single-group") {
                    console.log(CONSOLE_COLOR.BgRed, "[addEventFromWeb] Grupo: ningún pro disponible para el slot", CONSOLE_COLOR.Reset);
                } else if (mode === "single-individual") {
                    console.log(CONSOLE_COLOR.BgRed, "[addEventFromWeb] Individual: ningún pro disponible para el slot", CONSOLE_COLOR.Reset);
                } else if (strategyResult.reason === "NO_WINDOW") {
                    console.log(CONSOLE_COLOR.BgRed, "[addEventFromWeb] No hay hueco suficiente para al menos uno de los servicios.", CONSOLE_COLOR.Reset);
                } else {
                    console.log(CONSOLE_COLOR.BgRed, "[addEventFromWeb] El inicio elegido ya no está disponible (cambió la disponibilidad).", CONSOLE_COLOR.Reset);
                }
                return { ok: false };
            }

            assignment = strategyResult.assignment;
        }

        return {
            ok: true,
            assignment,
            sharedGroupId,
        };
    }

    /**
     * Persiste la asignación resuelta en una transacción y normaliza idGroup.
     */
    private async _createEventsForAssignment(params: {
        assignment: AssignmentSegment[];
        serviceById: ServiceById;
        idWorkspace: string;
        idCompany: string;
        sharedGroupId?: string;
        timeZoneWorkspace: string;
        note?: string;
        isCommentRead?: boolean;
        customer: AddFromWebInput["customer"];
        autoConfirmClientBookings: boolean;
        eventSourceType: AddFromWebInput["eventSourceType"];
    }) {
        return this.bookingPersistence.createAssignmentsAndSyncGroupId({
            assignment: params.assignment,
            createEvent: async (tx, segment) => {
                const service = params.serviceById[segment.serviceId];
                if (!service) {
                    throw new Error(
                        withCatalogMessage(
                            ErrorCatalogByDomain.booking.common.BOOKING_ERR_GENERIC.message,
                            "Servicio no disponible o no pertenece a este workspace."
                        )
                    );
                }

                return this.createOrJoinGroupEvent(tx, {
                    idWorkspace: params.idWorkspace,
                    idCompany: params.idCompany,
                    idGroup: params.sharedGroupId,
                    seg: segment,
                    svc: service,
                    timeZoneWorkspace: params.timeZoneWorkspace,
                    note: params.note,
                    isCommentRead: params.isCommentRead,
                    customer: {
                        id: params.customer.id,
                        idClientWorkspace: params.customer.idClientWorkspace!,
                    },
                    autoConfirmClientBookings: params.autoConfirmClientBookings,
                    eventSourceType: params.eventSourceType,
                });
            },
        });
    }

    /**
     * Extrae el evento núcleo desde una estructura creada por createOrJoinGroupEvent.
     */
    private _getCoreEvent(createdItem: any): { id?: string; idGroup?: string | null } | null {
        if (!createdItem) return null;
        if (createdItem.event) return createdItem.event as any;
        return createdItem as any;
    }

    /**
     * Construye el payload final de respuesta para addEventFromWeb.
     */
    private _buildAddFromWebResponse(params: {
        startWS: moment.Moment;
        timeZoneClient: string;
        timeZoneWorkspace: string;
        assignment: AssignmentSegment[];
        attendees: AddFromWebInput["attendees"];
        created: any[];
    }) {
        const totalDuration = params.attendees.reduce((acc, attendee) => acc + attendee.durationMin, 0);
        const endWS = params.startWS.clone().add(totalDuration, "minutes");

        const notifications = params.created
            .map((item) => item?.notification)
            .filter((notification) => !!notification);

        const primaryNotification = notifications[0] ?? null;

        const coreEventsForGroup = params.created
            .map((item) => this._getCoreEvent(item))
            .filter((event) => event && typeof event.id === "string") as {
                id: string;
                idGroup?: string | null;
            }[];

        const groupId =
            coreEventsForGroup.length > 0
                ? coreEventsForGroup[0].idGroup ?? coreEventsForGroup[0].id
                : null;

        return {
            ok: true as const,
            appointment: {
                startLocalISO: params.startWS.clone().tz(params.timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
                endLocalISO: endWS.clone().tz(params.timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
                timeZoneClient: params.timeZoneClient,
                timeZoneWorkspace: params.timeZoneWorkspace,
                totalDurationMin: totalDuration,
            },
            assignments: params.assignment.map((segment) => ({
                serviceId: segment.serviceId,
                userId: segment.userId,
                startUTC: segment.start.toISOString(),
                endUTC: segment.end.toISOString(),
                startLocalClient: segment.start.clone().tz(params.timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
                endLocalClient: segment.end.clone().tz(params.timeZoneClient).format("YYYY-MM-DDTHH:mm:ss"),
            })),
            created: params.created,
            notification: primaryNotification,
            notifications,
            idGroup: groupId,
        };
    }

}
