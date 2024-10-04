
// Importar otras estrategias...

import { AvoidSameEventStrategy } from "./avoidSameEvent/avoidSameEvent.strategy";
import { ChannelCalendarStrategy } from "./channelCalendar/channelCalendar.strategy";
import { ChatHandlerStrategy } from "./chatHandler/chatHandler.strategy";
import { GoogleOAuthStrategy } from "./googleOAuth/googleOAuth.strategy";
import { UserColorStrategy } from "./useColor/useColor.strategy";


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
            case 'changeChatHandler':
                return new ChatHandlerStrategy();

            // Otros casos para diferentes estrategias...
            default:
                throw new Error(`Strategy ${strategyName} not found`);
        }
    }
}
