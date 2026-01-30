import { Response } from "../../models/messages/response";
import { EventV2Service } from "../../services/@database/event/eventv2.service";

import { CONSOLE_COLOR } from "../../constant/console-color";
import { EventForBackend } from "../../services/@database/event/dto/EventForBackend";
import { deleteRecordsRoutingKeys, publishDeleteRecordsMessage, publishStoreNotificationDeleted, publishStoreNotificationPurgeByBooking } from "../../services/@rabbitmq/pubsub/functions";
import { getServiceByIds } from "../../services/@service-token-client/api-ms/bookingPage.ms";
import { getClientWorkspacesByIds } from "../../services/@service-token-client/api-ms/client.ms";
import { JWTService } from "../../services/jwt/jwt.service";
import { create } from "domain";

import { EventStatusType } from "@prisma/client";
import { ActionKey } from "../../models/notification/util/action-to-senctions";
import { upsertEvent } from "../../services/@database/event/platform/upsertEvent.service";
import { SidebarBackendBookingPayload } from "../../services/@database/event/dto/SidebarBackendBookingPayload";
import { createNotification as createNotificationPlatform } from "../../models/notification/util/trigger/util/for-action-platform";
import { is } from "zod/locales";
import { randomUUID } from "crypto";

export class EventController {
    public eventService: EventV2Service;
    private jwtService: JWTService;


    constructor() {
        this.jwtService = JWTService.instance;
        this.eventService = new EventV2Service();
    }

    /**
  * Upsert de eventos desde la plataforma (sidebar del calendario).
  * 
  * Recibe un payload con servicios y clientes, y crea/actualiza/elimina eventos
  * según corresponda. Cada servicio se traduce en un evento independiente,
  * y los eventos se encadenan secuencialmente en el tiempo.
  * 
  * @param req - Request con body tipo SidebarBackendBookingPayload
  * @param res - Response
  */
    public upsertEventByPlatform = async (req: any, res: any) => {
        try {
            const payload: SidebarBackendBookingPayload = req.body;
            const token = req.token;

            // 1. Autenticación
            await this.jwtService.verify(token);

            // 2. Validaciones básicas
            if (!payload.type) {
                return res.status(400).json({
                    ok: false,
                    message: "El campo 'type' es requerido"
                });
            }

            if (payload.type !== "event") {
                return res.status(400).json({
                    ok: false,
                    message: `Tipo '${payload.type}' no soportado en esta versión`
                });
            }

            if (!payload.idCompany) {
                return res.status(400).json({
                    ok: false,
                    message: "El campo 'idCompany' es requerido"
                });
            }

            if (!payload.idWorkspace) {
                return res.status(400).json({
                    ok: false,
                    message: "El campo 'idWorkspace' es requerido"
                });
            }

            if (!payload.startDate) {
                return res.status(400).json({
                    ok: false,
                    message: "El campo 'startDate' es requerido"
                });
            }

            if (!Array.isArray(payload.services)) {
                return res.status(400).json({
                    ok: false,
                    message: "El campo 'services' debe ser un array"
                });
            }

            if (!Array.isArray(payload.clients)) {
                return res.status(400).json({
                    ok: false,
                    message: "El campo 'clients' debe ser un array"
                });
            }

            

            // 3. Ejecutar upsert
            const events = await upsertEvent(payload);

            // 4. Respuesta exitosa
            const message = payload.mode === 'create'
                ? "Eventos creados exitosamente"
                : "Eventos actualizados exitosamente";

            const isSendNotification = payload?.sendNotification;
            if (isSendNotification && events?.length > 0 && events[0]?.idGroup) {
                await createNotificationPlatform(events[0].idGroup, {
                    actionSectionType: payload.mode === 'create' ? 'add' : 'update',
                });
            } else if (!isSendNotification && payload.mode === 'edit' && events?.[0]?.idGroup) {
                // Si no se envía notificación y es edición, eliminamos notificaciones 
                // que no se hayan enviado aún
                await publishStoreNotificationPurgeByBooking({
                    v: 1,
                    bookingId: events[0].idGroup,
                    trace: {
                        correlationId: randomUUID() || "",
                        producedAt: new Date().toISOString()
                    },
                })
            }

            return res.status(200).json(
                Response.build(message, 200, true, {
                    events,
                    count: events.length,
                })
            );



        } catch (err: any) {
            console.error(
                `${CONSOLE_COLOR.BgRed}[EventController.upsertEventByPlatform]${CONSOLE_COLOR.Reset}`,
                err?.message
            );
            return res.status(500).json({
                ok: false,
                message: err?.message ?? "Error interno del servidor"
            });
        }
    };


    // public add = async (req: any, res: any, next: any) => {
    //     try {
    //         const body: EventForBackend = req.body;
    //         const token = req.token;
    //         await this.jwtService.verify(token);

