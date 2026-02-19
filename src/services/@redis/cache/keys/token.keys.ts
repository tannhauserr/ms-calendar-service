
export const TokenKeys = {
    // ChangeChatHandler    
    changeChatHandler: (chatId: string) => `changeChatHandler:${chatId}`,

    /**
    * Saved basic information to create a reservetation by idWorkspace
    * Ms-Chat - MS-Login y MS-Calendar
    */
    savedBasicInformationToCreateReservationByIdWorkspace: (idWorkspace: string) => `savedBasicInformationToCreateReservationByIdWorkspace:${idWorkspace}`,


    /**
     * Usada en getAvailableTimeSlots(
     * @param idWorkspace 
     * @returns 
     */
    businessHours: (idWorkspace: string) => `businessHours:${idWorkspace}`,

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


    userCompanyRoleKey: (userId: string) => `userCompanyRole:${userId}`,
};
