import { CONSOLE_COLOR } from "../../../constant/console-color";
import { Response } from "../../../models/messages/response";
import { JWTService } from "../../../services/jwt/jwt.service";
import { EventClientCommandService } from "../services/event-client.command.service";
import { EventClientQueryService } from "../services/event-client.query.service";

export class EventClientController {
    private readonly jwtService = JWTService.instance;
    private readonly queries = new EventClientQueryService();
    private readonly commands = new EventClientCommandService();

    public addFromWeb = async (req: any, res: any) => {
        try {
            const ctx = req.booking!.ctx;
            const { status, ok, message, item } = await this.commands.addFromWeb(ctx);
            return res.status(status).json(Response.build(message, status, ok, item));
        } catch (err: any) {
            console.error(
                CONSOLE_COLOR.BgRed,
                "[EventClientController.addFromWeb]",
                err?.message,
                CONSOLE_COLOR.Reset
            );
            return res.status(500).json({ message: err?.message ?? "Unexpected error" });
        }
    };

    public updateFromWeb = async (req: any, res: any) => {
        try {
            const ctx = req.booking!.ctx;
            const { status, ok, message, item, code } = await this.commands.updateFromWeb(ctx);
            return res.status(status).json(Response.build(message, status, ok, item, code || undefined));
        } catch (err: any) {
            console.error(
                CONSOLE_COLOR.BgRed,
                "[EventClientController.updateFromWeb] Error no controlado:",
                err?.message,
                CONSOLE_COLOR.Reset
            );
            return res.status(500).json({
                ok: false,
                message: err?.message ?? "Unexpected error",
            });
        }
    };

    /**
     * Se devuelve los activos y los cancelados solo por el cliente.
     */
    public getFromWeb = async (req: any, res: any, _next: any) => {
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
                    message: "No se pudo resolver idWorkspace o idClientWorkspace",
                });
            }

            const result = await this.queries.getFromWeb(
                scope,
                page,
                itemsPerPage,
                idClientWorkspace,
                idWorkspace
            );

            console.log(
                `${CONSOLE_COLOR.BgYellow}[EventClientController.getFromWeb] Resultados obtenidos:${CONSOLE_COLOR.Reset}`,
                result
            );

            return res.status(200).json({ message: "Eventos encontrados", ok: true, item: result });
        } catch (err: any) {
            return res.status(500).json({ message: err.message });
        }
    };

    public getEventByIdAndClientWorkspaceAndWorkspace = async (
        req: any,
        res: any,
        _next: any
    ) => {
        try {
            const { id: bookingIdFromFront, idWorkspace } = req.body;
            const ctx = req.booking?.ctx;
            const idClientWorkspace: string | undefined = ctx?.customer?.idClientWorkspace;

            if (!bookingIdFromFront || !idWorkspace || !idClientWorkspace) {
                return res.status(400).json({
                    ok: false,
                    message: "No se pudo resolver bookingId, idWorkspace o idClientWorkspace",
                });
            }

            const token = req.token;
            await this.jwtService.verify(token);

            console.log(
                `${CONSOLE_COLOR.BgYellow}[EventClientController.getEventByIdAndClientWorkspaceAndWorkspace] Params recibidos:${CONSOLE_COLOR.Reset}`,
                {
                    bookingId: bookingIdFromFront,
                    idClientWorkspace,
                    idWorkspace,
                }
            );

            const booking = await this.queries.getEventByGroupIdAndClientWorkspaceAndWorkspace(
                bookingIdFromFront,
                idClientWorkspace,
                idWorkspace
            );

            if (!booking) {
                return res.status(404).json(Response.build("Cita no encontrada", 404, false));
            }

            return res.status(200).json(Response.build("Cita encontrada", 200, true, booking));
        } catch (err: any) {
            return res.status(500).json({ ok: false, message: err.message });
        }
    };

    public cancelEventFromWeb = async (req: any, res: any, _next: any) => {
        try {
            const { idEvent, idWorkspace } = req.body;
            const ctx = req.booking?.ctx;
            const idClientWorkspaceCtx = ctx?.customer?.idClientWorkspace;

            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.commands.cancelEventFromWeb(
                idEvent,
                idClientWorkspaceCtx,
                idWorkspace
            );
            return res.status(200).json(Response.build("Evento cancelado", 200, true, result));
        } catch (err: any) {
            return res.status(500).json({ ok: false, message: err.message });
        }
    };

    public confirmEventFromWeb = async (req: any, res: any, _next: any) => {
        try {
            const { idEvent, idWorkspace } = req.body;
            const ctx = req.booking?.ctx;
            const idClientWorkspaceCtx = ctx?.customer?.idClientWorkspace;

            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.commands.confirmEventFromWeb(
                idEvent,
                idClientWorkspaceCtx,
                idWorkspace
            );
            return res.status(200).json(Response.build("Evento confirmado", 200, true, result));
        } catch (err: any) {
            return res.status(500).json({ ok: false, message: err.message });
        }
    };
}
