import { Response } from "../../models/messages/response";
import { BusinessHourService } from "../../services/@database/all-business-services/business-hours/business-hours.service";
import { TemporaryBusinessHourService } from "../../services/@database/all-business-services/temporary-business-hour/temporary-business-hour.service";
import { WorkerBusinessHourService } from "../../services/@database/all-business-services/worker-business-hours/worker-business-hours.service";
import { EventV2Service } from "../../services/@database/event/eventv2.service";
import { CONSOLE_COLOR } from "../../constant/console-color";
import { getServiceByIds } from "../../services/@service-token-client/api-ms/bookingPage.ms";
import { JWTService } from "../../services/jwt/jwt.service";
import { ClientEventService } from "../../services/@database/event/client-event.service";
import { pickHttpStatus } from "../../constant/errors/codes";

export class ClientEventController {
    public eventClientService: ClientEventService;
    public eventService: EventV2Service;

    private jwtService: JWTService;

    private businessHoursService = new BusinessHourService();
    private workerHoursService = new WorkerBusinessHourService();
    private temporaryHoursService = new TemporaryBusinessHourService();

    constructor() {
        this.jwtService = JWTService.instance;
        this.eventService = new EventV2Service();
        this.eventClientService = new ClientEventService();
    }


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

            const result: any = await this.eventClientService.addEventFromWeb(servicePayload, deps);

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

    // updateFromWeb = async (req: any, res: any) => {
    //     try {
    //         const ctx = req.booking!.ctx;

    //         const deps = {
    //             timeZoneWorkspace: ctx.timeZoneWorkspace,
    //             businessHoursService: this.businessHoursService,
    //             workerHoursService: this.workerHoursService,
    //             temporaryHoursService: this.temporaryHoursService,
    //             bookingConfig: ctx.config ?? { slot: { alignMode: "service" } },
    //             cache: ctx.cache, // si lo tienes en el ctx, si no quítalo
    //         };

    //         const servicePayload: any = {
    //             ...ctx.input,
    //             idEvent: ctx.input.idEvent, // debe venir del front/middleware
    //             customer: {
    //                 id: ctx.customer!.idClient,
    //                 idClientWorkspace: ctx.customer!.idClientWorkspace,
    //                 name: ctx.input.customer.name,
    //                 phone: ctx.input.customer.phone,
    //                 email: ctx.input.customer.email,
    //             },
    //         };

    //         console.log(`${CONSOLE_COLOR.BgCyan}[ClientEventController.updateFromWeb] Payload para el servicio:${CONSOLE_COLOR.Reset}`, servicePayload);
    //         const result: any =
    //             await this.eventClientService.updateSingleEventFromWeb(
    //                 servicePayload,
    //                 deps,
    //             );

    //         let status = result.ok ? 200 : 400;
    //         let ok = !!result.ok;
    //         let message = result.ok
    //             ? "Evento actualizado"
    //             : "No se ha podido actualizar el evento";

    //         if (result.outcome === "updated") {
    //             status = 200;
    //             ok = true;
    //             message = "Evento actualizado";
    //         } else if (result.outcome === "joined") {
    //             // por si en algún flujo termina uniéndose a otro grupo
    //             status = 200;
    //             ok = true;
    //             message = "Te has movido al nuevo evento";
    //         } else if (result.outcome === "already-in") {
    //             status = 200;
    //             ok = false;
    //             message = "Ya estabas inscrito en este evento";
    //         }

    //         return res
    //             .status(status)
    //             .json(
    //                 Response.build(
    //                     message,
    //                     status,
    //                     ok,
    //                     result
    //                 )
    //             );
    //     } catch (err: any) {
    //         console.error(
    //             CONSOLE_COLOR.BgRed,
    //             "[EventController.updateFromWeb]",
    //             err?.message,
    //             CONSOLE_COLOR.Reset
    //         );
    //         return res
    //             .status(500)
    //             .json({
    //                 message:
    //                     err?.message ??
    //                     "Unexpected error",
    //             });
    //     }
    // };


