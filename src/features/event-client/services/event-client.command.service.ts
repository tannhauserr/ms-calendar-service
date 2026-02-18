import { CONSOLE_COLOR } from "../../../constant/console-color";
import { pickHttpStatus } from "../../../constant/errors/codes";
import prisma from "../../../lib/prisma";
import CustomError from "../../../models/custom-error/CustomError";
import { ActionKey } from "../../../models/notification/util/action-to-senctions";
import { createNotificationByClient } from "../../../models/notification/util/trigger/for-action";
import { AddEventFromWebUseCase } from "../domain";
import { BusinessHourService } from "../../../services/@database/all-business-services/business-hours/business-hours.service";
import { TemporaryBusinessHourService } from "../../../services/@database/all-business-services/temporary-business-hour/temporary-business-hour.service";
import { WorkerBusinessHourService } from "../../../services/@database/all-business-services/worker-business-hours/worker-business-hours.service";
import { EventClientWriteService } from "./event-client-write.service";
import { ClientEventService } from "../../../services/@database/event/client-event.service";
import moment from "moment-timezone";

export class EventClientCommandService {
    private readonly businessHoursService = new BusinessHourService();
    private readonly workerHoursService = new WorkerBusinessHourService();
    private readonly temporaryHoursService = new TemporaryBusinessHourService();
    private readonly addEventFromWebUseCase = new AddEventFromWebUseCase();
    private readonly eventClientWriteService = new EventClientWriteService();
    private readonly legacyClientEventService = new ClientEventService();

    /**
     * Crea una cita desde web aplicando reglas de negocio y notificaciones.
     */
    public async addFromWeb(ctx: any) {
        const validation = this._validateAddInput(ctx);
        if (!validation.ok) {
            return {
                status: 400,
                ok: false,
                message: this._mapAddValidationError(validation.code),
                item: null,
            };
        }

        const autoConfirmClientBookings = ctx.workspace?.autoConfirmClientBookings ?? true;

        const deps = {
            timeZoneWorkspace: ctx.timeZoneWorkspace,
            autoConfirmClientBookings,
            businessHoursService: this.businessHoursService,
            workerHoursService: this.workerHoursService,
            temporaryHoursService: this.temporaryHoursService,
            bookingConfig: ctx.config ?? { slot: { alignMode: "service" } },
        };

        const servicePayload = this._buildServicePayload(ctx, false);
        const result: any = await this.eventClientWriteService.addEventFromWeb(servicePayload, deps);

        if (result && result.outcome !== "already-in") {
            const createdRaw = Array.isArray(result.created) ? result.created : [];

            const eventsForNotification = createdRaw
                .map((item: any) => item?.event ?? item)
                .filter((ev: any) => ev && ev.idWorkspaceFk);

            if (eventsForNotification.length > 0 && ctx.customer?.idClientWorkspace) {
                try {
                    const actionSectionType: ActionKey = autoConfirmClientBookings
                        ? "addFromClientWithoutRequest"
                        : "addFromClientWithRequest";

                    await createNotificationByClient(
                        eventsForNotification,
                        { actionSectionType },
                        [ctx.customer.idClientWorkspace]
                    );
                } catch (error: any) {
                    console.error(
                        "[EventClientCommandService.addFromWeb] error createNotificationByClient:",
                        error?.message || error
                    );
                }
            }
        }

        let status = 201;
        let ok = true;
        let message = "Evento creado";

        if (result.outcome === "joined") {
            status = 201;
            ok = true;
            message = "Te has unido al evento";
        } else if (result.outcome === "already-in") {
            status = 200;
            ok = false;
            message = "Ya estabas inscrito en este evento";
        }

        return {
            status,
            ok,
            message,
            item: result,
        };
    }

    /**
     * Ejecuta validaciones de dominio previas para alta de reservas web.
     */
    private _validateAddInput(ctx: any) {
        const startLocalISO: string | undefined = ctx?.input?.startLocalISO;
        const timeZoneClient: string | undefined = ctx?.input?.timeZoneClient;

        if (!startLocalISO || !timeZoneClient) {
            return { ok: false as const, code: "BOOKING_IN_PAST" as const };
        }

        const startMoment = moment.tz(startLocalISO, "YYYY-MM-DDTHH:mm:ss", timeZoneClient);
        if (!startMoment.isValid()) {
            return { ok: false as const, code: "BOOKING_IN_PAST" as const };
        }

        const totalDurationMin = Array.isArray(ctx?.input?.attendees)
            ? ctx.input.attendees.reduce((acc: number, attendee: any) => {
                  return acc + (typeof attendee?.durationMin === "number" ? attendee.durationMin : 0);
              }, 0)
            : 0;

        const endMoment = startMoment.clone().add(Math.max(0, totalDurationMin), "minutes");

        return this.addEventFromWebUseCase.execute({
            startDate: startMoment.toDate(),
            endDate: endMoment.toDate(),
            now: new Date(),
            minLeadMinutes: Number(ctx?.config?.bookingWindow?.minLeadTimeMin ?? 0),
        });
    }

