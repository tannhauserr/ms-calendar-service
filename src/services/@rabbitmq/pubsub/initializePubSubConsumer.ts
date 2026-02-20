import {
    deleteSOFTRecordsConsumers,
    // recurrenceWorkerConsumer,
    updateServiceInEventConsumer,
    updateServiceInEventDLQConsumer,
} from "./consumer";

export const initializeConsumerPubSub_RabbitMQ = () => {
    console.log("INICIALIZANDO RABBIT PUBSUB CONSUMER");
    deleteSOFTRecordsConsumers.deleteSOFTRecordsConsumer();
    deleteSOFTRecordsConsumers.deleteSOFTRecordsDLQConsumer();

    // recurrenceWorkerConsumer();
    updateServiceInEventConsumer();
    updateServiceInEventDLQConsumer();
}
