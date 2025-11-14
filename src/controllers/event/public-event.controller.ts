import { Event } from "@prisma/client";
import { CONSOLE_COLOR } from "../../constant/console-color";
import { TIME_SECONDS } from "../../constant/time";
import { Response } from "../../models/messages/response";
import { BusinessHourService } from "../../services/@database/all-business-services/business-hours/business-hours.service";
import { TemporaryBusinessHourService } from "../../services/@database/all-business-services/temporary-business-hour/temporary-business-hour.service";
import { WorkerBusinessHourService } from "../../services/@database/all-business-services/worker-business-hours/worker-business-hours.service";
import { EventTimesService } from "../../services/@database/event/event-times.service";
// import { publicGetAvailableTimeSlots_SPECIAL } from "../../services/@database/event/availability-special.service";
import { EventV2Service } from "../../services/@database/event/eventv2.service";
import { IcsMeta, buildIcs } from "../../services/@database/event/util/build-ics";
import { _getServicesSnapshotById } from "../../services/@database/event/util/getInfoServices";

import * as RPC from "../../services/@rabbitmq/rpc/functions";
import { IRedisBookingPageBriefStrategy, IRedisSavedWorkspaceStrategy, IRedisWorkspaceBriefStrategy } from "../../services/@redis/cache/interfaces/interfaces";
import { Workspace } from "../../services/@redis/cache/interfaces/models/workspace";
import { RedisStrategyFactory } from "../../services/@redis/cache/strategies/redisStrategyFactory";
import { getWorkspacesByIds } from "../../services/@service-token-client/api-ms/auth.ms";
import { getBookingPageByIds, getServiceByIds } from "../../services/@service-token-client/api-ms/bookingPage.ms";
import { BookingPageStatusType } from "../../services/@redis/cache/interfaces/models/booking-brief";
import { time } from "console";

export class PublicEventController {
    public eventService: EventV2Service;
    public eventTimesService: EventTimesService;

    private businessHoursService = new BusinessHourService();
    private workerHoursService = new WorkerBusinessHourService();
    private temporaryHoursService = new TemporaryBusinessHourService();

    constructor() {
        this.eventService = new EventV2Service();
        this.eventTimesService = new EventTimesService();
    }