    /**
     * Traduce códigos de validación de dominio a mensajes de API.
     */
    private _mapAddValidationError(code: "BOOKING_IN_PAST" | "OUTSIDE_WORKSPACE_HOURS" | "NO_CAPACITY" | "VALID") {
        switch (code) {
            case "OUTSIDE_WORKSPACE_HOURS":
                return "La reserva está fuera del horario permitido";
            case "NO_CAPACITY":
                return "No quedan plazas disponibles para este horario";
            case "BOOKING_IN_PAST":
            default:
                return "No se puede reservar en una fecha/hora pasada";
        }
    }

    /**
     * Construye el payload de negocio que usan los write services de clientes.
     */
    private _buildServicePayload(ctx: any, includeEventId: boolean) {
        return {
            ...ctx.input,
            ...(includeEventId ? { idEvent: ctx.input.idEvent } : {}),
            customer: {
                id: ctx.customer!.idClient,
                idClientWorkspace: ctx.customer!.idClientWorkspace,
                name: ctx.input.customer.name,
                phone: ctx.input.customer.phone,
                email: ctx.input.customer.email,
            },
        };
    }

    /**
     * Actualiza una cita desde web manteniendo los códigos de respuesta actuales.
     */
    public async updateFromWeb(ctx: any) {
        const deps = {
            timeZoneWorkspace: ctx.timeZoneWorkspace,
            businessHoursService: this.businessHoursService,
            workerHoursService: this.workerHoursService,
            temporaryHoursService: this.temporaryHoursService,
            bookingConfig: ctx.config ?? { slot: { alignMode: "service" } },
            cache: ctx.cache,
        };

        const servicePayload = this._buildServicePayload(ctx, true);

        console.log(
            `${CONSOLE_COLOR.BgCyan}[EventClientCommandService.updateFromWeb] Payload para el servicio:${CONSOLE_COLOR.Reset}`,
            servicePayload
        );

        const result: any = await this.legacyClientEventService.updateSingleEventFromWeb(servicePayload, deps);

        if (result?.notification) {
            const isSingle = result.notification.type === "single-event";
            console.log(
                CONSOLE_COLOR.FgMagenta,
                `[EventClientCommandService.updateFromWeb] Notificación enviada para ${isSingle ? "evento único" : "grupo de eventos"}:`,
                result.notification,
                CONSOLE_COLOR.Reset
            );
        }

        const ok = !!result?.ok;
        const code: string | undefined = result?.code;

        let message =
            (typeof result?.message === "string" && result.message) ||
            (ok ? "Evento actualizado" : "No se ha podido actualizar el evento");

        switch (result?.outcome) {
            case "updated_in_place":
                message = "Evento actualizado";
                break;
            case "rebuild_group":
                message = "Cita reconfigurada con varios servicios";
                break;
            case "updated":
                message = "Evento actualizado";
                break;
            case "joined":
                message = "Te has movido al nuevo evento";
                break;
            case "already-in":
                message = "Ya estabas inscrito en este evento";
                break;
        }

        const status = pickHttpStatus(code, ok);

        return {
            status,
            ok,
            message,
            code,
            item: result?.item,
        };
    }

