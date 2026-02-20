// consumers/delete-records-consumer.calendar.ts
import { Channel, ConsumeMessage } from "amqplib";
import { RabbitPubSubService } from "../../facade-pubsub/rabbit-pubsub.service";
import prisma from "../../../../../lib/prisma";
import { RabbitMQKeys } from "../../../keys/rabbitmq.keys";
import { RequestDeleteRecords } from "./interfaces";
import { RedisStrategyFactory } from "../../../../@redis/cache/strategies/redisStrategyFactory";
import { MessageReliabilityStrategy } from "../../../../@redis/cache/strategies/messageReliability/message-reliability.strategy";
import { DeadLetterMessageService } from "../../dead-letter/dead-letter-message.service";

export const deleteSOFTRecordsConsumers = {
    deleteSOFTRecordsConsumer,
    deleteSOFTRecordsDLQConsumer,
};

/* -------------------- Helpers -------------------- */
const CHUNK = Math.min(500, Number(process.env.DELETE_CHUNK_SIZE) || 300);
function chunkArray<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}
function validateIdsAreStrings(ids: unknown): ids is string[] {
    if (!Array.isArray(ids) || ids.length === 0) return false;
    for (const v of ids) if (typeof v !== "string" || v.trim().length === 0) return false;
    return true;
}