    public publicAdd = async (req: any, res: any, next: any) => {
        try {
            const body = req.body;

            const result = await this.eventService.addEventV2(body);

            // TODO: Usad el send de RabbitMQ para crear notificación en su Microservicio
            // Por hacer

            res.status(200).json(Response.build("Evento creado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    // public publicGetAvailableDaysSlots = async (req: any, res: any) => {
    //     try {

    //         // body esperado:
    //         // {
    //         //   idCompany: string,
    //         //   idWorkspace: string,
    //         //   timezone: string,                    
    //         //   range: { start: "YYYY-MM-DD", end: "YYYY-MM-DD" },
    //         //   attendees: [{ serviceId, durationMin, staffId?: string|null, categoryId?: string }],
    //         //   excludeEventId?: string
    //         // }


    //         const payload = req.body;
    //         const savedWorkspace = RedisStrategyFactory.getStrategy('savedWorkspace') as IRedisSavedWorkspaceStrategy;
    //         // 1) Workspace desde Redis (por id). Fallback a RPC y cache set.
    //         let workspace: any = await savedWorkspace.getSavedWorkspaceByIdWorkspace(payload.idWorkspace);

    //         // console.log("mira que es workspace cacheado", workspace);
    //         if (!workspace) {
    //             const rpcRes: any = await RPC.getEstablishmentByIdForFlow(payload.idWorkspace);
    //             workspace = rpcRes?.workspace ?? null;

    //             console.log("mira que es workspace desde rpc", workspace);
    //             if (workspace?.id) {
    //                 await savedWorkspace.setSavedWorkspaceByIdWorkspace(
    //                     workspace?.id,
    //                     workspace,
    //                     TIME_SECONDS.HOUR
    //                 );
    //             }
    //         }



    //         const timeZoneWorkspace = workspace?.timeZone ?? null;
    //         if (!timeZoneWorkspace) {
    //             console.log("que ????")
    //             // si la estructura viene como { workspace: {...} } desde RPC, ya la cubrimos arriba
    //             // si no hay timezone, devolvemos 400 para evitar cálculos erróneos
    //             return res.status(400).json({ message: "No se pudo resolver el timezone del workspace" });
    //         }

    //         const result = await this.eventService.publicGetAvailableDays(
    //             {
    //                 ...payload,
    //                 timeZoneClient: payload.timezone,
    //                 timeZoneWorkspace: timeZoneWorkspace,
    //                 range: payload.range,
    //                 // intervalMinutes: 10
    //             },
    //             {
    //                 businessHoursService: this.businessHoursService,
    //                 workerHoursService: this.workerHoursService,
    //                 temporaryHoursService: this.temporaryHoursService,
    //                 bookingConfig: workspace?.config,
    //             }

    //         );


    //         console.log("mira que es result", result);
    //         return res
    //             .status(200)
    //             .json(Response.build("Días disponibles", 200, true, result?.days || []));
    //     } catch (err: any) {
    //         return res.status(500).json({ message: err.message });
    //     }
    // }

    public publicGetAvailableDaysSlots = async (req: any, res: any) => {
        try {

            // body esperado:
            // {
            //   idCompany: string,
            //   idWorkspace: string,
            //   timezone: string,                    
            //   range: { start: "YYYY-MM-DD", end: "YYYY-MM-DD" },
            //   attendees: [{ serviceId, durationMin, staffId?: string|null, categoryId?: string }],
            //   excludeEventId?: string
            // }



            const payload = req.body;
            const idBookingPage = payload?.idBookingPage;
            const idWorkspace = payload?.idWorkspace;

            console.log("mira que es payload en available days get", payload);


            const bookingPageStrategy = RedisStrategyFactory.getStrategy("bookingPageBrief") as IRedisBookingPageBriefStrategy;
            let bp = await bookingPageStrategy.getBookingPageById(idBookingPage);
            if (!bp) {
                console.log("no está en cache, voy a buscarlo rpc");
                // const rpcRes: any = await RPC.getEstablishmentByIdForFlow(idBookingPage);
                const briefResponse = await getBookingPageByIds([idBookingPage], idWorkspace);
                bp = briefResponse?.[0] ?? null;
                if (bp?.id) {
                    // await savedWorkspace.setSavedWorkspaceByIdWorkspace(workspace.id, workspace, 60);
                    await bookingPageStrategy.setBookingPage(bp, TIME_SECONDS.HOUR);
                }
            }
            console.log("mira que es bp2", bp);

            if (bp?.bookingPageStatusType !== ("PUBLISHED" as BookingPageStatusType)) {
                return res.status(400).json({ message: "La página de reservas no está publicada" });
            }

            const workspaceBriefStrategy = RedisStrategyFactory.getStrategy("workspaceBrief") as IRedisWorkspaceBriefStrategy;
            let workspace = null;
            if (!workspace) {
                const workspaceRes = await getWorkspacesByIds([idWorkspace]);
                workspace = workspaceRes?.[0] ?? null;
                if (workspace?.id) {
                    // await savedWorkspace.setSavedWorkspaceByIdWorkspace(workspace.id, workspace, 60 * 60);
                    await workspaceBriefStrategy.setWorkspace(workspace, TIME_SECONDS.HOUR);
                }
            }


            const result = await this.eventService.publicGetAvailableDays(
                {
                    ...payload,
                    timeZoneClient: payload.timezone,
                    timeZoneWorkspace: workspace?.timeZone ?? null,
                    range: payload.range,
                    // intervalMinutes: 10
                },
                {
                    businessHoursService: this.businessHoursService,
                    workerHoursService: this.workerHoursService,
                    temporaryHoursService: this.temporaryHoursService,
                    bookingConfig: bp?.bookingPageConfJson ?? undefined,
                }

            );


            console.log("mira que es result", result);
            return res
                .status(200)
                .json(Response.build("Días disponibles", 200, true, result?.days || []));
        } catch (err: any) {
            return res.status(500).json({ message: err.message });
        }
    }


    publicGetAvailableTimeSlots = async (req: any, res: any) => {
        try {
            const payload = req.body;


            // console.log("mira que es payload en times get", payload);




            // Validación básica
            if (!payload?.idCompany || !payload?.idWorkspace || !payload?.idBookingPage) {
                return res.status(400).json({ message: "Faltan idCompany, idWorkspace o idBookingPage" });
            }
            if (!payload?.date || !/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) {
                return res.status(400).json({ message: "date debe ser YYYY-MM-DD" });
            }
            if (!payload?.timezone) {
                return res.status(400).json({ message: "Falta timezone" });
            }
            if (!Array.isArray(payload?.attendees) || payload.attendees.length === 0) {
                return res.status(400).json({ message: "attendees vacío" });
            }


            // const savedWorkspace = RedisStrategyFactory.getStrategy('savedWorkspace') as IRedisSavedWorkspaceStrategy;
            // // 1) Workspace desde Redis (por id). Fallback a RPC y cache set.
            // let workspace: any = await savedWorkspace.getSavedWorkspaceByIdWorkspace(payload.idWorkspace);

            // // console.log("mira que es workspace cacheado", workspace);
            // if (!workspace) {
            //     const rpcRes: any = await RPC.getEstablishmentByIdForFlow(payload.idWorkspace);
            //     workspace = rpcRes?.workspace ?? null;

            //     console.log("mira que es workspace desde rpc", workspace);
            //     if (workspace?.id) {
            //         await savedWorkspace.setSavedWorkspaceByIdWorkspace(
            //             workspace?.id,
            //             workspace,
            //             TIME_SECONDS.HOUR
            //         );
            //     }
            // }

            const ctx = req.booking!.ctx;
            const workspace: Workspace = ctx.workspace;
            const bookingPage: any = ctx.bookingPage;
            workspace.config = ctx.config;



            const timeZoneWorkspace = workspace?.timeZone ?? null;
            if (!timeZoneWorkspace) {
                // console.log("que ????")
                // si la estructura viene como { workspace: {...} } desde RPC, ya la cubrimos arriba
                // si no hay timezone, devolvemos 400 para evitar cálculos erróneos
                return res.status(400).json({ message: "No se pudo resolver el timezone del workspace" });
            }

            // console.log("mira que es timeZoneWorkspace", timeZoneWorkspace);
            // const result = await this.eventService.publicGetAvailableTimeSlots({
            //     ...payload,
            //     timeZoneClient: payload.timezone,
            //     timeZoneWorkspace: timeZoneWorkspace
            // });

            // console.log("voy arriba a llamar a publicGetAvailableTimeSlots_SPECIAL", workspace);

            const result = await this.eventTimesService.publicGetAvailableTimeSlots_SPECIAL(
                {
                    ...payload,
                    timeZoneClient: payload.timezone,
                    timeZoneWorkspace: timeZoneWorkspace,
                    // intervalMinutes: 10
                },
                {
                    businessHoursService: this.businessHoursService,
                    workerHoursService: this.workerHoursService,
                    temporaryHoursService: this.temporaryHoursService,
                    bookingConfig: workspace?.config,
                    servicesSnapshot: {
                        getServicesSnapshotById: (params) =>
                            _getServicesSnapshotById(params), // ← tu función tal cual
                    },
                }

            );

            // console.log("mira que es result aaa", result);
            
            return res
                .status(200)
                .json(Response.build("Horarios disponibles", 200, true, result || { timeSlots: [], dayStatus: "no" }));
        } catch (err: any) {
            return res.status(500).json({ message: err?.message ?? "Unexpected error" });
        }
    }



    // handler mínimo: siempre METHOD:PUBLISH, sin asistentes
    getICS = async (req: any, res: any) => {
        try {

            // TODO: Agregar  una flag con redis para no abusar de este endpoint (p.ej 1 por minuto por IP)
            // TODO: Agregar  una flag con redis para no abusar de este endpoint (p.ej 1 por minuto por IP)
            // TODO: Agregar  una flag con redis para no abusar de este endpoint (p.ej 1 por minuto por IP)
            // TODO: Agregar  una flag con redis para no abusar de este endpoint (p.ej 1 por minuto por IP)
            // TODO: Agregar  una flag con redis para no abusar de este endpoint (p.ej 1 por minuto por IP)
            // TODO: Agregar  una flag con redis para no abusar de este endpoint (p.ej 1 por minuto por IP)
            // TODO: Agregar  una flag con redis para no abusar de este endpoint (p.ej 1 por minuto por IP)
            console.log(`${CONSOLE_COLOR.FgYellow} /event/ics called ${CONSOLE_COLOR.Reset}`);

            const idEvent =
                req.params?.idEvent ||
                req.query?.idEvent ||
                req.body?.idEvent;

            if (!idEvent) {
                return res.status(400).json({ ok: false, message: "idEvent (string) is required" });
            }

            // 1) Event
            const event: Event & { eventParticipant: { id: string; idClientFk: string; idClientWorkspaceFk: string }[] }
                = await this.eventService.getEventById(idEvent);

            if (!event) {
                return res.status(404).json({ ok: false, message: "Event not found" });
            }

            // 2) Workspace (para organizer/location)
            const workspaces = await getWorkspacesByIds([event.idWorkspaceFk]);
            const workspace = workspaces?.[0];
            if (!workspace) {
                return res.status(404).json({ ok: false, message: "Workspace not found" });
            }

            // 3) (Opcional) Service (solo para título fallback)
            let service = null as { name?: string } | null;
            if (event?.idServiceFk) {
                const services = await getServiceByIds([event.idServiceFk], event.idWorkspaceFk);
                service = services?.[0] ?? null;
            }

            // 4) Location “bonito” (o “Online” si no hay dirección)
            const location = workspace.address
                ? [
                    workspace.address,
                    workspace.addressNumber,
                    workspace.city,
                    workspace.postalCode,
                    workspace.country,
                ]
                    .filter(Boolean)
                    .join(", ")
                : "Online";

            // 5) ICS meta mínimo (siempre PUBLISH; sin attendees)
            const icsMeta: IcsMeta = {
                uid: `${event.id}@reserflow`,
                summary: event.title || service?.name || "Reserva",
                description: event.description || "",
                startUtc: event.startDate,
                endUtc: event.endDate,
                allDay: !!event.allDay,
                // En service, si algún día añades dirección al servicio, úsala aquí
                location,
                // url opcional hacia tu gestor. Esto sería para modificar/cancelar la reserva.
                // url: `${process.env.PUBLIC_APP_URL ?? "https://app.reserflow.com"}/booking/manage/${event.id}`,
                organizer: workspace.email
                    ? { name: workspace.name, email: workspace.email }
                    : undefined,
                status: event.eventStatusType === "CANCELLED" ? "CANCELLED" : "CONFIRMED",
                createdUtc: event?.createdDate ?? event?.startDate,
                lastModifiedUtc: event?.updatedDate ?? event?.endDate ?? event?.startDate,
                sequence: 0,
            };

            // 6) Construir y servir
            const icsString = buildIcs(icsMeta);

            console.log(`${CONSOLE_COLOR.FgGreen} /event/ics completed ${CONSOLE_COLOR.Reset}`);
            res.setHeader("Content-Type", "text/calendar; charset=utf-8");
            res.setHeader("Content-Disposition", `attachment; filename=event-${event.id}.ics`);
            return res.status(200).send(icsString);
        } catch (err: any) {
            console.error(err);
            return res.status(500).json({ ok: false, message: err?.message || "Internal error" });
        }
    }

}
