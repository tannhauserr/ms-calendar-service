import { get } from "http";
import { addEventToCalendarConsumer, getAvailableTimeSlots, getCategoriesAndServices, getEventsClientForFlowConsumer, manageEventForFlowConsumer } from "./consumer";



export const initializeConsumerRCP_RabbitMQ = () => {

    console.log("INICIALIZANDO RABBIT CONSUMER")
    getCategoriesAndServices();
    getAvailableTimeSlots();
    manageEventForFlowConsumer();
    // addEventToCalendarConsumer();
    getEventsClientForFlowConsumer();

}