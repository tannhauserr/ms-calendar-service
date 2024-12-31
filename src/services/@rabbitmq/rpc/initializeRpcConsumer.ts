import { addEventToCalendarConsumer, getAvailableTimeSlots, getCategoriesAndServices } from "./consumer";



export const initializeConsumerRCP_RabbitMQ = () => {

    console.log("INICIALIZANDO RABBIT CONSUMER")
    getCategoriesAndServices();
    getAvailableTimeSlots();
    addEventToCalendarConsumer();

}