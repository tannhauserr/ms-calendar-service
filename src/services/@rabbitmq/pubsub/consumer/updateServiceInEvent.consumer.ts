
import { Channel, ConsumeMessage } from "amqplib";
import { RecurrenceScope } from "../../../@database/recurrence-rule/types";
import { RabbitMQKeys } from "../../keys/rabbitmq.keys";
import { RabbitPubSubService } from "../facade-pubsub/rabbit-pubsub.service";
import prisma from "../../../../lib/prisma";



const PREFETCH = 5;
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 30_000;
const RETRY_TTL = RETRY_DELAY_MS;

const QUEUE = RabbitMQKeys.pubSubUpdateServiceInEventQueue();
const DLQ = RabbitMQKeys.pubSubUpdateServiceInEventDLQ();
const EXCHANGE = RabbitMQKeys.pubSubUpdateServiceInEventExchange();
const ROUTING_KEY = RabbitMQKeys.pubSubUpdateServiceInEventRoutingKey();

function getRetryCount(msg: ConsumeMessage): number {
    const deaths = (msg.properties.headers as any)?.["x-death"] as any[] | undefined;
    return Array.isArray(deaths) && deaths[0]?.count > 0 ? deaths[0].count : 0;
}

export async function updateServiceInEventConsumer(): Promise<void> {
    const rabbit = RabbitPubSubService.instance;
    const channel: Channel = await rabbit.connect();

    // Topología
    // 1) Declarar el exchange donde vamos a publicar mensajes y dead-lettering
    await rabbit.assertExchange(EXCHANGE, "direct", true);

    // 2) Configurar la cola muerta (DLQ)
    //    - Retiene mensajes hasta 24 h (`x-message-ttl`)
    //    - Máximo 1000 mensajes (`x-max-length`)
    //    - No le ponemos dead-letter aquí para no generar bucles en la propia DLQ
    await channel.assertQueue(DLQ, {
        durable: true,
        arguments: {
            "x-message-ttl": 24 * 60 * 60 * 1000,  // 24h en ms
            "x-max-length": 1000                   // límite de tamaño de la cola
        }
    });

    // 3) Configurar la cola principal (QUEUE)
    //    - Durable para persistir tras reinicios
    //    - Si un mensaje se rechaza sin requeue (`nack(false)`), 
    //      RabbitMQ lo enviará a EXCHANGE con routing key `${ROUTING_KEY}.dlq`
    //      y acabará en la DLQ configurada arriba
    await channel.assertQueue(QUEUE, {
        durable: true,
        deadLetterExchange: EXCHANGE,
        deadLetterRoutingKey: `${ROUTING_KEY}.dlq`,
    });


    await rabbit.bindQueueToExchange(QUEUE, EXCHANGE, ROUTING_KEY);
    await rabbit.bindQueueToExchange(DLQ, EXCHANGE, `${ROUTING_KEY}.dlq`);
    await channel.prefetch(PREFETCH);

    console.log("[Service-in-event] ⏳ Awaiting messages...");

    await rabbit.consumeQueue<"requestUpdateServiceInEvent">(
        QUEUE,
        async (content, rawMsg, ack, nack) => {
            // 1) Validación básica del mensaje
            const { payload } = content;

            const retries = getRetryCount(rawMsg);
            console.log(
                `[Service-in-event] → ${payload})`
            );

            // 2) Procesamiento y reintentos
            try {

                // 1) Creamos fecha “ahora” para filtrar sólo eventos no transcurridos
                const now = new Date();

                // 2) Actualizamos todos los eventos con idServiceFk = payload.id y endDate > now
                const { count } = await prisma.event.updateMany({
                    where: {
                        idServiceFk: payload.id,
                        endDate: { gt: now }
                    },
                    data: {
                        serviceNameSnapshot: payload.name ?? undefined,
                        servicePriceSnapshot: payload.price ?? undefined,
                        serviceDiscountSnapshot: payload.discount ?? undefined,
                        serviceDurationSnapshot: payload.duration ?? undefined, // duración en minutos
                        // opcional: llevar registro de cuántas veces hemos actualizado
                        numberUpdates: { increment: 1 }
                    }
                });


                console.log(`✅ [Service-in-event] Done`);
                return ack();
            } catch (err) {
                console.error(`❌ [Service-in-event] Error`, err);

                if (retries >= MAX_RETRIES) {
                    console.error(`💀 [Service-in-event] Max retries, sending to DLQ`);
                    return nack(false);
                }

                console.warn(`🔄 [Service-in-event] Scheduling retry #${retries + 1}`);

                try {
                    await rabbit.publishToExchange(
                        EXCHANGE,
                        `${ROUTING_KEY}.retry`,       // routing key para la cola de retries
                        { payload },                  // el mismo payload que queríamos procesar
                        {
                            persistent: true,         // aseguramos que sobreviva a reinicios del broker
                            expiration: RETRY_TTL.toString(),  // tiempo de vida en .retry (en ms), tras el cual el mensaje expira
                            headers: { "x-retry": retries + 1 } // contamos cuántas veces ya hemos reintentado
                        }
                    );
                } catch (pubErr) {
                    console.error(
                        "[Service-in-event] Failed to re-publish for retry, ack to avoid loop",
                        pubErr
                    );
                    // Si falla la publicación del retry, hacemos ack para eliminar el mensaje original
                    // así evitamos bucles infinitos de re-publicación
                    ack();
                }
            }
        }
    );
}

