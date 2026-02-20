import { Channel, ConsumeMessage } from "amqplib";
import prisma from "../../../../lib/prisma";
import { ActionKey } from "../../../../models/notification/util/action-to-senctions";
import { createNotification as createNotificationPlatform } from "../../../../models/notification/util/trigger/util/for-action-platform";
import { RedisStrategyFactory } from "../../../@redis/cache/strategies/redisStrategyFactory";
import { MessageReliabilityStrategy } from "../../../@redis/cache/strategies/messageReliability/message-reliability.strategy";
import { UpdateServiceInEvent } from "../../interfaces/updateServiceInEvent/update-service-in-event";
import { RabbitMQKeys } from "../../keys/rabbitmq.keys";
import { DeadLetterMessageService } from "../dead-letter/dead-letter-message.service";
import { RabbitPubSubService } from "../facade-pubsub/rabbit-pubsub.service";

const PREFETCH = 5;
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 30_000;
const DLQ_MESSAGE_TTL_MS = 24 * 60 * 60 * 1000;

const IDEMPOTENCY_SCOPE = "updateServiceInEvent";
const IDEMPOTENCY_LOCK_TTL_SECONDS = Number(process.env.RABBITMQ_IDEMPOTENCY_LOCK_TTL_SECONDS || 120);
const IDEMPOTENCY_PROCESSED_TTL_SECONDS = Number(
    process.env.RABBITMQ_IDEMPOTENCY_PROCESSED_TTL_SECONDS || 7 * 24 * 60 * 60
);

const QUEUE = RabbitMQKeys.pubSubUpdateServiceInEventQueue();
const DLQ = RabbitMQKeys.pubSubUpdateServiceInEventDLQ();
const EXCHANGE = RabbitMQKeys.pubSubUpdateServiceInEventExchange();
const ROUTING_KEY = RabbitMQKeys.pubSubUpdateServiceInEventRoutingKey();

const ROUTING_KEY_RETRY = `${ROUTING_KEY}.retry`;
const ROUTING_KEY_DLQ = `${ROUTING_KEY}.dlq`;
const RETRY_QUEUE = `${QUEUE}.retry`;

const messageReliability = RedisStrategyFactory.getStrategy("messageReliability") as MessageReliabilityStrategy;
const deadLetterMessageService = DeadLetterMessageService.instance;

function getRetryCount(msg: ConsumeMessage): number {
    const headers = (msg.properties.headers ?? {}) as Record<string, unknown>;

    const xr = Number(headers["x-retry"]);
    if (Number.isFinite(xr) && xr >= 0) return xr;

    const deaths = headers["x-death"] as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(deaths) || deaths.length === 0) return 0;

    const retryDeath =
        deaths.find((d) => typeof d?.queue === "string" && d.queue.includes(".retry")) ??
        deaths[0];

    const c = Number(retryDeath?.count);
    return Number.isFinite(c) && c > 0 ? c : 0;
}

function sanitizeHeaders(headers: unknown): Record<string, unknown> {
    const source = (headers ?? {}) as Record<string, unknown>;
    const out: Record<string, unknown> = { ...source };
    delete out["x-death"];
    delete out["x-first-death-exchange"];
    delete out["x-first-death-queue"];
    delete out["x-first-death-reason"];
    delete out["x-retry"];
    return out;
}

function extractDeadLetterReason(rawMsg: ConsumeMessage): string | null {
    const headers = (rawMsg.properties.headers ?? {}) as Record<string, unknown>;
    const firstReason = headers["x-first-death-reason"];
    if (typeof firstReason === "string" && firstReason.trim().length > 0) return firstReason;

    const deaths = headers["x-death"] as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(deaths) && deaths.length > 0) {
        const reason = deaths[0]?.reason;
        if (typeof reason === "string" && reason.trim().length > 0) return reason;
    }

    return null;
}

