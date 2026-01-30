// src/notifications/utils/publish-store.ts
import { randomUUID } from "crypto";
import { RabbitMQKeys } from "../../../keys/rabbitmq.keys";
import { RabbitPubSubService } from "../../facade-pubsub/rabbit-pubsub.service";

import {
    StoreNotificationCreatedV1,
    mapStatusToBus,
    StoreNotificationDeletedV1,
    StoreNotificationCreatedV1Schema,
    StoreNotificationDeletedV1Schema,
    StoreNotificationPurgeByBookingV1,
    StoreNotificationPurgeByBookingV1Schema
} from "../../../interfaces/notification/store-notification";
import { CONSOLE_COLOR } from "../../../../../constant/console-color";


/** Cache local para no repetir asserts */
const ensuredExchanges = new Set<string>();

// Ajusta si tu exchange es de otro tipo
const STORE_EXCHANGE_TYPE: "direct" = "direct";

async function ensureExchange(name: string): Promise<void> {
    if (ensuredExchanges.has(name)) return;
    const rabbit = RabbitPubSubService.instance;
    await rabbit.assertExchange(name, STORE_EXCHANGE_TYPE, true);
    ensuredExchanges.add(name);
}

/** Defaults + normalización de estado al set del BUS */
function withDefaultsForCreated(payload: StoreNotificationCreatedV1): StoreNotificationCreatedV1 {
    const normalizedStatus = mapStatusToBus((payload.notification as any).status);
    return {
        v: 1,
        ...payload,
        notification: {
            priority: 5,
            ...payload.notification,
            status: normalizedStatus ?? "pending",
        },
        trace: payload.trace ?? { correlationId: randomUUID(), producedAt: new Date().toISOString() },
    };
}

function withDefaultsForDeleted(payload: StoreNotificationDeletedV1): StoreNotificationDeletedV1 {
    return {
        v: 1,
        ...payload,
        trace: payload.trace ?? { correlationId: randomUUID(), producedAt: new Date().toISOString() },
    };
}

function withDefaultsForPurgeByBooking(
    payload: StoreNotificationPurgeByBookingV1
): StoreNotificationPurgeByBookingV1 {
    return {
        v: 1,
        ...payload,
        trace: payload.trace ?? {
            correlationId: randomUUID(),
            producedAt: new Date().toISOString(),
        },
    };
}

async function publishSafe(exchange: string, routingKey: string, msg: any) {
    const rabbit = RabbitPubSubService.instance;

    // 1) Garantiza el exchange (idempotente)
    await ensureExchange(exchange);

    try {
        await rabbit.publishToExchange(exchange, routingKey, msg, {
            persistent: true,
            mandatory: true, // si no hay colas enlazadas, el broker hace basic.return (no se pierde)
        });
    } catch (e: any) {
        const msgErr = String(e?.message || e);
        // 2) Si fue carrera (exchange aún no existía), re-assert y reintenta una vez
        if (msgErr.includes("NOT_FOUND") && msgErr.includes("no exchange")) {
            console.warn(`[publishSafe] Exchange ${exchange} no existía. Re-assert y reintento…`);
            ensuredExchanges.delete(exchange);
            await ensureExchange(exchange);
            await rabbit.publishToExchange(exchange, routingKey, msg, {
                persistent: true,
                mandatory: true,
            });
        } else {
            console.error("[publishSafe] Error publicando:", e);
            throw e;
        }
    }
}

/**
 * Publica un evento de creación de notificación en el exchange correspondiente.
 * @param payload 
 */
export async function publishStoreNotificationCreated(payload: StoreNotificationCreatedV1): Promise<void> {
    const exchange = RabbitMQKeys.pubSubNotificationStoreExchange(); // "pubsub_notification_store_exchange"
    const rk = RabbitMQKeys.pubSubStoreNotificationCreatedRk();      // "store.notification.created"

    // console.log("[Debug] publishStoreNotificationCreated, exchange, rk:", { exchange, rk, payload });
    const finalized = withDefaultsForCreated(payload);
    // console.log("[Debug] publishStoreNotificationCreated, finalized:", finalized);

    // Validación runtime (útil en dev)
    const parsed = StoreNotificationCreatedV1Schema.safeParse(finalized);

    // console.log("[Debug] publishStoreNotificationCreated, parsed:", parsed);
    if (!parsed.success) {
        console.log(`${CONSOLE_COLOR.BgRed}[publishStoreNotificationCreated] ${JSON.stringify(finalized)}${CONSOLE_COLOR.Reset}`);
        console.error("[publishStoreNotificationCreated] invalid payload", parsed.error.flatten());
        throw new Error("Invalid StoreNotificationCreatedV1 payload");
    }

    await publishSafe(exchange, rk, finalized);
}

/**
 * Publica un evento de eliminación de notificación en el exchange correspondiente.
 * @param payload 
 */
export async function publishStoreNotificationDeleted(payload: StoreNotificationDeletedV1): Promise<void> {
    const exchange = RabbitMQKeys.pubSubNotificationStoreExchange();
    const rk = RabbitMQKeys.pubSubStoreNotificationDeletedRk();      // "store.notification.deleted"

    const finalized = withDefaultsForDeleted(payload);

    const parsed = StoreNotificationDeletedV1Schema.safeParse(finalized);
    if (!parsed.success) {
        console.error("[publishStoreNotificationDeleted] invalid payload", parsed.error.flatten());
        throw new Error("Invalid StoreNotificationDeletedV1 payload");
    }

    await publishSafe(exchange, rk, finalized);
}


/**
 * Publica un evento para PURGAR (hard delete) todas las notificaciones de una reserva (bookingId/idGroup).
 * @param payload
 */
export async function publishStoreNotificationPurgeByBooking(
    payload: StoreNotificationPurgeByBookingV1
): Promise<void> {
    const exchange = RabbitMQKeys.pubSubNotificationStoreExchange();
    const rk = RabbitMQKeys.pubSubStoreNotificationPurgeByBookingRk(); // "store.notification.purgeByBooking"

    const finalized = withDefaultsForPurgeByBooking(payload);

    const parsed = StoreNotificationPurgeByBookingV1Schema.safeParse(finalized);
    if (!parsed.success) {
        console.error(
            "[publishStoreNotificationPurgeByBooking] invalid payload",
            parsed.error.flatten()
        );
        throw new Error("Invalid StoreNotificationPurgeByBookingV1 payload");
    }

    await publishSafe(exchange, rk, finalized);
}