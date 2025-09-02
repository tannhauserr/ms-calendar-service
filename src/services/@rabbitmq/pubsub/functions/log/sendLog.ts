// src/publishers/log-pubsub.publisher.ts


import { RabbitMQKeys } from "../../../keys/rabbitmq.keys";
import { ActionPayloads } from "../../../actions/rabbitmq.action";
import { RabbitPubSubService } from "../../facade-pubsub/rabbit-pubsub.service";


export async function sendLog(payload: ActionPayloads['requestSendLog']): Promise<void> {
    try {
        // Definimos el exchange y routingKey para logs (usando las nuevas keys de Pub/Sub)
        const exchange = RabbitMQKeys.pubSubLogExchange();
        const routingKey = RabbitMQKeys.pubSubLogRoutingKey();

        // Publicamos el mensaje en el exchange
        await RabbitPubSubService.instance.publishToExchange<"requestSendLog">(
            exchange,
            routingKey,
            payload,
            {
                persistent: true, // Asegura que el mensaje sobreviva a reinicios del broker
            }
        );
        console.log("Mensaje de log publicado exitosamente en Pub/Sub.");
    } catch (error) {
        console.error("Error publicando log en Pub/Sub:", error);
        throw error;
    }
}