    updateFromWeb = async (req: any, res: any) => {
        try {
            const ctx = req.booking!.ctx;

            const deps = {
                timeZoneWorkspace: ctx.timeZoneWorkspace,
                businessHoursService: this.businessHoursService,
                workerHoursService: this.workerHoursService,
                temporaryHoursService: this.temporaryHoursService,
                bookingConfig: ctx.config ?? { slot: { alignMode: "service" } },
                cache: ctx.cache,
            };

            const servicePayload: any = {
                ...ctx.input,
                idEvent: ctx.input.idEvent,
                customer: {
                    id: ctx.customer!.idClient,
                    idClientWorkspace: ctx.customer!.idClientWorkspace,
                    name: ctx.input.customer.name,
                    phone: ctx.input.customer.phone,
                    email: ctx.input.customer.email,
                },
            };

            console.log(
                `${CONSOLE_COLOR.BgCyan}[ClientEventController.updateFromWeb] Payload para el servicio:${CONSOLE_COLOR.Reset}`,
                servicePayload
            );

            const result: any = await this.eventClientService.updateSingleEventFromWeb(
                servicePayload,
                deps
            );


            if (result?.notification) {
                const isSingle = result.notification.type === "single-event";
                console.log(
                    CONSOLE_COLOR.FgMagenta,
                    `[ClientEventController.updateFromWeb] Notificación enviada para ${isSingle ? "evento único" : "grupo de eventos"
                    }:`,
                    result.notification,
                    CONSOLE_COLOR.Reset
                );


            }

            // ─────────────────────────────────────────────────────────
            // Normalizamos mensaje/outcome y propagamos "code" al front
            // ─────────────────────────────────────────────────────────
            const ok = !!result?.ok;
            const code: string | undefined = result?.code; // ← viene de updateEventFromWebBase en los casos ok:false

            // Mensaje por defecto
            let message =
                (typeof result?.message === "string" && result.message) ||
                (ok ? "Evento actualizado" : "No se ha podido actualizar el evento");

            // Afinamos mensaje por outcome si procede
            switch (result?.outcome) {
                case "updated_in_place":
                    message = "Evento actualizado";
                    break;
                case "rebuild_group":
                    message = "Cita reconfigurada con varios servicios";
                    break;
                // (si mantienes compatibilidad con outcomes antiguos)
                case "updated":
                    message = "Evento actualizado";
                    break;
                case "joined":
                    message = "Te has movido al nuevo evento";
                    break;
                case "already-in":
                    // es un caso extraño: ok=false pero 200. preferimos 400 para el cliente
                    message = "Ya estabas inscrito en este evento";
                    break;
            }

            // Status HTTP según código (si no hay code, deducimos por ok)
            const status = pickHttpStatus(code, ok);

            // Construimos payload de respuesta propagando el code al front
            // (si tu Response.build no añade el code a nivel root, el front lo leerá en data.code)
            // const payload = {
            //     ok: ok,
            //     message: message,
            //     status: status,
            //     item: result?.item,
            //     ,
            // };

            return res
                .status(status)
                .json(Response.build(message, status, ok, res?.item, code || undefined));
        } catch (err: any) {
            console.error(
                CONSOLE_COLOR.BgRed,
                "[ClientEventController.updateFromWeb] Error no controlado:",
                err?.message,
                CONSOLE_COLOR.Reset
            );

            // Fallback seguro en errores inesperados
            const code = err?.code || "BOOKING_ERR_UNEXPECTED";
            const status = pickHttpStatus(code, false);

            return res.status(status).json(
                Response.build(
                    err?.message ?? "Unexpected error",
                    status,
                    false,
                    {
                        ok: false,
                        code,
                        message: err?.message ?? "Unexpected error",
                    }
                )
            );
        }
    };