    /**
     * Cancela una cita del cliente según reglas de eventos individuales/grupales.
     */
    public async cancelEventFromWeb(
        idEvent: string,
        idClientWorkspace: string,
        idWorkspace: string
    ) {
        try {
            const event = await prisma.event.findFirst({
                where: {
                    id: idEvent,
                    groupEvents: {
                        idWorkspaceFk: idWorkspace,
                        eventParticipant: {
                            some: {
                                idClientWorkspaceFk: idClientWorkspace,
                                deletedDate: null,
                            },
                        },
                    },
                    deletedDate: null,
                },
                select: {
                    id: true,
                    idGroup: true,
                    serviceMaxParticipantsSnapshot: true,
                    groupEvents: {
                        select: {
                            eventStatusType: true,
                            eventParticipant: {
                                where: {
                                    deletedDate: null,
                                },
                                select: {
                                    id: true,
                                    idClientWorkspaceFk: true,
                                    eventStatusType: true,
                                },
                            },
                        },
                    },
                },
            });

            if (!event) {
                throw new Error("Evento no encontrado o no pertenece al cliente");
            }

            const groupStatus = event.groupEvents?.eventStatusType;
            if (
                groupStatus === "CANCELLED" ||
                groupStatus === "CANCELLED_BY_CLIENT_REMOVED" ||
                groupStatus === "CANCELLED_BY_CLIENT"
            ) {
                return;
            }

            const maxParticipants = event.serviceMaxParticipantsSnapshot ?? 1;
            const isSeveralParticipants = maxParticipants > 1;
            const participants = event.groupEvents?.eventParticipant ?? [];

            const clientParticipant = participants.find(
                (participant) => participant.idClientWorkspaceFk === idClientWorkspace
            );

            if (!clientParticipant) {
                throw new Error("Participante no encontrado en el evento");
            }

            if (clientParticipant.eventStatusType === "CANCELLED_BY_CLIENT") {
                return;
            }

            if (isSeveralParticipants) {
                await prisma.eventParticipant.update({
                    where: { id: clientParticipant.id },
                    data: {
                        eventStatusType: "CANCELLED_BY_CLIENT",
                    },
                });

                const activeParticipants = participants.filter(
                    (participant) =>
                        participant.id !== clientParticipant.id &&
                        participant.eventStatusType !== "CANCELLED_BY_CLIENT"
                );

                if (activeParticipants.length === 0) {
                    await prisma.event.deleteMany({
                        where: { idGroup: event.idGroup },
                    });
                    await prisma.eventParticipant.deleteMany({
                        where: { idGroup: event.idGroup },
                    });
                    await prisma.groupEvents.delete({
                        where: { id: event.idGroup },
                    });
                }
            } else {
                await prisma.$transaction([
                    prisma.eventParticipant.update({
                        where: { id: clientParticipant.id },
                        data: {
                            eventStatusType: "CANCELLED_BY_CLIENT",
                        },
                    }),
                    prisma.groupEvents.update({
                        where: { id: event.idGroup },
                        data: {
                            eventStatusType: "CANCELLED_BY_CLIENT",
                        },
                    }),
                ]);
            }
        } catch (error: any) {
            throw new CustomError("EventClientCommandService.cancelEventFromWeb", error);
        }
    }

    /**
     * Confirma una cita del cliente según reglas de eventos individuales/grupales.
     */
    public async confirmEventFromWeb(
        idEvent: string,
        idClientWorkspace: string,
        idWorkspace: string
    ) {
        try {
            const event = await prisma.event.findFirst({
                where: {
                    id: idEvent,
                    groupEvents: {
                        idWorkspaceFk: idWorkspace,
                        eventParticipant: {
                            some: {
                                idClientWorkspaceFk: idClientWorkspace,
                                deletedDate: null,
                            },
                        },
                    },
                    deletedDate: null,
                },
                select: {
                    id: true,
                    idGroup: true,
                    serviceMaxParticipantsSnapshot: true,
                    groupEvents: {
                        select: {
                            eventStatusType: true,
                            eventParticipant: {
                                where: {
                                    deletedDate: null,
                                },
                                select: {
                                    id: true,
                                    idClientWorkspaceFk: true,
                                    eventStatusType: true,
                                },
                            },
                        },
                    },
                },
            });

            if (!event) {
                throw new Error("Evento no encontrado o no pertenece al cliente");
            }

            const groupStatus = event.groupEvents?.eventStatusType;
            if (groupStatus !== "ACCEPTED") {
                return;
            }

            const maxParticipants = event.serviceMaxParticipantsSnapshot ?? 1;
            const isSeveralParticipants = maxParticipants > 1;

            const participants = event.groupEvents?.eventParticipant ?? [];
            const clientParticipant = participants.find(
                (participant) => participant.idClientWorkspaceFk === idClientWorkspace
            );

            if (!clientParticipant) {
                throw new Error("Participante no encontrado en el evento");
            }

            if (clientParticipant.eventStatusType !== "ACCEPTED") {
                return;
            }

            if (isSeveralParticipants) {
                await prisma.eventParticipant.update({
                    where: { id: clientParticipant.id },
                    data: {
                        eventStatusType: "CONFIRMED",
                    },
                });
            } else {
                await prisma.$transaction([
                    prisma.eventParticipant.update({
                        where: { id: clientParticipant.id },
                        data: {
                            eventStatusType: "CONFIRMED",
                        },
                    }),
                    prisma.groupEvents.update({
                        where: { id: event.idGroup },
                        data: {
                            eventStatusType: "CONFIRMED",
                        },
                    }),
                ]);
            }
        } catch (error: any) {
            throw new CustomError("EventClientCommandService.confirmEventFromWeb", error);
        }
    }
}
