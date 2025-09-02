import { ActionPayloads } from "../../../actions/rabbitmq.action";
import { RabbitMQKeys } from "../../../keys/rabbitmq.keys";
import { RabbitMQService } from "../../../rabbitmq.service";
import { Channel } from "amqplib";

// Definimos un tipo para restringir el routingKey a uno de los tres valores permitidos
// Centralizamos los routing keys en un objeto inmutable
export const deleteRecordsRoutingKeys = {
    clients: RabbitMQKeys.pubSubDeleteClientsRoutingKey(),
    calendar: RabbitMQKeys.pubSubDeleteCalendarRoutingKey(),
    notification: RabbitMQKeys.pubSubDeleteNotificationRoutingKey(),
} as const;

// El tipo se genera a partir de los valores del objeto anterior
export type DeleteRecordsRoutingKey = typeof deleteRecordsRoutingKeys[keyof typeof deleteRecordsRoutingKeys];

/**
 * Publica un mensaje para eliminar registros de una tabla, 
 * permitiendo solo uno de los tres routing keys específicos.
 * 
 * Se restringe el parámetro 'routingKey' a DeleteRecordsRoutingKey para:
 * - Asegurar que solo se usen los valores esperados (clientes, calendar, notification)
 * - Evitar errores en tiempo de ejecución por valores no válidos
 * - Mantener la consistencia con la configuración de RabbitMQ definida en las keys
 */
export async function publishDeleteRecordsMessage(
    payload: ActionPayloads["requestDeleteRecords"],
    routingKey: DeleteRecordsRoutingKey
): Promise<void> {
    try {
        const channel: Channel = await RabbitMQService.instance.connect();
        const exchange = RabbitMQKeys.pubSubDeleteExchange();
        await channel.assertExchange(exchange, "direct", { durable: true });

        const content = Buffer.from(JSON.stringify(payload));
        channel.publish(exchange, routingKey, content, { persistent: true });

        console.log(
            `Mensaje de eliminación publicado en exchange "${exchange}" con routingKey "${routingKey}":`,
            payload
        );
    } catch (error) {
        console.error("Error publicando mensaje de eliminación:", error);
        throw error;
    }
}