    /**
     * Se devuelve los activos y los cancelados solo por el cliente
     * @param req 
     * @param res 
     * @param next 
     */
    public getFromWeb = async (req: any, res: any, next: any) => {
        try {
            const { page, itemsPerPage, scope } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const ctx = req.booking?.ctx;

            const idWorkspace = ctx?.input?.idWorkspace;
            const idClientWorkspace = ctx?.customer?.idClientWorkspace;

            if (!idWorkspace || !idClientWorkspace) {
                return res.status(400).json({
                    ok: false,
                    message: "No se pudo resolver idWorkspace o idClientWorkspace"
                });
            }

            const result = await this.eventClientService.getEvents(
                scope,
                page,
                itemsPerPage,
                idClientWorkspace,
                idWorkspace
            );

            console.log(`${CONSOLE_COLOR.BgYellow}[ClientEventController.getFromWeb] Resultados obtenidos:${CONSOLE_COLOR.Reset}`, result);

            return res
                .status(200)
                .json({ message: "Eventos encontrados", ok: true, item: result });
        } catch (err: any) {
            return res.status(500).json({ message: err.message });
        }
    };


    // public getEventByIdAndClientWorkspaceAndWorkspace = async (req: any, res: any, next: any) => {
    //     try {
    //         // const { id, idClientWorkspace, idWorkspace } = req.params;
    //         const { id } = req.body;
    //         const ctx = req.booking?.ctx;

    //         const idWorkspace = ctx?.input?.idWorkspace;
    //         const idClientWorkspace = ctx?.customer?.idClientWorkspace;

    //         if (!idWorkspace || !idClientWorkspace) {
    //             return res.status(400).json({
    //                 ok: false,
    //                 message: "No se pudo resolver idWorkspace o idClientWorkspace"
    //             });
    //         }
    //         const token = req.token;
    //         await this.jwtService.verify(token);

    //         console.log(`${CONSOLE_COLOR.BgYellow}[ClientEventController.getEventByIdAndClientWorkspaceAndWorkspace] Params recibidos:${CONSOLE_COLOR.Reset}`, { id, idClientWorkspace, idWorkspace });
    //         const result = await this.eventClientService.getEventByIdAndClientWorkspaceAndWorkspace(
    //             id,
    //             idClientWorkspace,
    //             idWorkspace
    //         );

    //         if (result) {
    //             let service = await getServiceByIds([result.idServiceFk], result.idWorkspaceFk);
    //             result.service = service[0] ?? null;
    //         }

    //         if (!result) {
    //             return res.status(404).json(Response.build("Evento no encontrado", 404, false));
    //         }

    //         res.status(200).json(Response.build("Evento encontrado", 200, true, result));
    //     } catch (err: any) {
    //         res.status(500).json({ message: err.message });
    //     }
    // }


    public getEventByIdAndClientWorkspaceAndWorkspace = async (req: any, res: any, next: any) => {
        try {
            const { id: idEventFromFront, customer } = req.body;
            const ctx = req.booking?.ctx;

            const idWorkspace = ctx?.input?.idWorkspace;
            const idClientWorkspace = ctx?.customer?.idClientWorkspace;
            const idEvent = idEventFromFront || customer?.id;
            console.log("mira body", req.body);


            if (!idEventFromFront || !idWorkspace || !idClientWorkspace) {
                return res.status(400).json({
                    ok: false,
                    message: "No se pudo resolver id, idWorkspace o idClientWorkspace"
                });
            }

            const token = req.token;
            await this.jwtService.verify(token);

            console.log(
                `${CONSOLE_COLOR.BgYellow}[ClientEventController.getEventByIdAndClientWorkspaceAndWorkspace] Params recibidos:${CONSOLE_COLOR.Reset}`,
                { idEvent, idClientWorkspace, idWorkspace }
            );

            // ⬇️ Ahora usamos el método que agrupa por (idGroup ?? id)
            const booking = await this.eventClientService.getEventByIdAndClientWorkspaceAndWorkspace(
                idEvent,
                idClientWorkspace,
                idWorkspace
            );

            console.log("booking obtenido:", booking);

            if (!booking) {
                return res
                    .status(404)
                    .json(Response.build("Cita no encontrada", 404, false));
            }

            // booking es de tipo ClientAppointment (booking lógico con services[])
            return res
                .status(200)
                .json(Response.build("Cita encontrada", 200, true, booking));
        } catch (err: any) {
            return res.status(500).json({ ok: false, message: err.message });
        }
    };


    changeEventStatusFromWeb = async (req: any, res: any, next: any) => {
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

    changeEventStatusByParticipantFromWeb = async (req: any, res: any, next: any) => {
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
