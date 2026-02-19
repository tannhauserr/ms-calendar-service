import { Response } from "../../../models/messages/response";
import { buildControllerErrorResponse } from "../../../models/error-codes";
import { BusinessHourInternalService } from "../services/business-hour.internal.service";
import { BusinessHoursRedisDto, InternalGenerateWorkspaceBusinessHoursDto } from "../dto";

export class BusinessHourInternalController {
    private readonly service = new BusinessHourInternalService();

    /** Returns business hours for internal microservice consumers. */
    getBusinessHoursFromRedis = async (req: any, res: any) => {
        try {
            const { idCompany, idWorkspace } = req.body as BusinessHoursRedisDto;
            const result = await this.service.getBusinessHoursFromRedis(idCompany, idWorkspace);
            return res.status(200).json(Response.build("Registros encontrados", 200, true, result));
        } catch (err: any) {
            return res
                .status(500)
                .json(buildControllerErrorResponse("INTERNAL_SERVER_ERROR", 500, err?.message));
        }
    };

    /** Creates workspace business hours from an internal request. */
    generateWorkspaceBusinessHours = async (req: any, res: any) => {
        try {
            const { idCompany, idWorkspace, businessHours } =
                req.body as InternalGenerateWorkspaceBusinessHoursDto;
            const result = await this.service.generateWorkspaceBusinessHours(
                idCompany,
                idWorkspace,
                businessHours
            );
            return res.status(200).json(Response.build("Horario de workspace generado", 200, true, result));
        } catch (err: any) {
            return res
                .status(500)
                .json(buildControllerErrorResponse("INTERNAL_SERVER_ERROR", 500, err?.message));
        }
    };
}
