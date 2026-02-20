import { connect, Channel, Connection } from "amqplib";
import { beforeAll, beforeEach, afterAll, describe, expect, it, jest } from "@jest/globals";
import prisma from "../../../src/lib/prisma";
import { RedisCacheService } from "../../../src/services/@redis/cache/redis.service";
import { RabbitMQKeys } from "../../../src/services/@rabbitmq/keys/rabbitmq.keys";
import {
    updateServiceInEventConsumer,
    updateServiceInEventDLQConsumer,
} from "../../../src/services/@rabbitmq/pubsub/consumer/updateServiceInEvent.consumer";
import { RabbitPubSubService } from "../../../src/services/@rabbitmq/pubsub/facade-pubsub/rabbit-pubsub.service";

jest.setTimeout(90_000);

const EXCHANGE = RabbitMQKeys.pubSubUpdateServiceInEventExchange();
const ROUTING_KEY = RabbitMQKeys.pubSubUpdateServiceInEventRoutingKey();
const QUEUE = RabbitMQKeys.pubSubUpdateServiceInEventQueue();
const DLQ = RabbitMQKeys.pubSubUpdateServiceInEventDLQ();
const RETRY_QUEUE = `${QUEUE}.retry`;

const EVENT_ID = "itest-event-update-service-1";
const GROUP_ID = "itest-group-update-service-1";
const SERVICE_ID = "itest-service-1";

let publisherConnection: Connection | null = null;
let publisherChannel: Channel | null = null;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(assertion: () => Promise<void>, timeoutMs = 20_000, intervalMs = 250): Promise<void> {
    const start = Date.now();
    let lastError: unknown;

    while (Date.now() - start < timeoutMs) {
        try {
            await assertion();
            return;
        } catch (error) {
            lastError = error;
            await sleep(intervalMs);
        }
    }

    throw lastError ?? new Error("Timeout waiting for asynchronous condition");
}

async function connectPublisherWithRetry(maxAttempts = 30): Promise<void> {
    const host = process.env.RABBITMQ_HOST || "localhost";
    const port = Number(process.env.RABBITMQ_PORT || 5672);
    const username = process.env.RABBITMQ_USER || "guest";
    const password = process.env.RABBITMQ_PASSWORD || "guest";
    const vhost = process.env.RABBITMQ_VHOST || "/";

    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            publisherConnection = await connect({ hostname: host, port, username, password, vhost });
            publisherChannel = await publisherConnection.createChannel();
            return;
        } catch (error) {
            lastError = error;
            await sleep(1_000);
        }
    }

    throw lastError ?? new Error("Unable to connect to RabbitMQ");
}

async function safePurgeQueue(queueName: string): Promise<void> {
    if (!publisherChannel) return;

    try {
        await publisherChannel.checkQueue(queueName);
        await publisherChannel.purgeQueue(queueName);
    } catch {
        // queue does not exist yet or is temporarily unavailable
    }
}

async function cleanupDatabaseRows() {
    await prisma.event.deleteMany({ where: { id: { startsWith: "itest-event-update-service-" } } });
    await prisma.groupEvents.deleteMany({ where: { id: { startsWith: "itest-group-update-service-" } } });
    await prisma.deadLetterMessage.deleteMany({
        where: {
            consumerName: "updateServiceInEventConsumer",
            queueName: DLQ,
        },
    });
}

