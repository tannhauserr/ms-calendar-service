import {
    calendarConsumer,
    handleCompanyDeleteConsumer,
    handleUserConsumer
} from "./consumer"

export const initializeConsumerRabbitMQ = () => {

    calendarConsumer();
    handleUserConsumer();
    handleCompanyDeleteConsumer();

}