function getRetryCount(msg: ConsumeMessage): number {
    const headers = (msg.properties.headers ?? {}) as any;

    const xr = Number(headers["x-retry"]);
    if (Number.isFinite(xr) && xr >= 0) return xr;

    const deaths = headers["x-death"] as any[] | undefined;
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

/* -------------------- Config -------------------- */
const PREFETCH = Math.min(3, Number(process.env.RABBITMQ_PREFETCH_DELETE_RECORDS) || 1);
const MAX_RETRIES = Number(process.env.DELETE_MAX_RETRIES) || 3;
const RETRY_DELAY_MS = Number(process.env.DELETE_RETRY_DELAY_MS) || 30_000;
const MAX_IDS_PER_MSG = Number(process.env.DELETE_MAX_IDS_PER_MSG) || 1000;

// ⏳ TTLs añadidos
const MAIN_MESSAGE_TTL_MS = Number(process.env.DELETE_MAIN_MESSAGE_TTL_MS || 86_400_000 * 3); // 3d
const DLQ_MESSAGE_TTL_MS = Number(process.env.DELETE_DLQ_MESSAGE_TTL_MS || 604_800_000);      // 7d

// Topología
const EXCHANGE = RabbitMQKeys.pubSubDeleteExchange();
const QUEUE = RabbitMQKeys.pubSubDeleteCalendarQueue();
const ROUTING_KEY = RabbitMQKeys.pubSubDeleteCalendarRoutingKey();

// DLX/DLQ
const DLX = RabbitMQKeys.deadLetterExchange();
const DLQ = RabbitMQKeys.pubSubDeleteCalendarDLQ();

// Cola de reintentos con TTL (DL de vuelta a la principal)
const RETRY_QUEUE = `${QUEUE}.retry`;
const ROUTING_KEY_RETRY = `${ROUTING_KEY}.retry`;
const ROUTING_KEY_DLQ = DLQ;

const IDEMPOTENCY_SCOPE = "deleteSOFTRecords";
const IDEMPOTENCY_LOCK_TTL_SECONDS = Number(process.env.RABBITMQ_IDEMPOTENCY_LOCK_TTL_SECONDS || 120);
const IDEMPOTENCY_PROCESSED_TTL_SECONDS = Number(
    process.env.RABBITMQ_IDEMPOTENCY_PROCESSED_TTL_SECONDS || 7 * 24 * 60 * 60
);

const messageReliability = RedisStrategyFactory.getStrategy("messageReliability") as MessageReliabilityStrategy;
const deadLetterMessageService = DeadLetterMessageService.instance;

/* -------------------- Consumer principal -------------------- */
async function deleteSOFTRecordsConsumer(): Promise<void> {
    const rabbit = RabbitPubSubService.instance;
    const channel: Channel = await rabbit.connect();

    // Exchanges / colas
    await rabbit.assertExchange(EXCHANGE, "direct", true);

    await rabbit.assertExchange(DLX, "direct", true);
    await channel.assertQueue(DLQ, {
        durable: true,
        arguments: {
            "x-message-ttl": DLQ_MESSAGE_TTL_MS,
            "x-max-length": 2000,
        },
    });
    await rabbit.bindQueueToExchange(DLQ, DLX, DLQ);

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
            "x-message-ttl": MAIN_MESSAGE_TTL_MS,
            "x-dead-letter-exchange": DLX,
            "x-dead-letter-routing-key": DLQ,
        },
    });
    await rabbit.bindQueueToExchange(QUEUE, EXCHANGE, ROUTING_KEY);

    channel.prefetch(PREFETCH);
    console.log(`[Calendar-MS][Delete] ⏳ Awaiting messages on ${QUEUE}...`);

    await rabbit.consumeQueue<"requestDeleteRecords">(
        QUEUE,
        async (content: unknown, raw, ack, nack) => {
            const { table, ids, idRelation } = (content || {}) as Partial<RequestDeleteRecords>;

            // ✅ Validación mínima
            const allowedTables = new Set([
                "companies",
                "workspaces",
                "userWorkspaces-byWorkspace",
                "userWorkspaces-byWorkspace-hard",
                "userWorkspaces-byUser",
                "clientWorkspaces",
                "clients",
                "users",
                // Caso especial para Eventos
                "usersEventDeleteDefinitive",
            ]);
            if (!allowedTables.has(table) || !validateIdsAreStrings(ids)) {
                console.error(`[Calendar-MS][Delete] Payload inválido table=${table} → DLQ`);
                return nack(false);
            }

            const messageDigest = messageReliability.buildMessageDigest(raw.content.toString("utf8"));

            if (await messageReliability.isMessageProcessed(IDEMPOTENCY_SCOPE, messageDigest)) {
                console.warn(`[Calendar-MS][Delete] duplicate already processed: table=${table}`);
                return ack();
            }

            const lockAcquired = await messageReliability.acquireMessageLock(
                IDEMPOTENCY_SCOPE,
                messageDigest,
                IDEMPOTENCY_LOCK_TTL_SECONDS
            );

            if (!lockAcquired) {
                console.warn(`[Calendar-MS][Delete] duplicate in-flight ignored: table=${table}`);
                return ack();
            }

            const retries = getRetryCount(raw);
            console.log(`[Calendar-MS][Delete] → ${table} (${ids.length} ids) retry#${retries}`);

            try {
                // 🔪 Guard: split de mensajes gigantes para paralelismo real
                if (ids.length > MAX_IDS_PER_MSG) {
                    const msgChunks = chunkArray(ids, MAX_IDS_PER_MSG);
                    console.warn(
                        `[Calendar-MS][Delete] Oversized message: ${ids.length} ids → republishing ${msgChunks.length} msgs`
                    );
                    for (const chunk of msgChunks) {
                        await rabbit.publishToExchange(
                            EXCHANGE,
                            ROUTING_KEY,
                            { table, ids: chunk, idRelation },
                            { persistent: true, headers: { "x-retry": retries } }
                        );
                    }

                    await messageReliability.markMessageProcessed(
                        IDEMPOTENCY_SCOPE,
                        messageDigest,
                        IDEMPOTENCY_PROCESSED_TTL_SECONDS
                    );
                    return ack();
                }

                const now = new Date();

                /* ---- SOFT DELETE por tabla (en chunks/tx) ---- */
                if (table === "companies") {
                    const batches = chunkArray(ids, CHUNK);
                    for (const batch of batches) {
                        await prisma.$transaction(async (tx) => {
                            await tx.businessHour.updateMany({
                                where: { idCompanyFk: { in: batch }, deletedDate: null },
                                data: { deletedDate: now },
                            });
                            await tx.workerBusinessHour.updateMany({
                                where: { idCompanyFk: { in: batch }, deletedDate: null },
                                data: { deletedDate: now },
                            });
                            await tx.temporaryBusinessHour.updateMany({
                                where: { idCompanyFk: { in: batch }, deletedDate: null },
                                data: { deletedDate: now },
                            });
                            await tx.workerAbsence.updateMany({
                                where: { idCompanyFk: { in: batch }, deletedDate: null },
                                data: { deletedDate: now },
                            });

                            // New schema: Company/workspace live on GroupEvents, not on Event.
                            // Soft-delete bookings (groups) + their events + participants.
                            await tx.groupEvents.updateMany({
                                where: { idCompanyFk: { in: batch }, deletedDate: null },
                                data: { deletedDate: now },
                            });

                            await tx.event.updateMany({
                                where: {
                                    deletedDate: null,
                                    groupEvents: {
                                        is: { idCompanyFk: { in: batch }, deletedDate: null },
                                    },
                                },
                                data: { deletedDate: now },
                            });

                            await tx.eventParticipant.updateMany({
                                where: {
                                    deletedDate: null,
                                    groupEvents: {
                                        is: { idCompanyFk: { in: batch }, deletedDate: null },
                                    },
                                },
                                data: { deletedDate: now },
                            });

                            // Comentado: lógica antigua con calendars/servicios
                            // (se deja igual que estaba, por si la reactivas en el futuro)
                        });
                    }
                } else if (table === "workspaces") {
                    const batches = chunkArray(ids, CHUNK);
                    for (const batch of batches) {
                        await prisma.$transaction(async (tx) => {
                            await tx.businessHour.updateMany({
                                where: { idWorkspaceFk: { in: batch }, deletedDate: null },
                                data: { deletedDate: now },
                            });
                            await tx.workerAbsence.updateMany({
                                where: { idWorkspaceFk: { in: batch }, deletedDate: null },
                                data: { deletedDate: now },
                            });
                            await tx.workerBusinessHour.updateMany({
                                where: { idWorkspaceFk: { in: batch }, deletedDate: null },
                                data: { deletedDate: now },
                            });
                            await tx.temporaryBusinessHour.updateMany({
                                where: { idWorkspaceFk: { in: batch }, deletedDate: null },
                                data: { deletedDate: now },
                            });

                            // New schema: workspace lives on GroupEvents.
                            await tx.groupEvents.updateMany({
                                where: { idWorkspaceFk: { in: batch }, deletedDate: null },
                                data: { deletedDate: now },
                            });

                            await tx.event.updateMany({
                                where: {
                                    deletedDate: null,
                                    groupEvents: {
                                        is: { idWorkspaceFk: { in: batch }, deletedDate: null },
                                    },
                                },
                                data: { deletedDate: now },
                            });

                            await tx.eventParticipant.updateMany({
                                where: {
                                    deletedDate: null,
                                    groupEvents: {
                                        is: { idWorkspaceFk: { in: batch }, deletedDate: null },
                                    },
                                },
                                data: { deletedDate: now },
                            });
                        });
                    }
                } else if (table === "clientWorkspaces") {
                    const batches = chunkArray(ids, CHUNK);
                    for (const batch of batches) {
                        await prisma.$transaction(async (tx) => {
                            // 1) Eventos afectados = los eventos donde estos clientes eran participantes (y el evento aún no terminó)
                            const affected = await tx.eventParticipant.findMany({
                                where: {
                                    idClientWorkspaceFk: { in: batch },
                                    deletedDate: null,
                                    groupEvents: {
                                        is: {
                                            deletedDate: null,
                                            // Mejor que startDate>=now: evita borrar eventos “en curso”
                                            endDate: { gt: now },
                                        },
                                    },
                                },
                                select: { idGroup: true },
                            });

                            const affectedEventIds = [...new Set(affected.map(a => a.idGroup))];
                            if (affectedEventIds.length === 0) return;

                            // 2) Soft-delete de esas participaciones (solo para eventos futuros/no terminados)
                            await tx.eventParticipant.updateMany({
                                where: {
                                    idClientWorkspaceFk: { in: batch },
                                    deletedDate: null,
                                    groupEvents: {
                                        is: {
                                            deletedDate: null,
                                            // Mejor que startDate>=now: evita borrar eventos “en curso”
                                            endDate: { gt: now },
                                        },
                                    },
                                },
                                data: { deletedDate: now },
                            });

                            // 3) Soft-delete SOLO de bookings afectados que se quedaron sin participantes activos
                            // (Participantes ahora están en GroupEvents)
                            const emptyGroups = await tx.groupEvents.findMany({
                                where: {
                                    id: { in: affectedEventIds },
                                    deletedDate: null,
                                    endDate: { gt: now },
                                    eventParticipant: { none: { deletedDate: null } },
                                },
                                select: { id: true },
                            });

                            const groupsToDelete = emptyGroups.map((g) => g.id);
                            if (groupsToDelete.length === 0) return;

                            await tx.groupEvents.updateMany({
                                where: { id: { in: groupsToDelete }, deletedDate: null },
                                data: { deletedDate: now },
                            });

                            const r = await tx.event.updateMany({
                                where: { idGroup: { in: groupsToDelete }, deletedDate: null },
                                data: { deletedDate: now },
                            });

                            if (r.count > 0) {
                                console.log(`[Calendar-MS][Delete] Soft-deleted ${r.count} eventos (booking quedó sin participantes)`);
                            }
                        });
                    }
                } else if (table === "clients") {
                    const batches = chunkArray(ids, CHUNK);

                    for (const batch of batches) {
                        await prisma.$transaction(async (tx) => {
                            // 1) Eventos afectados = los eventos donde estos clientes eran participantes (y el evento aún no terminó)
                            const affected = await tx.eventParticipant.findMany({
                                where: {
                                    idClientFk: { in: batch },
                                    deletedDate: null,
                                    // event: {
                                    //     is: {
                                    //         deletedDate: null,
                                    //         // Mejor que startDate>=now: evita borrar eventos “en curso”
                                    //         endDate: { gt: now },
                                    //     },
                                    // },
                                    groupEvents: {
                                        is: {
                                            deletedDate: null,
                                            endDate: { gt: now },
                                        },
                                    }
                                },
                                select: { idGroup: true },
                            });

                            const affectedEventIds = [...new Set(affected.map(a => a.idGroup))];
                            if (affectedEventIds.length === 0) return;

                            // 2) Soft-delete de esas participaciones (solo para eventos futuros/no terminados)
                            await tx.eventParticipant.updateMany({
                                where: {
                                    idClientFk: { in: batch },
                                    deletedDate: null,
                                    // event: {
                                    //     is: {
                                    //         deletedDate: null,
                                    //         endDate: { gt: now },
                                    //     },
                                    // },
                                    groupEvents: {
                                        is: {
                                            deletedDate: null,
                                            endDate: { gt: now },
                                        }
                                    }
                                },
                                data: { deletedDate: now },
                            });

                            // 3) Soft-delete SOLO de bookings afectados que se quedaron sin participantes activos
                            const emptyGroups = await tx.groupEvents.findMany({
                                where: {
                                    id: { in: affectedEventIds },
                                    deletedDate: null,
                                    endDate: { gt: now },
                                    eventParticipant: { none: { deletedDate: null } },
                                },
                                select: { id: true },
                            });

                            const groupsToDelete = emptyGroups.map((g) => g.id);
                            if (groupsToDelete.length === 0) return;

                            await tx.groupEvents.updateMany({
                                where: { id: { in: groupsToDelete }, deletedDate: null },
                                data: { deletedDate: now },
                            });

                            const r = await tx.event.updateMany({
                                where: { idGroup: { in: groupsToDelete }, deletedDate: null },
                                data: { deletedDate: now },
                            });

                            if (r.count > 0) {
                                console.log(`[Calendar-MS][Delete] Soft-deleted ${r.count} eventos (booking quedó sin participantes)`);
                            }
                        });
                    }
                } else if (table === "users") {
                    const batches = chunkArray(ids, CHUNK);
                    for (const batch of batches) {
                        await prisma.$transaction(async (tx) => {
                            // Por ahora solo eventos que no sean APPOINTMENT serán borrados
                            await tx.event.deleteMany({
                                where: {
                                    idUserPlatformFk: { in: batch },
                                    eventPurposeType: { not: "APPOINTMENT" },
                                    deletedDate: null,
                                },
                            });
                            // Los eventos se mantienen pero se desvincula el usuario
                            await tx.event.updateMany({
                                where: { idUserPlatformFk: { in: batch } },
                                data: { idUserPlatformFk: null },
                            });

                            await tx.workerBusinessHour.updateMany({
                                where: { idUserFk: { in: batch }, deletedDate: null },
                                data: { deletedDate: now },
                            });
                            await tx.temporaryBusinessHour.updateMany({
                                where: { idUserFk: { in: batch }, deletedDate: null },
                                data: { deletedDate: now },
                            });
                            await tx.workerAbsence.updateMany({
                                where: { idUserFk: { in: batch }, deletedDate: null },
                                data: { deletedDate: now },
                            });
                        });
                    }
                    // } else if (table === "usersEventDeleteDefinitive") {
                    //     // Ojo: ahora también soft delete. Si quieres que sea hard, vuelve a deleteMany aquí.
                    //     const batches = chunkArray(ids, CHUNK);
                    //     for (const batch of batches) {
                    //         await prisma.$transaction(async (tx) => {
                    //             await tx.event.updateMany({
                    //                 where: { idUserPlatformFk: { in: batch }, deletedDate: null },
                    //                 data: { deletedDate: now },
                    //             });

                    //             await tx.workerBusinessHour.updateMany({
                    //                 where: { idUserFk: { in: batch }, deletedDate: null },
                    //                 data: { deletedDate: now },
                    //             });
                    //             await tx.temporaryBusinessHour.updateMany({
                    //                 where: { idUserFk: { in: batch }, deletedDate: null },
                    //                 data: { deletedDate: now },
                    //             });
                    //             await tx.workerAbsence.updateMany({
                    //                 where: { idUserFk: { in: batch }, deletedDate: null },
                    //                 data: { deletedDate: now },
                    //             });
                    //         });
                    //     }
                    // } else {

                } else if (table === "userWorkspaces-byWorkspace") {
                    // SOFT: desvincular usuario de eventos futuros (no eliminarlos)
                    // idRelation = userId
                    // ids = workspaces
                    const batches = chunkArray(ids, CHUNK);
                    for (const batch of batches) {
                        await prisma.$transaction(async (tx) => {
                            await tx.event.updateMany({
                                where: {
                                    idUserPlatformFk: idRelation,
                                    deletedDate: null,
                                    groupEvents: {
                                        is: {
                                            idWorkspaceFk: { in: batch },
                                            deletedDate: null,
                                            // Solo eventos que aún no han terminado
                                            endDate: { gt: now },
                                        },
                                    },
                                },
                                data: { idUserPlatformFk: null },
                            });

                            await tx.workerBusinessHour.deleteMany({
                                where: {
                                    idUserFk: idRelation,
                                    idWorkspaceFk: { in: batch },
                                },
                            });
                            await tx.temporaryBusinessHour.deleteMany({
                                where: {
                                    idUserFk: idRelation,
                                    idWorkspaceFk: { in: batch },
                                },
                            });
                            await tx.workerAbsence.deleteMany({
                                where: {
                                    idUserFk: idRelation,
                                    idWorkspaceFk: { in: batch },
                                },
                            });
                        });
                    }

                } else if (table === "userWorkspaces-byWorkspace-hard") {
                    // HARD: eliminar eventos futuros del usuario (los pasados se conservan)
                    // idRelation = userId
                    // ids = workspaces
                    const batches = chunkArray(ids, CHUNK);
                    for (const batch of batches) {
                        await prisma.$transaction(async (tx) => {
                            await tx.event.deleteMany({
                                where: {
                                    idUserPlatformFk: idRelation,
                                    deletedDate: null,
                                    groupEvents: {
                                        is: {
                                            idWorkspaceFk: { in: batch },
                                            deletedDate: null,
                                            endDate: { gt: now },
                                        },
                                    },
                                },
                            });

                            await tx.workerBusinessHour.deleteMany({
                                where: {
                                    idUserFk: idRelation,
                                    idWorkspaceFk: { in: batch },
                                },
                            });
                            await tx.temporaryBusinessHour.deleteMany({
                                where: {
                                    idUserFk: idRelation,
                                    idWorkspaceFk: { in: batch },
                                },
                            });
                            await tx.workerAbsence.deleteMany({
                                where: {
                                    idUserFk: idRelation,
                                    idWorkspaceFk: { in: batch },
                                },
                            });
                        });
                    }

                } else if (table === "userWorkspaces-byUser") {
                    // TODO: Hay que pensar que hacer con los eventos de este usuario
                    // HARD DELETE:
                    // idRelation = workspaceId
                    // ids = users
                    const batches = chunkArray(ids, CHUNK);
                    for (const batch of batches) {

                        await prisma.$transaction(async (tx) => {
                            // Por ahora solo eventos que no sean APPOINTMENT serán borrados

                            await tx.event.deleteMany({
                                where: {
                                    idUserPlatformFk: { in: batch },
                                    groupEvents: { is: { idWorkspaceFk: idRelation, deletedDate: null } },
                                    eventPurposeType: { not: "APPOINTMENT" },
                                    deletedDate: null,
                                },
                            });

                            await tx.workerBusinessHour.deleteMany({
                                where: {
                                    idUserFk: { in: batch },
                                    idWorkspaceFk: idRelation,
                                },
                            });
                            await tx.temporaryBusinessHour.deleteMany({
                                where: {
                                    idUserFk: { in: batch },
                                    idWorkspaceFk: idRelation,
                                },
                            });
                            await tx.workerAbsence.deleteMany({
                                where: {
                                    idUserFk: { in: batch },
                                    idWorkspaceFk: idRelation,
                                },
                            });
                        });
                    }
                } else if (table === "usersEventDeleteDefinitive") {
                    const batches = chunkArray(ids, CHUNK);
                    for (const batch of batches) {
                        await prisma.$transaction(async (tx) => {
                            await tx.event.deleteMany({
                                where: { idUserPlatformFk: { in: batch } },
                            });
                            await tx.workerBusinessHour.deleteMany({ where: { idUserFk: { in: batch } } });
                            await tx.temporaryBusinessHour.deleteMany({ where: { idUserFk: { in: batch } } });
                            await tx.workerAbsence.deleteMany({ where: { idUserFk: { in: batch } } });
                        });
                    }
                } else {
                    console.log(`[Calendar-MS][Delete] Tabla ${table} no procesada (ignorada).`);
                }

                await messageReliability.markMessageProcessed(
                    IDEMPOTENCY_SCOPE,
                    messageDigest,
                    IDEMPOTENCY_PROCESSED_TTL_SECONDS
                );

                ack();
            } catch (err) {
                console.error("[Calendar-MS][Delete] Error procesando:", err);

                if (retries >= MAX_RETRIES) {
                    console.error("[Calendar-MS][Delete] 💀 Max retries alcanzado → DLQ");
                    return nack(false); // sin requeue → DLQ
                }

                // Reintento diferido (TTL)
                try {
                    const safeHeaders = sanitizeHeaders(raw.properties.headers);
                    await RabbitPubSubService.instance.publishToExchange(
                        EXCHANGE,
                        ROUTING_KEY_RETRY,
                        raw ? JSON.parse(raw.content.toString()) : { table, ids, idRelation },
                        { persistent: true, headers: { ...safeHeaders, "x-retry": retries + 1 } }
                    );
                    console.warn(`[Calendar-MS][Delete] 🔄 Programado retry #${retries + 1} en ${RETRY_DELAY_MS}ms`);
                    ack();
                } catch (pubErr) {
                    console.error("[Calendar-MS][Delete] ❗ Error re-publicando a retry; envío a DLQ", pubErr);
                    nack(false);
                }
            } finally {
                try {
                    await messageReliability.releaseMessageLock(IDEMPOTENCY_SCOPE, messageDigest);
                } catch (releaseError) {
                    console.error("[Calendar-MS][Delete] Error releasing idempotency lock", releaseError);
                }
            }
        }
    );
}

