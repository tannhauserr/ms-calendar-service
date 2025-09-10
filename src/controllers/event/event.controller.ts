import { Response } from "../../models/messages/response";
import { BusinessHourService } from "../../services/@database/all-business-services/business-hours/business-hours.service";
import { TemporaryBusinessHourService } from "../../services/@database/all-business-services/temporary-business-hour/temporary-business-hour.service";
import { WorkerBusinessHourService } from "../../services/@database/all-business-services/worker-business-hours/worker-business-hours.service";
import { EventV2Service } from "../../services/@database/event/eventv2.service";

import { CONSOLE_COLOR } from "../../constant/console-color";
import * as RPC from "../../services/@rabbitmq/rpc/functions";
import { JWTService } from "../../services/jwt/jwt.service";

export class EventController {
    public eventService: EventV2Service;
    private jwtService: JWTService;

    private businessHoursService = new BusinessHourService();
    private workerHoursService = new WorkerBusinessHourService();
    private temporaryHoursService = new TemporaryBusinessHourService();

    constructor() {
        this.jwtService = JWTService.instance;
        this.eventService = new EventV2Service();
    }

    public add = async (req: any, res: any, next: any) => {
        try {
            const body = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.eventService.addEventV2(body);

            // TODO: Usad el send de RabbitMQ para crear notificación en su Microservicio
            // Por hacer

            res.status(200).json(Response.build("Evento creado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }


    /**
     * Agrega un evento desde la web (público)
     * @param req 
     * @param res 
     * @returns 
     */
    // addFromWeb = async (req: any, res: any) => {
    //     try {
    //         const payload = req.body;
    //         const token = req.token;

    //         // 0) Auth
    //         await this.jwtService.verify(token);

    //         // 1) Validaciones base (nuevo formato + fallback legacy opcional)
    //         if (!payload?.idCompany || !payload?.idWorkspace) {
    //             return res.status(400).json({ message: "Faltan idCompany o idWorkspace" });
    //         }

    //         // Acepta nuevo formato (startLocalISO + timeZoneClient); si llega legacy, lo recomponemos.
    //         const hasNewFormat =
    //             typeof payload?.startLocalISO === "string" &&
    //             /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(payload.startLocalISO) &&
    //             typeof payload?.timeZoneClient === "string";

    //         const hasLegacyFormat =
    //             typeof payload?.date === "string" &&
    //             /^\d{4}-\d{2}-\d{2}$/.test(payload.date) &&
    //             typeof payload?.timezone === "string" &&
    //             // time opcional; si no hay, asumimos "00:00:00"
    //             (payload?.time ? /^\d{2}:\d{2}$/.test(payload.time) : true);

    //         if (!hasNewFormat && !hasLegacyFormat) {
    //             return res.status(400).json({
    //                 message:
    //                     "Faltan parámetros de tiempo: usa startLocalISO + timeZoneClient o bien date(+time) + timezone",
    //             });
    //         }

    //         // Normalizamos a nuevo formato en memoria (no pisa el body original si no quieres)
    //         const normStartLocalISO = hasNewFormat
    //             ? payload.startLocalISO
    //             : `${payload.date}T${(payload.time ?? "00:00")}:00`;
    //         const normTimeZoneClient = hasNewFormat ? payload.timeZoneClient : payload.timezone;

    //         if (!Array.isArray(payload?.attendees) || payload.attendees.length === 0) {
    //             return res.status(400).json({ message: "attendees vacío" });
    //         }
    //         // Validación rápida de attendees
    //         for (const [i, a] of payload.attendees.entries()) {
    //             if (!a?.serviceId) {
    //                 return res.status(400).json({ message: `attendees[${i}].serviceId es requerido` });
    //             }
    //             if (typeof a?.durationMin !== "number" || a.durationMin <= 0) {
    //                 return res.status(400).json({ message: `attendees[${i}].durationMin debe ser > 0` });
    //             }
    //         }

    //         // Customer
    //         const idClient: string | undefined = payload?.customer?.id;
    //         if (!idClient) {
    //             return res.status(400).json({ message: "Falta id en customer" });
    //         }

    //         // 2) Workspace (cache → RPC)
    //         const savedWorkspace = RedisStrategyFactory.getStrategy("savedWorkspace") as IRedisSavedWorkspaceStrategy;
    //         let workspace: any = await savedWorkspace.getSavedWorkspaceByIdWorkspace(payload.idWorkspace);
    //         if (!workspace) {
    //             const rpcRes: any = await RPC.getEstablishmentByIdForFlow(payload.idWorkspace);
    //             workspace = rpcRes?.workspace ?? null;
    //             if (workspace?.id) {
    //                 await savedWorkspace.setSavedWorkspaceByIdWorkspace(workspace.id, workspace, TIME_SECONDS.HOUR);
    //             }
    //         }

    //         console.log("mira que es workspace", workspace)


    //         const timeZoneWorkspace = workspace?.timeZone;
    //         if (!timeZoneWorkspace) {
    //             return res.status(400).json({ message: "No se pudo resolver el timezone del workspace" });
    //         }

    //         console.log("mira idClient", idClient)

    //         // 3) Resolver (y si procede crear) el ClientWorkspace por RPC
    //         //    -> según comentas, esta llamada ya se encarga de crearlo si no existe.
    //         const clientWorkspaceRPCList = await RPC.getClientstByIdClientAndIdWorkspace(
    //             payload.idWorkspace,
    //             [idClient],
    //             payload.idCompany
    //         );

    //         console.log("clientWorkspaceRPCList", clientWorkspaceRPCList);

    //         if (!clientWorkspaceRPCList || clientWorkspaceRPCList.length !== 1) {
    //             return res.status(400).json({ message: "No se encontró el cliente en el workspace" });
    //         }

    //         // 4) Construir payload final para el servicio
    //         const servicePayload = {
    //             idCompany: payload.idCompany,
    //             idWorkspace: payload.idWorkspace,

    //             // siempre en nuevo contrato:
    //             timeZoneClient: normTimeZoneClient,
    //             startLocalISO: normStartLocalISO,

    //             attendees: payload.attendees.map((a: any) => ({
    //                 serviceId: a.serviceId,
    //                 durationMin: a.durationMin,
    //                 staffId: a.staffId ?? null,
    //                 categoryId: a.categoryId ?? null,
    //             })),

    //             excludeEventId: payload.excludeEventId,
    //             note: payload.note,

    //             customer: {
    //                 ...payload.customer,
    //                 idClient: idClient,
    //                 idClientWorkspace: clientWorkspaceRPCList[0]?.id,
    //             },
    //         };

    //         // 5) Ejecutar caso de uso
    //         // 5) Ejecutar caso de uso
    //         const result: any = await this.eventService.addEventFromWeb(servicePayload, {
    //             timeZoneWorkspace,
    //             businessHoursService: this.businessHoursService,
    //             workerHoursService: this.workerHoursService,
    //             temporaryHoursService: this.temporaryHoursService,
    //             bookingConfig: workspace?.bookingConfig ?? { slot: { alignMode: "service" } },
    //         });

    //         // ▶️ Selecciona status y mensaje según outcome
    //         let status = 201;
    //         let ok = true;
    //         let message = "Evento creado";
    //         if (result.outcome === "joined") {
    //             status = 201;
    //             ok = true;
    //             message = "Te has unido al evento";
    //         } else if (result.outcome === "already-in") {
    //             status = 200;          // idempotente
    //             ok = false;            // 👈 para que el front no trate como creación
    //             message = "Ya estabas inscrito en este evento";
    //         }

    //         return res.status(status).json(Response.build(message, status, ok, result));

    //     } catch (err: any) {
    //         return res.status(500).json({ message: err?.message ?? "Unexpected error" });
    //     }
    // };



    addFromWeb = async (req: any, res: any) => {
        try {
            // Todo lo previo viene resuelto en middlewares:
            const ctx = req.booking!.ctx;

            // deps para el caso de uso
            const deps = {
                timeZoneWorkspace: ctx.timeZoneWorkspace,
                
                businessHoursService: this.businessHoursService,
                workerHoursService: this.workerHoursService,
                temporaryHoursService: this.temporaryHoursService,
                bookingConfig: ctx.config ?? { slot: { alignMode: "service" } },
                // cache: si tienes uno, pasarlo aquí
            };

            // payload final para el servicio
            const servicePayload = {
                ...ctx.input,
                customer: {
                    id: ctx.customer!.idClient,
                    idClientWorkspace: ctx.customer!.idClientWorkspace,
                    name: ctx.input.customer.name,
                    phone: ctx.input.customer.phone,
                    email: ctx.input.customer.email,
                },
            };

            const result: any = await this.eventService.addEventFromWeb(servicePayload, deps);

            // ▶️ Respuesta “amigable”
            let status = 201;
            let ok = true;
            let message = "Evento creado";

            if (result.outcome === "joined") {
                status = 201;
                ok = true;
                message = "Te has unido al evento";
            } else if (result.outcome === "already-in") {
                status = 200; // idempotente
                ok = false;   // para que el front no trate como creación
                message = "Ya estabas inscrito en este evento";
            }

            return res.status(status).json(Response.build(message, status, ok, result));
        } catch (err: any) {
            console.error(CONSOLE_COLOR.BgRed, "[EventController.addFromWeb]", err?.message, CONSOLE_COLOR.Reset);
            return res.status(500).json({ message: err?.message ?? "Unexpected error" });
        }
    };

    public update = async (req: any, res: any, next: any) => {
        try {
            const body = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.eventService.updateEventV2(body);

            // TODO: Usad el send de RabbitMQ para crear notificación en su Microservicio
            // Por hacer


            res.status(200).json(Response.build("Evento actualizado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }


    /**
     * Se devuelve los activos y los cancelados solo por el cliente
     * @param req 
     * @param res 
     * @param next 
     */
    public get = async (req: any, res: any, next: any) => {
        try {
            const { pagination } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.eventService.getEvents(pagination, true);
            res.status(200).json({ message: "Eventos encontrados", ok: true, item: result });
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    // src/event/event.controller.ts
    public getEventExtraData = async (req: any, res: any, _next: any) => {
        try {

            console.log("getEventExtraData called");
            const { idList } = req.body;           // ⬅️ asegúrate de mandar el id del local
            const { idCompany, idWorkspace } = req.params;

            if (!Array.isArray(idList) || idList.length === 0) {
                return res.status(400).json({ message: 'Faltan ids de evento' });
            }
            if (!idWorkspace) {
                return res.status(400).json({ message: 'Falta el id del establecimiento' });
            }

            // 1) Seguridad JWT
            const token = req.token;
            await this.jwtService.verify(token);

            // 2) Datos “crudos” (participantes, recurrenceRule, servicio)
            const events = await this.eventService.getEventExtraData(idList);

            console.log("Eventos encontrados:", events);

            // 3) Colecciona todos los ids de cliente
            const allClientIds = events
                .flatMap(ev => ev.eventParticipant.map(p => p.idClientFk))
                .filter((id): id is string => !!id);                  // quita null/undefined

            const uniqueClientIds = [...new Set(allClientIds)];

            // 4) Pide a MS-clientes vía RPC -> devuelve nombre, avatar, etc.
            const clientWorkspaceRPCList =
                await RPC.getClientstByIdClientAndIdWorkspace(
                    idWorkspace,
                    uniqueClientIds,
                );

            // 5) Mapea a Map para lookup O(1)
            const clientMap = new Map(
                clientWorkspaceRPCList.map(c => [c.idClientFk, c]),
            );

            // 6) Enriquecemos cada evento
            // const eventsWithClients = events.map(ev => ({
            //     ...ev,
            //     eventParticipant: ev.eventParticipant.map(p => ({
            //         ...p,
            //         client: clientMap.get(p.idClientFk) ?? null,        // ⬅️ aquí queda el objeto cliente
            //     })),
            // }));

            // 6) Enriquecemos cada evento, pero recortando el objeto client
            const eventsWithClients = events.map(ev => ({
                ...ev,
                eventParticipant: ev.eventParticipant.map(p => {
                    // busca el objeto completo
                    const fullClient = clientMap.get(p.idClientFk) ?? null;

                    // recórtalo al shape que quieres
                    const client = fullClient
                        ? {
                            name: fullClient.name,
                            surname1: fullClient.surname1,
                            surname2: fullClient.surname2,
                            image: fullClient.image,
                        }
                        : null;

                    return {
                        ...p,
                        client,
                    };
                }),
            }));


            // 7) Respuesta
            res.status(200)
                .json(
                    Response.build(
                        'Datos extra de eventos encontrados',
                        200,
                        true,
                        eventsWithClients,
                    ),
                );
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    };



    /**
     * Se devuelve los cancelados y los activos
     * @param req 
     * @param res 
     * @param next 
     */
    public getList = async (req: any, res: any, next: any) => {
        try {
            const { pagination } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.eventService.getEvents(pagination, false);
            res.status(200).json({ message: "Eventos encontrados", ok: true, item: result });
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    public getById = async (req: any, res: any, next: any) => {
        try {
            const { id } = req.params;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.eventService.getEventById(id);
            res.status(200).json(Response.build("Evento encontrado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }




    public deleteEvent = async (req: any, res: any, next: any) => {
        try {
            const { idList } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            // Luego, elimina el evento de la base de datos
            const result = await this.eventService.deleteEventsV2(idList);


            res.status(200).json(Response.build("Evento eliminado exitosamente", 200, true, result));
        } catch (err: any) {
            console.error("Error al eliminar el evento:", err);
            res.status(500).json({ message: err.message });
        }
    }


    changeEventStatus = async (req: any, res: any, next: any) => {
        try {
            const { id, status } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.eventService.changeEventStatus(id, status);
            res.status(200).json(Response.build("Estado del evento actualizado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    changeEventStatusByParticipant = async (req: any, res: any, next: any) => {
        try {
            const { id, idClient, idClientWorkspace, action } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.eventService.changeParticipantStatus(
                id,
                idClient,
                idClientWorkspace,
                action
            );
            res.status(200).json(Response.build("Estado del evento actualizado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }
}
