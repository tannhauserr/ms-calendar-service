// publishers/notification-publisher.ts

import { ActionPayloads } from "../../actions/rabbitmq.action";
import { RabbitMQKeys } from "../../keys/rabbitmq.keys";
import { RabbitMQService } from "../../rabbitmq.service";
import { Channel } from "amqplib";


/**
 * Publica un mensaje de notificación (create, update o delete) en RabbitMQ.
 * @param payload Objeto que cumple con el tipo ActionPayloads["requestNotification"] 
 *                (incluye operation y los datos necesarios).
 */
export async function publishNotificationMessage(
    payload: ActionPayloads["requestNotification"]
): Promise<void> {
    try {
        // 1. Conectarse a RabbitMQ y obtener el canal
        const channel: Channel = await RabbitMQService.instance.connect();

        // 2. Asegurar que el exchange exista (tipo "direct")
        const exchange = RabbitMQKeys.pubSubNotificationExchange();
        await channel.assertExchange(exchange, "direct", { durable: true });

        // 3. Definir la routing key y publicar el mensaje
        const routingKey = RabbitMQKeys.pubSubNotificationRoutingKey();
        const content = Buffer.from(JSON.stringify(payload));
        channel.publish(exchange, routingKey, content, { persistent: true });

        console.log(
            `Mensaje de notificación publicado en el exchange "${exchange}" con routingKey "${routingKey}":`,
            payload
        );
    } catch (error) {
        console.error("Error publicando mensaje de notificación:", error);
        throw error;
    }
}
