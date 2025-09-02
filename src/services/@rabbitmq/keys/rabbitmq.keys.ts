

export const RabbitMQKeys = {
    // Cola general para que los microservicios soliciten citas disponibles
    calendarQueue: () => `calendar_request_queue`,
    // Exchange general de respuesta (podría usarse para múltiples tipos de respuestas)
    responseExchange: () => `response_exchange`,



    // Colas donde no se espera respuesta
    handleUserQueue: () => `handle_user_queue`,

    handleCompanyDeleteQueue: () => `handle_company_delete_queue`,


    // PUBSUB
    // motification
    pubSubNotificationExchange: () => "pubsub_notification_exchange",
    pubSubNotificationQueue: () => "pubsub_notification_queue",
    pubSubNotificationRoutingKey: () => "notification_rk",

    // log
    pubSubLogExchange: () => "pubsub_log_exchange",
    pubSubLogQueue: () => "pubsub_log_queue",
    pubSubLogRoutingKey: () => "log_rk",


    // MS-Login - Ms-Calendar - MsClient - Ms-Notification
    // delete

    // Exchange para mensajes de borrado
    pubSubDeleteExchange: () => "pubsub_delete_exchange",

    // Colas para cada microservicio
    pubSubDeleteClientsQueue: () => "pubsub_delete_clients_queue",
    pubSubDeleteCalendarQueue: () => "pubsub_delete_calendar_queue",
    pubSubDeleteNotificationQueue: () => "pubsub_delete_notification_queue",

    // Routing keys para cada microservicio
    pubSubDeleteClientsRoutingKey: () => "delete.clients" as const,
    pubSubDeleteCalendarRoutingKey: () => "delete.calendar" as const,
    pubSubDeleteNotificationRoutingKey: () => "delete.notification" as const,


    // Ms-Calendar Recurrence worker  –– main queue, DLQ & routing keys
    pubSubCalendarRecurrenceExchange: () => "calendar_recurrence_exchange",
    pubSubCalendarRecurrenceQueue: () => "calendar_recurrence_queue",
    pubSubCalendarRecurrenceDLQ: () => "calendar_recurrence_dlq",
    pubSubCalendarRecurrenceRoutingKey: () => "recurrence.op",

    // Ms-Calendar Update Service In Event worker –– main queue, DLQ & routing keys
    pubSubUpdateServiceInEventExchange: () => "pubsub_update_service_in_event_exchange",
    pubSubUpdateServiceInEventQueue: () => "pubsub_update_service_in_event_queue",
    pubSubUpdateServiceInEventDLQ: () => "pubsub_update_service_in_event_dlq",
    pubSubUpdateServiceInEventRoutingKey: () => "pubsub_update_service_in_event_rk",

    // Rpc

    /**
     * Obtiene las categorias y los servicios de un establecimiento en concreto
     * MS-Chat - MS-Calendar
     */
    handleRpcGetCategoryAndServicesForFlowQueue: () => `rpc_get_category_services_for_flow_queue`,

    /**
* MS-Calendar - Ms-Client
* Devuelve un cliente o varios clientes por su ID de establecimiento
* id del establecimiento e id del cliente (general). Se guardará el cliente del establecimiento en Redis
*/
    handleRpcGetClientListByIdsQueue: () => `rpc_get_client_list_by_ids_queue`,

    /**
 * Obtiene los usuarios
 * 
 * MS-Chat - MS-Login
 * Ms-Calendar (es usado para comprobar que un usuario tiene permisos para un establecimiento)
 */
    handleRpcGetUserForFlowQueue: () => `rpc_get_user_for_flow_queue`,

    /**
    * Obtiene los slots de tiempo disponibles para una cita.
    * MS-Chat - MS-Calendar
    */
    handleRpcGetAvaiableTimeSlotsForFlowQueue: () => `rpc_get_avaiable_time_slots_queue`,

    /**
    * Obtiene las categorias y los servicios de un establecimiento en concreto.
    * MS-Chat - MS-Calendar
    */
    handleRpcGetEventParticipantForFlowQueue: () => `rpc_get_event_client_for_flow_queue`,




    /**
    * Agrega un evento al calendario
    * 
    * MS-Chats - MS-Calendar
    */
    handleRpcAddEventToCalendarQueue: () => `rpc_add_event_to_calendar_queue`,

    /**
     * Modifica un evento en el calendario
     *
     * MS-Chats - MS-Calendar
     */
    handleRpcModifyEventToCalendarQueue: () => `rpc_modify_event_to_calendar_queue`,

    // MS-Login - Ms-Category
    handleRpcCheckUserRoleQueue: () => `rpc_check_user_role_queue`,


    /**
        * Obtiene todos los establecimientos mediante una busqueda
        * 
        * MS-Chat - MS-Login - MS-calendar
        */
    handleRpcGetEstablishmentBySearchQueue: () => `rpc_get_workspace_by_search_queue`,



};
