import { ActionPayloads } from "../../../actions/rabbitmq.action";
import { RabbitMQKeys } from "../../../keys/rabbitmq.keys";
import { RabbitPubSubService } from "../../facade-pubsub/rabbit-pubsub.service";

/**
 * Publica un mensaje para que el consumer `updateServiceInEventConsumer`
 * reciba el payload { id, name?, duration?, price?, discount? } y actualice
 * los eventos futuros que usen ese servicio.
 */
export async function sendUpdateServiceInEvent(
    payload: ActionPayloads["requestUpdateServiceInEvent"]["payload"]
): Promise<void> {
    try {
        const exchange = RabbitMQKeys.pubSubUpdateServiceInEventExchange();
        const routingKey = RabbitMQKeys.pubSubUpdateServiceInEventRoutingKey();

        await RabbitPubSubService.instance.publishToExchange<"requestUpdateServiceInEvent">(
            exchange,
            routingKey,
            { payload },
            {
                persistent: true,   // para que sobreviva a reinicios
            }
        );

        console.log(
            `[Publisher] requestUpdateServiceInEvent enviado a ${exchange} / ${routingKey}`,
            payload
        );
    } catch (err) {
        console.error("[Publisher] Error enviando requestUpdateServiceInEvent", err);
        throw err;
    }
}
