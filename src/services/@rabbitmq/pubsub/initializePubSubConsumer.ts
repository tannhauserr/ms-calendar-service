import { update } from "@react-spring/web";
import { deleteRecordsConsumer, recurrenceWorkerConsumer, updateServiceInEventConsumer } from "./consumer";




export const initializeConsumerPubSub_RabbitMQ = () => {

    console.log("INICIALIZANDO RABBIT PUBSUB CONSUMER");
    deleteRecordsConsumer();
    recurrenceWorkerConsumer();
    updateServiceInEventConsumer();


}