import { ChannelCalendar } from "../../../caledar-googleapi/interfaces/channel-calendar";
import { UserColorCalendar } from "../../../caledar-googleapi/interfaces/user-color-calendar";



export interface IRedisOAuthStrategy {
    setAccessToken(userId: string, token: string, ttl?: number): Promise<void>;
    getAccessToken(userId: string): Promise<string | null>;
    // deleteAccessToken(userId: string): Promise<number>;
    // Otros métodos específicos de la categoría...
}

export interface IRedisChannelClanedarStrategy {
    getChannelCalendar(): Promise<ChannelCalendar>;
    saveChannelCalendar(channelConfig: ChannelCalendar): Promise<void>;
}

export interface IRedisUserColorStrategy {
    getUserColorByIdUser(idUserFk: string): Promise<UserColorCalendar>;
    saveUserColorByIdUser(idUserFk: string, userColor: UserColorCalendar, ttl?: number): Promise<void>;
    deleteUserColorByIdUser(idUserFk: string): Promise<void>;
}

export interface IRedisAvoidSameEventStrategy {
    setEventFromGoogle(eventId: string, ttl?: number): Promise<void>;
    getEventFromGoogle(eventId: string): Promise<string | null>;
}



export interface IRedisChangeChatHandlerStrategy {
    setChangeChatHandler(chatId: string, typeChat: "bot" | "human", ttl?: number): Promise<void>;
    getChangeChatHandler(chatId: string): Promise<string | null>;

}