/* -------------------- Consumer DLQ (persistencia + ACK) -------------------- */
async function deleteSOFTRecordsDLQConsumer(): Promise<void> {
    const rabbit = RabbitPubSubService.instance;
    const channel: Channel = await rabbit.connect();

    // Misma config que en el principal para evitar inequivalence
    await channel.assertQueue(DLQ, {
        durable: true,
        arguments: {
            "x-message-ttl": DLQ_MESSAGE_TTL_MS,
            "x-max-length": 2000,
        },
    });

    channel.prefetch(Math.min(5, Number(process.env.RABBITMQ_PREFETCH_DLQ || 1)));

    await rabbit.consumeQueue<any>(
        DLQ,
        async (content, raw, ack) => {
            try {
                await deadLetterMessageService.registerMessage({
                    queueName: DLQ,
                    exchangeName: EXCHANGE,
                    routingKey: ROUTING_KEY,
                    sourceRoutingKey: raw.fields?.routingKey ?? ROUTING_KEY_DLQ,
                    consumerName: "deleteSOFTRecordsConsumer",
                    payload: content,
                    headers: (raw.properties.headers ?? {}) as Record<string, unknown>,
                    retryCount: getRetryCount(raw),
                    errorMessage: extractDeadLetterReason(raw),
                });
            } catch (persistError) {
                console.error("[Calendar-MS][Delete][DLQ] Error persistiendo mensaje muerto:", persistError);
            }

            ack();
        }
    );
}
