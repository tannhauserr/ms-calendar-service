
// Importar otras estrategias...

import { SavedBasicInformationByWorkspaceStrategy } from "./@flow/saved-basic-information-by-workspace.strategy";
import { SavedWorkspaceStrategy } from "./@flow/savedWorkspace.strategy";
import { BookingPageBriefStrategy } from "./BookingPageBrief/bookingPageBrief.strategy";
import { BusinessHoursStrategy } from "./businessHours/businessHours.strategy";
import { ClientWorkspaceBriefStrategy } from "./clientBrief/client-brief.strategy";
import { RoundRobinStrategy } from "./roundRobin/round-robin.strategy";
import { ServiceBriefStrategy } from "./ServiceBrief/serviceBrief.strategy";
import { TemporaryHoursStrategy } from "./temporaryHours/temporaryHours.strategy";
import { UserBriefStrategy } from "./UserBrief/userBrief.strategy";
import { UserCompanyRoleStrategy } from "./userCompanyRole/userCompanyRoleStrategy";
import { WorkerHoursStrategy } from "./workerHours/workerHours.strategy";
import { WorkspaceBriefStrategy } from "./WorkspaceBrief/workspaceBrief.strategy";


export class RedisStrategyFactory {
    static getStrategy(strategyName: string) {
        switch (strategyName) {
            case 'businessHours':
                return new BusinessHoursStrategy();
            case 'workerHours':
                return new WorkerHoursStrategy();
            case 'temporaryHours':
                return new TemporaryHoursStrategy();
            case 'savedBasicInformationToCreateReservationByIdWorkspace':
                return new SavedBasicInformationByWorkspaceStrategy();
            case 'userCompanyRole':
                return new UserCompanyRoleStrategy();
            case 'savedWorkspace':
                return new SavedWorkspaceStrategy();
            case 'roundRobin':
                return new RoundRobinStrategy();
            case 'bookingPageBrief':
                return new BookingPageBriefStrategy();
            case 'serviceBrief':
                return new ServiceBriefStrategy();

            case 'workspaceBrief':
                return new WorkspaceBriefStrategy();
            case 'userBrief':
                return new UserBriefStrategy();
            case 'clientWorkspaceBrief':
                return new ClientWorkspaceBriefStrategy();


            // Otros casos para diferentes estrategias...
            default:
                throw new Error(`Strategy ${strategyName} not found`);
        }
    }
}