export async function updateServiceInEventConsumer(): Promise<void> {
    const rabbit = RabbitPubSubService.instance;
    const channel: Channel = await rabbit.connect();

    await rabbit.assertExchange(EXCHANGE, "direct", true);

    await channel.assertQueue(DLQ, {
        durable: true,
        arguments: {
            "x-message-ttl": DLQ_MESSAGE_TTL_MS,
            "x-max-length": 1000,
        },
    });
    await rabbit.bindQueueToExchange(DLQ, EXCHANGE, ROUTING_KEY_DLQ);

    await channel.assertQueue(RETRY_QUEUE, {
        durable: true,
        arguments: {
            "x-message-ttl": RETRY_DELAY_MS,
            "x-dead-letter-exchange": EXCHANGE,
            "x-dead-letter-routing-key": ROUTING_KEY,
            "x-max-length": 5000,
        },
    });
    await rabbit.bindQueueToExchange(RETRY_QUEUE, EXCHANGE, ROUTING_KEY_RETRY);

    await channel.assertQueue(QUEUE, {
        durable: true,
        arguments: {
            "x-dead-letter-exchange": EXCHANGE,
            "x-dead-letter-routing-key": ROUTING_KEY_DLQ,
        },
    });
    await rabbit.bindQueueToExchange(QUEUE, EXCHANGE, ROUTING_KEY);

    channel.prefetch(PREFETCH);
    console.log("[Service-in-event] ⏳ Awaiting messages...");

    await rabbit.consumeQueue<"requestUpdateServiceInEvent">(
        QUEUE,
        async (content, rawMsg, ack, nack) => {
            const retries = getRetryCount(rawMsg);
            const payload = (content as any)?.payload as UpdateServiceInEvent | undefined;

            if (!payload?.id) {
                console.error("[Service-in-event] Payload inválido (sin payload.id) → DLQ");
                return nack(false);
            }

            const messageDigest = messageReliability.buildMessageDigest(rawMsg.content.toString("utf8"));

            if (await messageReliability.isMessageProcessed(IDEMPOTENCY_SCOPE, messageDigest)) {
                console.warn(`[Service-in-event] duplicate already processed: ${payload.id}`);
                return ack();
            }

            const lockAcquired = await messageReliability.acquireMessageLock(
                IDEMPOTENCY_SCOPE,
                messageDigest,
                IDEMPOTENCY_LOCK_TTL_SECONDS
            );

            if (!lockAcquired) {
                console.warn(`[Service-in-event] duplicate in-flight ignored: ${payload.id}`);
                return ack();
            }

            try {
                const now = new Date();

                const [events] = await prisma.$transaction([
                    prisma.event.findMany({
                        where: {
                            idServiceFk: payload.id,
                            endDate: { gt: now },
                            deletedDate: null,
                        },
                        select: {
                            id: true,
                            idGroup: true,
                        },
                    }),
                    prisma.event.updateMany({
                        where: {
                            idServiceFk: payload.id,
                            endDate: { gt: now },
                            deletedDate: null,
                        },
                        data: {
                            serviceNameSnapshot: payload.name ?? undefined,
                            servicePriceSnapshot: payload.price ?? undefined,
                            serviceDiscountSnapshot: payload.discount ?? undefined,
                            serviceDurationSnapshot: payload.duration ?? undefined,
                        },
                    }),
                ]);

                console.log(`✅ [Service-in-event] Updated ${events.length} events`);

                if (payload.sendNotification && events.length > 0) {
                    const idGroupList = new Set(events.map((event) => event.idGroup));
                    const action: ActionKey = "update";

                    for (const idGroup of idGroupList) {
                        await createNotificationPlatform(idGroup, { actionSectionType: action });
                    }
                }

                await messageReliability.markMessageProcessed(
                    IDEMPOTENCY_SCOPE,
                    messageDigest,
                    IDEMPOTENCY_PROCESSED_TTL_SECONDS
                );

                return ack();
            } catch (error) {
                console.error("❌ [Service-in-event] Error", error);

                if (retries >= MAX_RETRIES) {
                    console.error("💀 [Service-in-event] Max retries → DLQ");
                    return nack(false);
                }

                console.warn(`🔄 [Service-in-event] Scheduling retry #${retries + 1} in ${RETRY_DELAY_MS}ms`);

                try {
                    const safeHeaders = sanitizeHeaders(rawMsg.properties.headers);
                    await rabbit.publishToExchange(
                        EXCHANGE,
                        ROUTING_KEY_RETRY,
                        { payload },
                        {
                            persistent: true,
                            headers: { ...safeHeaders, "x-retry": retries + 1 },
                        }
                    );

                    return ack();
                } catch (publishError) {
                    console.error("[Service-in-event] Failed to re-publish retry → DLQ", publishError);
                    return nack(false);
                }
            } finally {
                try {
                    await messageReliability.releaseMessageLock(IDEMPOTENCY_SCOPE, messageDigest);
                } catch (releaseError) {
                    console.error("[Service-in-event] Error releasing idempotency lock", releaseError);
                }
            }
        }
    );
}

export async function updateServiceInEventDLQConsumer(): Promise<void> {
    const rabbit = RabbitPubSubService.instance;
    const channel: Channel = await rabbit.connect();

    await channel.assertQueue(DLQ, {
        durable: true,
        arguments: {
            "x-message-ttl": DLQ_MESSAGE_TTL_MS,
            "x-max-length": 1000,
        },
    });

    channel.prefetch(Math.min(5, Number(process.env.RABBITMQ_PREFETCH_DLQ || 1)));

    await rabbit.consumeQueue<any>(
        DLQ,
        async (content, rawMsg, ack) => {
            try {
                await deadLetterMessageService.registerMessage({
                    queueName: DLQ,
                    exchangeName: EXCHANGE,
                    routingKey: ROUTING_KEY,
                    sourceRoutingKey: rawMsg.fields?.routingKey ?? ROUTING_KEY_DLQ,
                    consumerName: "updateServiceInEventConsumer",
                    payload: content,
                    headers: (rawMsg.properties.headers ?? {}) as Record<string, unknown>,
                    retryCount: getRetryCount(rawMsg),
                    errorMessage: extractDeadLetterReason(rawMsg),
                });
            } catch (persistError) {
                console.error("[Service-in-event][DLQ] Error persisting dead-letter message", persistError);
            }

            ack();
        }
    );
}
