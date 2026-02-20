import { buildControllerErrorResponse } from "../../../models/error-codes";
import { Response } from "../../../models/messages/response";
import { JWTService } from "../../../services/jwt/jwt.service";
import { DeadLetterMessagesQueryDto, ReplayDeadLetterMessageParamsDto } from "../dto";
import { OpsDlqCommandService } from "../services/ops-dlq.command.service";
import { OpsDlqQueryService } from "../services/ops-dlq.query.service";

export class OpsDlqController {
    private readonly jwtService: JWTService = JWTService.instance;
    private readonly queries: OpsDlqQueryService = new OpsDlqQueryService();
    private readonly commands: OpsDlqCommandService = new OpsDlqCommandService();
    private readonly allowedRoles = new Set(["ROLE_SUPER_ADMIN", "ROLE_DEVELOPER"]);

    private async verifyRole(token: string): Promise<string> {
        const decoded = await this.jwtService.verify(token);
        const role = decoded?.role;
        if (!this.allowedRoles.has(role)) {
            throw new Error("DLQ_ROLE_NOT_ALLOWED");
        }
        return role;
    }

    public getDeadLetterMessages = async (req: any, res: any) => {
        try {
            const token = req.token;
            await this.verifyRole(token);

            const { page, itemsPerPage, status, consumerName } = req.query as DeadLetterMessagesQueryDto;
            const result = await this.queries.getDeadLetterMessages({
                page,
                itemsPerPage,
                status: status as any,
                consumerName,
            });

            return res.status(200).json(Response.build("Mensajes DLQ encontrados", 200, true, result));
        } catch (error: any) {
            if (error?.message === "DLQ_ROLE_NOT_ALLOWED") {
                return res.status(403).json(
                    Response.build(
                        "Solo ROLE_SUPER_ADMIN y ROLE_DEVELOPER pueden gestionar mensajes DLQ",
                        403,
                        false,
                        null
                    )
                );
            }

            return res
                .status(500)
                .json(buildControllerErrorResponse("INTERNAL_SERVER_ERROR", 500, error?.message ?? "Error interno"));
        }
    };

    public replayDeadLetterMessage = async (req: any, res: any) => {
        try {
            const token = req.token;
            const role = await this.verifyRole(token);
            const { id } = req.params as ReplayDeadLetterMessageParamsDto;

            const result = await this.commands.replayDeadLetterMessage(id, role);
            if (!result) {
                return res
                    .status(404)
                    .json(buildControllerErrorResponse("RESOURCE_NOT_FOUND", 404, "Mensaje DLQ no encontrado"));
            }

            return res.status(200).json(Response.build("Mensaje reenviado a la cola principal", 200, true, result));
        } catch (error: any) {
            if (error?.message === "DLQ_ROLE_NOT_ALLOWED") {
                return res.status(403).json(
                    Response.build(
                        "Solo ROLE_SUPER_ADMIN y ROLE_DEVELOPER pueden gestionar mensajes DLQ",
                        403,
                        false,
                        null
                    )
                );
            }

            return res
                .status(500)
                .json(buildControllerErrorResponse("INTERNAL_SERVER_ERROR", 500, error?.message ?? "Error interno"));
        }
    };
}