describe("RabbitMQ integration: updateServiceInEvent consumer", () => {
    beforeAll(async () => {
        await waitFor(async () => {
            await prisma.$queryRaw`SELECT 1`;
        }, 30_000, 1_000);

        await connectPublisherWithRetry();

        await updateServiceInEventConsumer();
        await updateServiceInEventDLQConsumer();

        await waitFor(async () => {
            if (!publisherChannel) throw new Error("Publisher channel is not ready");
            await publisherChannel.checkQueue(QUEUE);
            await publisherChannel.checkQueue(DLQ);
            await publisherChannel.checkQueue(RETRY_QUEUE);
        }, 30_000, 500);
    });

    beforeEach(async () => {
        // await cleanupDatabaseRows();
        await safePurgeQueue(QUEUE);
        await safePurgeQueue(DLQ);
        await safePurgeQueue(RETRY_QUEUE);
        await RedisCacheService.instance.clear();
    });

    afterAll(async () => {
        // await cleanupDatabaseRows();

        try {
            await RedisCacheService.instance.clear();
        } catch {
            // ignore cleanup errors
        }

        const redisService = RedisCacheService.instance as any;
        try {
            await redisService.redisClient?.quit();
        } catch {
            // ignore close errors
        }
        try {
            await redisService.subscriberClient?.quit();
        } catch {
            // ignore close errors
        }

        if (publisherChannel) {
            await publisherChannel.close();
            publisherChannel = null;
        }
        if (publisherConnection) {
            await publisherConnection.close();
            publisherConnection = null;
        }

        const rabbitPubSub = RabbitPubSubService.instance as any;
        try {
            await rabbitPubSub.channel?.close();
        } catch {
            // ignore close errors
        }
        try {
            await rabbitPubSub.connection?.close();
        } catch {
            // ignore close errors
        }

        await prisma.$disconnect();
    });

    it("updates future events when a valid message arrives", async () => {
        const now = new Date();
        const endDate = new Date(now.getTime() + 60 * 60 * 1000);

        await prisma.groupEvents.create({
            data: {
                id: GROUP_ID,
                idCompanyFk: "itest-company",
                idWorkspaceFk: "itest-workspace",
                title: "Integration test group",
                startDate: now,
                endDate,
            },
        });

        await prisma.event.create({
            data: {
                id: EVENT_ID,
                idGroup: GROUP_ID,
                idCompanyFk: "itest-company",
                title: "Integration test event",
                startDate: now,
                endDate,
                idServiceFk: SERVICE_ID,
                serviceNameSnapshot: "Old name",
                servicePriceSnapshot: 10,
                serviceDiscountSnapshot: 0,
                serviceDurationSnapshot: 30,
            },
        });

        if (!publisherChannel) throw new Error("Publisher channel is not initialized");
        publisherChannel.publish(
            EXCHANGE,
            ROUTING_KEY,
            Buffer.from(
                JSON.stringify({
                    payload: {
                        id: SERVICE_ID,
                        name: "Service updated",
                        price: 55.5,
                        discount: 10,
                        duration: 75,
                        sendNotification: false,
                    },
                })
            ),
            { persistent: true }
        );

        await waitFor(async () => {
            const updated = await prisma.event.findUnique({
                where: { id: EVENT_ID },
                select: {
                    serviceNameSnapshot: true,
                    servicePriceSnapshot: true,
                    serviceDiscountSnapshot: true,
                    serviceDurationSnapshot: true,
                },
            });

            expect(updated).not.toBeNull();
            expect(updated?.serviceNameSnapshot).toBe("Service updated");
            expect(updated?.servicePriceSnapshot).toBe(55.5);
            expect(updated?.serviceDiscountSnapshot).toBe(10);
            expect(updated?.serviceDurationSnapshot).toBe(75);
        });
    });

    it("stores a dead letter row when payload is invalid", async () => {
        if (!publisherChannel) throw new Error("Publisher channel is not initialized");
        publisherChannel.publish(
            EXCHANGE,
            ROUTING_KEY,
            Buffer.from(
                JSON.stringify({
                    payload: {
                        name: "missing-id",
                        sendNotification: false,
                    },
                })
            ),
            { persistent: true }
        );

        await waitFor(async () => {
            const deadLetter = await prisma.deadLetterMessage.findFirst({
                where: {
                    queueName: DLQ,
                    consumerName: "updateServiceInEventConsumer",
                    status: "PENDING",
                },
                orderBy: { createdDate: "desc" },
            });

            expect(deadLetter).not.toBeNull();
            expect(deadLetter?.exchangeName).toBe(EXCHANGE);
            expect(deadLetter?.routingKey).toBe(ROUTING_KEY);
            expect(deadLetter?.retryCount).toBeGreaterThanOrEqual(0);

            const payload = deadLetter?.payload as any;
            expect(payload?.payload?.name).toBe("missing-id");
            expect(payload?.payload?.id).toBeUndefined();
        }, 30_000, 500);
    });
});
