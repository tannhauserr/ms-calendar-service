import { EventStatusType } from "@prisma/client";
import { CONSOLE_COLOR } from "../../../constant/console-color";
import { buildControllerErrorResponse } from "../../../models/error-codes";
import { Response } from "../../../models/messages/response";
import { SidebarBackendBookingPayload } from "../../../services/@database/event/dto/SidebarBackendBookingPayload";
import { JWTService } from "../../../services/jwt/jwt.service";
import {
    ChangeEventStatusBodyDto,
    ChangeEventStatusByParticipantBodyDto,
    DeleteEventBodyDto,
    GetEventByIdParamsDto,
    GetEventExtraDataBodyDto,
    GetEventExtraDataParamsDto,
    GetEventsBodyDto,
    GetEventsListBodyDto,
    InternalGetEventDataByIdBodyDto,
    InternalGetGroupDataByIdBodyDto,
    MarkCommentAsReadBodyDto,
    UpdateByIdBodyDto,
    UpsertEventByPlatformBodyDto,
} from "../dto";
import { EventPlatformQueryService } from "../services/event-platform.query.service";
import { EventPlatformCommandService, UpdateEventByIdPayload } from "../services/event-platform.command.service";

export class EventPlatformController {
    private readonly jwtService: JWTService = JWTService.instance;
    private readonly queries: EventPlatformQueryService = new EventPlatformQueryService();
    private readonly commands: EventPlatformCommandService = new EventPlatformCommandService();

    constructor() {}

    public upsertEventByPlatform = async (req: any, res: any) => {
        try {
            const payload: UpsertEventByPlatformBodyDto & SidebarBackendBookingPayload = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            if (!payload.type) {
                return res
                    .status(400)
                    .json(buildControllerErrorResponse("VALIDATION_REQUIRED_FIELD", 400, "El campo 'type' es requerido"));
            }
            if (payload.type !== "event") {
                return res.status(400).json(
                    buildControllerErrorResponse(
                        "VALIDATION_INVALID_PAYLOAD",
                        400,
                        `Tipo '${payload.type}' no soportado en esta versión`
                    )
                );
            }
            if (!payload.idCompany) {
                return res
                    .status(400)
                    .json(buildControllerErrorResponse("VALIDATION_REQUIRED_FIELD", 400, "El campo 'idCompany' es requerido"));
            }
            if (!payload.idWorkspace) {
                return res.status(400).json(
                    buildControllerErrorResponse("VALIDATION_REQUIRED_FIELD", 400, "El campo 'idWorkspace' es requerido")
                );
            }
            if (!payload.startDate) {
                return res
                    .status(400)
                    .json(buildControllerErrorResponse("VALIDATION_REQUIRED_FIELD", 400, "El campo 'startDate' es requerido"));
            }
            if (!Array.isArray(payload.services)) {
                return res.status(400).json(
                    buildControllerErrorResponse("VALIDATION_INVALID_PAYLOAD", 400, "El campo 'services' debe ser un array")
                );
            }
            if (!Array.isArray(payload.clients)) {
                return res.status(400).json(
                    buildControllerErrorResponse("VALIDATION_INVALID_PAYLOAD", 400, "El campo 'clients' debe ser un array")
                );
            }

            const result = await this.commands.upsertEventByPlatform(payload);
            return res.status(200).json(Response.build(result.message, 200, true, result.item));
        } catch (err: any) {
            console.error(
                `${CONSOLE_COLOR.BgRed}[EventController.upsertEventByPlatform]${CONSOLE_COLOR.Reset}`,
                err?.message
            );
            return res
                .status(500)
                .json(
                    buildControllerErrorResponse(
                        "INTERNAL_SERVER_ERROR",
                        500,
                        err?.message ?? "Error interno del servidor"
                    )
                );
        }
    };

    public markCommentAsRead = async (req: any, res: any) => {
        try {
            const { idEvent, idWorkspace } = req.body as MarkCommentAsReadBodyDto;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.commands.markCommentAsRead(idEvent, idWorkspace);
            return res.status(200).json(Response.build("Comentario marcado como leído", 200, true, result));
        } catch (err: any) {
            return res.status(500).json(buildControllerErrorResponse("INTERNAL_SERVER_ERROR", 500, err?.message));
        }
    };

    public get = async (req: any, res: any) => {
        try {
            const { pagination } = req.body as GetEventsBodyDto;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.queries.getEvents(pagination as any);
            return res.status(200).json({ message: "Eventos encontrados", ok: true, item: result });
        } catch (err: any) {
            return res.status(500).json(buildControllerErrorResponse("INTERNAL_SERVER_ERROR", 500, err?.message));
        }
    };

    public getEventExtraData = async (req: any, res: any) => {
        try {
            const { idList } = req.body as GetEventExtraDataBodyDto;
            const { idCompany, idWorkspace } = req.params as GetEventExtraDataParamsDto;

            if (!Array.isArray(idList) || idList.length === 0) {
                return res
                    .status(400)
                    .json(buildControllerErrorResponse("VALIDATION_REQUIRED_FIELD", 400, "Faltan ids de evento"));
            }
            if (!idWorkspace) {
                return res.status(400).json(
                    buildControllerErrorResponse("VALIDATION_REQUIRED_FIELD", 400, "Falta el id del establecimiento")
                );
            }
            if (!idCompany) {
                return res
                    .status(400)
                    .json(buildControllerErrorResponse("VALIDATION_REQUIRED_FIELD", 400, "Falta el id de la compañía"));
            }

            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.queries.getEventExtraData(idList, idCompany, idWorkspace);
            return res.status(200).json(Response.build("Datos extra de eventos encontrados", 200, true, result));
        } catch (err: any) {
            return res.status(500).json(buildControllerErrorResponse("INTERNAL_SERVER_ERROR", 500, err?.message));
        }
    };

