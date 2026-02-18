import { BusinessHourService } from "./business-hour.service";
import { WorkspaceBusinessHourDraftDto } from "../dto";

export class BusinessHourInternalService {
    private readonly businessHourService = new BusinessHourService();

    /** Proxies cached business-hour retrieval for internal consumers. */
    async getBusinessHoursFromRedis(idCompany: string, idWorkspace: string) {
        return this.businessHourService.getBusinessHoursFromRedis(idCompany, idWorkspace);
    }

    /** Proxies workspace business-hours generation for internal consumers. */
    async generateWorkspaceBusinessHours(
        idCompany: string,
        idWorkspace: string,
        businessHours: WorkspaceBusinessHourDraftDto[]
    ) {
        return this.businessHourService.internalGenerateWorkspaceBusinessHours(
            idCompany,
            idWorkspace,
            businessHours
        );
    }
}
