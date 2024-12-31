
export const TokenKeys = {
    // OAUTH
    googleAccessToken: (userId: string) => `user:${userId}:googleAccessToken`,
    googleRefreshToken: (userId: string) => `user:${userId}:googleRefreshToken`,

    // CHANNEL Google Calendar
    channelConfigCalendar: () => `channelConfigCalendar`,
    handleOutgoingEvent: (eventId: string) => `handleOutgoingEvent:${eventId}`,

    // Event UserColor
    userColor: (userId: string) => `userColor:${userId}`,

    // ChangeChatHandler    
    changeChatHandler: (chatId: string) => `changeChatHandler:${chatId}`,

    /**
    * Saved basic information to create a reservetation by idEstablishment
    * Ms-Chat - MS-Login y MS-Calendar
    */
    savedBasicInformationToCreateReservationByIdEstablishment: (idEstablishment: string) => `savedBasicInformationToCreateReservationByIdEstablishment:${idEstablishment}`,


    /**
     * Usada en getAvailableTimeSlots(
     * @param idEstablishment 
     * @returns 
     */
    businessHours: (idEstablishment: string) => `businessHours:${idEstablishment}`,

    /**
     * Usada en getAvailableTimeSlots
     * @param idCompany 
     * @param idUser 
     * @returns 
     */
    workerHours: (idCompany: string, idUser: string) => `workerHours:${idCompany}:${idUser}`,


    /**
    * Usada en getAvailableTimeSlots
    * @param idCompany 
    * @param idUser 
    * @returns 
    */
    temporaryHours: (idCompany: string, idUser: string) => `temporaryHours:${idCompany}:${idUser}`,
};
