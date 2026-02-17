import { Response } from "../../../models/messages/response";
import { BusinessHourInternalService } from "../services/business-hour.internal.service";

export class BusinessHourInternalController {
    private readonly service = new BusinessHourInternalService();

    /** Returns business hours for internal microservice consumers. */
    getBusinessHoursFromRedis = async (req: any, res: any) => {
        try {
            const { idCompany, idWorkspace } = req.body;
            const result = await this.service.getBusinessHoursFromRedis(idCompany, idWorkspace);
            return res.status(200).json(Response.build("Registros encontrados", 200, true, result));
        } catch (err: any) {
            return res.status(500).json({ message: err.message });
        }
    };

    /** Creates workspace business hours from an internal request. */
    generateWorkspaceBusinessHours = async (req: any, res: any) => {
        try {
            const { idCompany, idWorkspace, businessHours } = req.body;
            const result = await this.service.generateWorkspaceBusinessHours(
                idCompany,
                idWorkspace,
                businessHours
            );
            return res.status(200).json(Response.build("Horario de workspace generado", 200, true, result));
        } catch (err: any) {
            return res.status(500).json({ message: err.message });
        }
    };
}
