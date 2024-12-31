
// Importar otras estrategias...

import { SavedBasicInformationByEstablishmentStrategy } from "./@flow/saved-basic-information-by-establishment.strategy";
import { AvoidSameEventStrategy } from "./avoidSameEvent/avoidSameEvent.strategy";
import { BusinessHoursStrategy } from "./businessHours/businessHours.strategy";
import { ChannelCalendarStrategy } from "./channelCalendar/channelCalendar.strategy";
import { GoogleOAuthStrategy } from "./googleOAuth/googleOAuth.strategy";
import { TemporaryHoursStrategy } from "./temporaryHours/temporaryHours.strategy";
import { UserColorStrategy } from "./useColor/useColor.strategy";
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
            case 'savedBasicInformationToCreateReservationByIdEstablishment':
                return new SavedBasicInformationByEstablishmentStrategy();


            // Otros casos para diferentes estrategias...
            default:
                throw new Error(`Strategy ${strategyName} not found`);
        }
    }
}