    public getList = async (req: any, res: any) => {
        try {
            const { pagination, idCompany, idWorkspace } = req.body as GetEventsListBodyDto;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.queries.getEventsList(
                pagination as any,
                idCompany,
                idWorkspace
            );

            return res.status(200).json({ message: "Eventos encontrados", ok: true, item: result });
        } catch (err: any) {
            return res.status(500).json(buildControllerErrorResponse("INTERNAL_SERVER_ERROR", 500, err?.message));
        }
    };

    public getById = async (req: any, res: any) => {
        try {
            const { id } = req.params as GetEventByIdParamsDto;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.queries.getEventById(id);
            if (!result) {
                return res
                    .status(404)
                    .json(buildControllerErrorResponse("RESOURCE_NOT_FOUND", 404, "Evento no encontrado"));
            }

            return res.status(200).json(Response.build("Evento encontrado", 200, true, result));
        } catch (err: any) {
            return res.status(500).json(buildControllerErrorResponse("INTERNAL_SERVER_ERROR", 500, err?.message));
        }
    };

    public deleteEvent = async (req: any, res: any) => {
        try {
            const { idList } = req.body as DeleteEventBodyDto;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.commands.deleteEvent(idList);
            return res.status(200).json(Response.build("Evento eliminado exitosamente", 200, true, result));
        } catch (err: any) {
            console.error("Error al eliminar el evento:", err);
            return res.status(500).json(buildControllerErrorResponse("INTERNAL_SERVER_ERROR", 500, err?.message));
        }
    };

    public changeEventStatus = async (req: any, res: any) => {
        try {
            const { id, status, allGroup = false } = req.body as ChangeEventStatusBodyDto;
            const token = req.token;
            await this.jwtService.verify(token);

            const events = await this.commands.changeEventStatus(id, status as EventStatusType, allGroup);
            if (!events) {
                return res
                    .status(400)
                    .json(
                        buildControllerErrorResponse(
                            "BUSINESS_RULE_NOT_ALLOWED",
                            400,
                            "Transición no permitida o sin cambios"
                        )
                    );
            }

            return res.status(200).json(Response.build("Estado del evento actualizado", 200, true, events));
        } catch (err: any) {
            return res.status(500).json(buildControllerErrorResponse("INTERNAL_SERVER_ERROR", 500, err?.message));
        }
    };

    public updateById = async (req: any, res: any) => {
        try {
            const token = req.token;
            await this.jwtService.verify(token);

            const payload = (req.body ?? {}) as UpdateByIdBodyDto & UpdateEventByIdPayload;
            const eventId = req.params?.id ?? payload?.event?.id;

            if (!eventId || typeof eventId !== "string") {
                return res
                    .status(400)
                    .json(buildControllerErrorResponse("VALIDATION_REQUIRED_FIELD", 400, "Falta id de evento en path"));
            }

            const result = await this.commands.updateById(eventId, payload);
            return res.status(200).json(Response.build("Evento actualizado", 200, true, result));
        } catch (err: any) {
            return res
                .status(500)
                .json(buildControllerErrorResponse("INTERNAL_SERVER_ERROR", 500, err?.message ?? "Error interno"));
        }
    };

    public changeEventStatusByParticipant = async (req: any, res: any) => {
        try {
            const { id, idClient, idClientWorkspace, action } =
                req.body as ChangeEventStatusByParticipantBodyDto;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.commands.changeEventStatusByParticipant(
                id,
                idClient,
                idClientWorkspace,
                action
            );

            return res.status(200).json(Response.build("Estado del evento actualizado", 200, true, result));
        } catch (err: any) {
            return res.status(500).json(buildControllerErrorResponse("INTERNAL_SERVER_ERROR", 500, err?.message));
        }
    };

    public internalGetEventDataById = async (req: any, res: any) => {
        try {
            const { id, idWorkspace } = req.body as InternalGetEventDataByIdBodyDto;
            if (!id) {
                return res
                    .status(400)
                    .json(buildControllerErrorResponse("VALIDATION_REQUIRED_FIELD", 400, "id (string) is required"));
            }
            if (!idWorkspace) {
                return res.status(400).json(
                    buildControllerErrorResponse("VALIDATION_REQUIRED_FIELD", 400, "idWorkspace (string) is required")
                );
            }

            const { item, count } = await this.queries.internalGetEventDataById(id, idWorkspace);
            return res.status(200).json({ ok: true, item, count });
        } catch (err: any) {
            return res
                .status(500)
                .json(buildControllerErrorResponse("INTERNAL_SERVER_ERROR", 500, err?.message || "Internal error"));
        }
    };

    public internalGetGroupDataById = async (req: any, res: any) => {
        try {
            const { idGroup, idWorkspace } = req.body as InternalGetGroupDataByIdBodyDto;
            if (!idGroup) {
                return res.status(400).json(
                    buildControllerErrorResponse("VALIDATION_REQUIRED_FIELD", 400, "idGroup (string) is required")
                );
            }
            if (!idWorkspace) {
                return res.status(400).json(
                    buildControllerErrorResponse("VALIDATION_REQUIRED_FIELD", 400, "idWorkspace (string) is required")
                );
            }

            const { item, count } = await this.queries.internalGetGroupDataById(idGroup, idWorkspace);
            return res.status(200).json({ ok: true, item, count });
        } catch (err: any) {
            return res
                .status(500)
                .json(buildControllerErrorResponse("INTERNAL_SERVER_ERROR", 500, err?.message || "Internal error"));
        }
    };
}
