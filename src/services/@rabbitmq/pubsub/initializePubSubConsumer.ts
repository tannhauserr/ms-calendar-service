import { deleteRecordsConsumers, recurrenceWorkerConsumer, updateServiceInEventConsumer } from "./consumer";




export const initializeConsumerPubSub_RabbitMQ = () => {

    console.log("INICIALIZANDO RABBIT PUBSUB CONSUMER");
    deleteRecordsConsumers.deleteRecordsConsumer();
    deleteRecordsConsumers.deleteRecordsDLQConsumer();

    recurrenceWorkerConsumer();
    updateServiceInEventConsumer();


}