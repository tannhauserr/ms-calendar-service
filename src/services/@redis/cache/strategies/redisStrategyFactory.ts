
// Importar otras estrategias...

import { SavedBasicInformationByWorkspaceStrategy } from "./@flow/saved-basic-information-by-workspace.strategy";
import { SavedWorkspaceStrategy } from "./@flow/savedWorkspace.strategy";
import { AvoidSameEventStrategy } from "./avoidSameEvent/avoidSameEvent.strategy";
import { BusinessHoursStrategy } from "./businessHours/businessHours.strategy";
import { ChannelCalendarStrategy } from "./channelCalendar/channelCalendar.strategy";
import { GoogleOAuthStrategy } from "./googleOAuth/googleOAuth.strategy";
import { RoundRobinStrategy } from "./roundRobin/roundRobinStrategy";
import { TemporaryHoursStrategy } from "./temporaryHours/temporaryHours.strategy";
import { UserColorStrategy } from "./useColor/useColor.strategy";
import { UserCompanyRoleStrategy } from "./userCompanyRole/userCompanyRoleStrategy";
import { WorkerHoursStrategy } from "./workerHours/workerHours.strategy";


export class RedisStrategyFactory {
    static getStrategy(strategyName: string) {
        switch (strategyName) {
            case 'googleOAuth':
                return new GoogleOAuthStrategy()
            case 'channelCalendar':
                return new ChannelCalendarStrategy()
            case 'userColor':
                return new UserColorStrategy();
            case 'avoidSameEvent':
                return new AvoidSameEventStrategy();
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


            // Otros casos para diferentes estrategias...
            default:
                throw new Error(`Strategy ${strategyName} not found`);
        }
    }
}
