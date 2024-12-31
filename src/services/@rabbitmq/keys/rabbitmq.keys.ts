

export const RabbitMQKeys = {
    // Cola general para que los microservicios soliciten citas disponibles
    calendarQueue: () => `calendar_request_queue`,
    // Exchange general de respuesta (podría usarse para múltiples tipos de respuestas)
    responseExchange: () => `response_exchange`,



    // Colas donde no se espera respuesta
    handleUserQueue: () => `handle_user_queue`,

    handleCompanyDeleteQueue: () => `handle_company_delete_queue`,




    // Rpc

    /**
     * Obtiene las categorias y los servicios de un establecimiento en concreto
     * MS-Chat - MS-Calendar
     */
    handleRpcGetCategoryAndServicesForFlowQueue: () => `rpc_get_category_services_for_flow_queue`,

        /**
     * Obtiene los usuarios
     * 
     * MS-Chat - MS-Login
     * Ms-Calendar (es usado para comprobar que un usuario tiene permisos para un establecimiento)
     */
        handleRpcGetUserForFlowQueue: () => `rpc_get_user_for_flow_queue`,

    /**
    * Obtiene los slots de tiempo disponibles para una cita.
    * 
    * MS-Chat - MS-Calendar
    */
    handleRpcGetAvaiableTimeSlotsForFlowQueue: () => `rpc_get_avaiable_time_slots_queue`,

    /**
    * Agrega un evento al calendario
    * 
    * MS-Chats - MS-Calendar
    */
    handleRpcAddEventToCalendarQueue: () => `rpc_add_event_to_calendar_queue`,
};
