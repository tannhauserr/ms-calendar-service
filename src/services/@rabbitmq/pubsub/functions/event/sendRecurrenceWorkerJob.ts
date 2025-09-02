// src/publishers/recurrence-worker.publisher.ts

import { EventForBackend } from "../../../../@database/event/dto/EventForBackend";
import { RabbitMQKeys } from "../../../keys/rabbitmq.keys";
import { RabbitPubSubService } from "../../facade-pubsub/rabbit-pubsub.service";


type RecurrenceOpType = "CREATE_SERIES" | "SPLIT_THIS" | "SPLIT_FUTURE" | "SPLIT_ALL";

export async function sendRecurrenceWorkerJob(
    type: RecurrenceOpType,
    payload: EventForBackend,
    amount: number, // Cantidad de eventos a procesar, usado para SPLIT_FUTURE/SPLIT_ALL
    idRecurrence?: string // opcional para SPLIT_FUTURE/SPLIT_ALL
): Promise<void> {
    try {
        const exchange = RabbitMQKeys.pubSubCalendarRecurrenceExchange();    // "calendar_recurrence_exchange"
        const routingKey = RabbitMQKeys.pubSubCalendarRecurrenceRoutingKey(); // "recurrence.op"

        await RabbitPubSubService.instance.publishToExchange<"requestRecurrenceJob">(
            exchange,
            routingKey,
            { type, payload, amount, idRecurrence },
            {
                persistent: true, // Asegura que el mensaje sobreviva a reinicios del broker
            }
        );

        console.log(`[Publisher] Recurrence job sent: ${type} → ${payload.event.id}`);
    } catch (err) {
        console.error(`[Publisher] Error sending recurrence job:`, err);
        throw err;
    }
}
