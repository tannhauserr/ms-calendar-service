

export const KEY_PROJECT = process.env.KEY_PROJECT;

export const TokenKeys = {
    // OAUTH
    googleAccessToken: (userId: string) => `${KEY_PROJECT}:user:${userId}:googleAccessToken`,
    googleRefreshToken: (userId: string) => `${KEY_PROJECT}:user:${userId}:googleRefreshToken`,

    // CHANNEL Google Calendar
    channelConfigCalendar: () => `${KEY_PROJECT}:channelConfigCalendar`,
    handleOutgoingEvent: (eventId: string) => `${KEY_PROJECT}:handleOutgoingEvent:${eventId}`,

    // Event UserColor
    userColor: (userId: string) => `${KEY_PROJECT}:userColor:${userId}`,

    // ChangeChatHandler    
    changeChatHandler: (chatId: string) => `${KEY_PROJECT}:changeChatHandler:${chatId}`,

    // Puedes agregar más claves relacionadas aquí
};
