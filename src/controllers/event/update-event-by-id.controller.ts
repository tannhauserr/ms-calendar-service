import { Response } from "../../models/messages/response";
import { createNotification as createNotificationPlatform } from "../../models/notification/util/trigger/util/for-action-platform";
import { UpdateEventByIdPayload, UpdateEventByIdService } from "../../services/@database/event/update-event-by-id.service";
import { JWTService } from "../../services/jwt/jwt.service";

export class UpdateEventByIdController {
    private jwtService: JWTService;
    private updateEventByIdService: UpdateEventByIdService;

    constructor() {
        this.jwtService = JWTService.instance;
        this.updateEventByIdService = new UpdateEventByIdService();
    }

    public updateById = async (req: any, res: any) => {
        try {
            const token = req.token;
            await this.jwtService.verify(token);

            const { event, isMany = false, sendNotification = false } = req.body as UpdateEventByIdPayload;

            if (!event || typeof event !== "object") {
                return res.status(400).json(Response.build("Falta objeto event", 400, false));
            }

            const result = await this.updateEventByIdService.updateEventById({
                event,
                isMany,
                sendNotification,
            });

            // Código legacy reemplazado:
            // const result = await this.eventService.updateEventV2(req.body);
            if (sendNotification && Array.isArray(result?.affectedGroupIds) && result.affectedGroupIds.length > 0) {
                await Promise.all(
                    result.affectedGroupIds.map(async (idGroup: string) => {
                        await createNotificationPlatform(idGroup, { actionSectionType: "update" });
                    })
                );
            }

            return res.status(200).json(Response.build("Evento actualizado", 200, true, result));
        } catch (err: any) {
            return res.status(500).json({ message: err?.message ?? "Error interno" });
        }
    };
}

