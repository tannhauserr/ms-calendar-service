

export const RabbitMQKeys = {
    // Cola general para que los microservicios soliciten citas disponibles
    calendarQueue: () => `calendar_request_queue`,
    // Exchange general de respuesta (podría usarse para múltiples tipos de respuestas)
    responseExchange: () => `response_exchange`,



    // Colas donde no se espera respuesta
    handleUserQueue: () => `handle_user_queue`,

    handleCompanyDeleteQueue: () => `handle_company_delete_queue`,

};