    //         const result = await this.eventService.addEventV2(body);

    //         res.status(200).json(Response.build("Evento creado", 200, true, result));
    //     } catch (err: any) {
    //         res.status(500).json({ message: err.message });
    //     }
    // }





    // public update = async (req: any, res: any, next: any) => {
    //     try {
    //         const body = req.body;
    //         const token = req.token;
    //         await this.jwtService.verify(token);

    //         const result = await this.eventService.updateEventV2(body);

    //         // TODO: Usad el send de RabbitMQ para crear notificación en su Microservicio
    //         // Por hacer


    //         res.status(200).json(Response.build("Evento actualizado", 200, true, result));
    //     } catch (err: any) {
    //         res.status(500).json({ message: err.message });
    //     }
    // }


    public markCommentAsRead = async (req: any, res: any, next: any) => {
        try {
            const { idEvent, idWorkspace } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);
            const result = await this.eventService.markCommentAsRead(idEvent, idWorkspace);
            res.status(200).json(Response.build("Comentario marcado como leído", 200, true, result));
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

            const isValidCancelledStatus = false;
            const result = await this.eventService.getEvents(pagination, isValidCancelledStatus);
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

            if (!idCompany) {
                return res.status(400).json({ message: 'Falta el id de la compañía' });
            }

            // 1) Seguridad JWT
            const token = req.token;
            await this.jwtService.verify(token);

            // 2) Datos “crudos” (participantes, recurrenceRule, servicio)
            const events = await this.eventService.getEventExtraData(idList);

            // 2.1) Enriquecer con datos adicionales (si es necesario)

            // console.log("Eventos encontrados:", events);

            // 3) Colecciona todos los ids de cliente
            const allClientIds = events
                .flatMap(ev => ev.eventParticipant.map(p => p.idClientWorkspaceFk))
                .filter((id): id is string => !!id);                  // quita null/undefined

            const uniqueClientIds = [...new Set(allClientIds)];

            // 3.1) Colecciona todos los ids de servicios
            const allServiceIds = events
                .map(ev => ev.idServiceFk)
                .filter((id): id is string => !!id);                  // quita null/undefined

            const uniqueServiceIds = [...new Set(allServiceIds)];

            // 4) Pide a MS-clientes vía RPC -> devuelve nombre, avatar, etc.
            const clientWorkspaceList = await getClientWorkspacesByIds(uniqueClientIds, idCompany);

            // console.log("mira que es clientWorkspace", clientWorkspaceList)


            // const clientWorkspaceRPCList =
            //     await RPC.getClientstByIdClientAndIdWorkspace(
            //         idWorkspace,
            //         uniqueClientIds,
            //     );

            // 4.1) Obtiene servicios usando getServiceByIds
            const services = uniqueServiceIds.length > 0
                ? await getServiceByIds(uniqueServiceIds, idWorkspace)
                : [];

            // 5) Mapea a Map para lookup O(1)
            const clientMap = new Map(
                clientWorkspaceList.map(c => [c.id, c]),
            );

            // 5.1) Mapea servicios para lookup O(1)
            const serviceMap = new Map(
                services.map(s => [s.id, s]),
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
            const eventsWithClientsAndServices = events.map(ev => ({
                ...ev,
                eventParticipant: ev.eventParticipant.map(p => {
                    // busca el objeto completo
                    const fullClient = clientMap.get(p.idClientWorkspaceFk) ?? null;

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
                // Agregar el servicio si existe, pero solo con los campos necesarios
                service: ev.idServiceFk ? (() => {
                    const fullService = serviceMap.get(ev.idServiceFk);
                    return fullService ? {
                        id: fullService.id,
                        name: fullService.name,
                        duration: fullService.duration,
                        price: fullService.price,
                        discount: fullService.discount,
                        serviceType: fullService.serviceType,
                        color: fullService.color,
                        image: fullService.image,
                    } : null;
                })() : null,
            }));


            // 7) Respuesta
            res.status(200)
                .json(
                    Response.build(
                        'Datos extra de eventos encontrados',
                        200,
                        true,
                        eventsWithClientsAndServices,
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

            const isValidCancelledStatus = true;
            const result = await this.eventService.getEvents(pagination, isValidCancelledStatus);
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

            if (result) {
                let service = await getServiceByIds([result.idServiceFk], result.idWorkspaceFk);
                result.service = service[0] ?? null;
            }

            if (!result) {
                return res.status(404).json(Response.build("Evento no encontrado", 404, false));
            }

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


            // Borramos las notificaciones relacionadas
            // publishDeleteRecordsMessage({
            //     table: 'calendarEvents',
            //     ids: idList,
            // }, deleteRecordsRoutingKeys.notification);


            res.status(200).json(Response.build("Evento eliminado exitosamente", 200, true, result));
        } catch (err: any) {
            console.error("Error al eliminar el evento:", err);
            res.status(500).json({ message: err.message });
        }
    }


    // changeEventStatus = async (req: any, res: any, next: any) => {
    //     try {
    //         const { id, status, allGroup = false } = req.body;
    //         const token = req.token;
    //         await this.jwtService.verify(token);

    //         // Está preparado por si era pendiente y pasa a confirmado/aceptado o cancelado
    //         // manda las notificaciones correspondientes
    //         const result = await this.eventService.changeEventStatus(id, status, allGroup);
    //         res.status(200).json(Response.build("Estado del evento actualizado", 200, true, result));
    //     } catch (err: any) {
    //         res.status(500).json({ message: err.message });
    //     }
    // }


    changeEventStatus = async (req: any, res: any, next: any) => {
        try {
            const { id, status, allGroup = false } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            console.log("Cambio de estado solicitado:", { id, status, allGroup });

            const result = await this.eventService.changeEventStatus(
                id,
                status as EventStatusType,
                allGroup
            );

            if (!result) {
                return res
                    .status(400)
                    .json(Response.build("Transición no permitida o sin cambios", 400, false, null));
            }

            const { events, notifyEvents } = result;

            // 1) Resolver la acción de notificación según el nuevo estado
            let actionSectionType: ActionKey | null = null;

            if (
                status === EventStatusType.ACCEPTED ||
                status === EventStatusType.CONFIRMED
            ) {
                actionSectionType = "acceptRequest";     // ← tu clave para aceptar
            } else if (
                status === EventStatusType.CANCELLED ||
                status === EventStatusType.CANCELLED_BY_CLIENT ||
                status === EventStatusType.CANCELLED_BY_CLIENT_REMOVED
            ) {
                actionSectionType = "rejectRequest";     // ← la que uses para cancelar
            }

            console.log("Eventos a notificar22:", notifyEvents);
            console.log("Tipo de acción de notificación:", actionSectionType);
            // Si no hay acción o no hay nada que notificar, respondemos y listo
            if (!actionSectionType || !notifyEvents.length) {
                return res
                    .status(200)
                    .json(Response.build("Estado del evento actualizado", 200, true, events));
            }

            // 2) Caso simple: de momento, una notificación usando el primer evento notificable
            const idGroup = (notifyEvents[0] as any)?.idGroup;
            if (idGroup) {
                await createNotificationPlatform(idGroup, {
                    actionSectionType,
                });
            }

            return res
                .status(200)
                .json(Response.build("Estado del evento actualizado", 200, true, events));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    };



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






    // Entre microservicios
    // Entre microservicios
    // Entre microservicios
    // Entre microservicios
    // Entre microservicios
    // Entre microservicios
    getEventDataById = async (req: any, res: any) => {
        try {
            console.log(`${CONSOLE_COLOR.FgYellow} /event/data called ${CONSOLE_COLOR.Reset}`);
            const { id, idWorkspace } = req.body;

            console.log("id", id);
            console.log("idWorkspace", idWorkspace);
            if (!id) {
                return res.status(400).json({ ok: false, message: "id (string) is required" });
            }
            if (!idWorkspace) {
                return res.status(400).json({ ok: false, message: "idWorkspace (string) is required" });
            }

            const { item, count } = await this.eventService.getEventDataById(id, idWorkspace);

            console.log("voy a devolver esto", item, count);
            console.log(`${CONSOLE_COLOR.FgGreen} /event/data completed ${CONSOLE_COLOR.Reset}`, { count });
            return res.status(200).json({ ok: true, item, count });
        } catch (err: any) {
            console.error(err);
            return res.status(500).json({ ok: false, message: err?.message || "Internal error" });
        }
    };


    // Evento entre microservicios
    getGroupDataById = async (req: any, res: any) => {
        try {
            console.log(`${CONSOLE_COLOR.FgYellow} /event/group/data called ${CONSOLE_COLOR.Reset}`);
            const { idGroup, idWorkspace } = req.body;

            console.log("idGroup", idGroup);
            console.log("idWorkspace", idWorkspace);
            if (!idGroup) {
                return res.status(400).json({ ok: false, message: "idGroup (string) is required" });
            }
            if (!idWorkspace) {
                return res.status(400).json({ ok: false, message: "idWorkspace (string) is required" });
            }

            const { item, count } = await this.eventService.getGroupDataById(idGroup, idWorkspace);

            console.log("voy a devolver esto", item);
            console.log(`${CONSOLE_COLOR.FgGreen} /event/group/data completed ${CONSOLE_COLOR.Reset}`, { count });
            return res.status(200).json({ ok: true, item, count });
        } catch (err: any) {
            console.error(err);
            return res.status(500).json({ ok: false, message: err?.message || "Internal error" });
        }
    }



}
