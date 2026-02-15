


// consumers/delete-records-consumer.calendar.ts
import { Channel, ConsumeMessage } from "amqplib";
import { RabbitPubSubService } from "../../facade-pubsub/rabbit-pubsub.service";
import prisma from "../../../../../lib/prisma";
import { RabbitMQKeys } from "../../../keys/rabbitmq.keys";

export const deleteRecordsConsumers = {
  deleteRecordsConsumer,
  deleteRecordsDLQConsumer,
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
  const deaths = (msg.properties.headers as any)?.["x-death"] as any[] | undefined;
  return Array.isArray(deaths) && deaths[0]?.count > 0 ? deaths[0].count : 0;
}

/* -------------------- Config -------------------- */
const PREFETCH = Math.min(3, Number(process.env.RABBITMQ_PREFETCH_DELETE_RECORDS) || 1);
const MAX_RETRIES = Number(process.env.DELETE_MAX_RETRIES || 3);
const RETRY_DELAY_MS = Number(process.env.DELETE_RETRY_DELAY_MS || 30_000);
const MAX_IDS_PER_MSG = Number(process.env.DELETE_MAX_IDS_PER_MSG || 1000);

// ⏳ TTLs añadidos (solo esto es nuevo)
const MAIN_MESSAGE_TTL_MS = Number(process.env.DELETE_MAIN_MESSAGE_TTL_MS || 86_400_000 * 3); // 3d
const DLQ_MESSAGE_TTL_MS = Number(process.env.DELETE_DLQ_MESSAGE_TTL_MS || 604_800_000);   // 7d

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

/* -------------------- Consumer principal -------------------- */
async function deleteRecordsConsumer(): Promise<void> {
  const rabbit = RabbitPubSubService.instance;
  const channel: Channel = await rabbit.connect();

  // Exchanges / colas
  await rabbit.assertExchange(EXCHANGE, "direct", true);

  await rabbit.assertExchange(DLX, "direct", true);
  await channel.assertQueue(DLQ, {
    durable: true,
    arguments: {
      "x-message-ttl": DLQ_MESSAGE_TTL_MS, // ✨ antes 24h fijo; ahora por env (7d por defecto)
      "x-max-length": 2000,
      // (si quieres bytes: "x-max-length-bytes": 10 * 1024 * 1024)
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
      "x-message-ttl": MAIN_MESSAGE_TTL_MS, // ✨ vida máxima en principal (3d por defecto)
      "x-dead-letter-exchange": DLX,
      "x-dead-letter-routing-key": DLQ,
    },
  });
  await rabbit.bindQueueToExchange(QUEUE, EXCHANGE, ROUTING_KEY);

  channel.prefetch(PREFETCH);
  console.log(`[Calendar-MS][Delete] ⏳ Awaiting messages on ${QUEUE}...`);

  await rabbit.consumeQueue<"requestDeleteRecords">(
    QUEUE,
    async ({ table, ids, idRelation }, raw, ack, nack) => {
      // ✅ Validación mínima
      const allowedTables = new Set([
        "companies",
        "workspaces",
        "userWorkspaces-byWorkspace",
        "userWorkspaces-byUser",
        "clientWorkspaces",
        "clients",
        "users",
        // Caso especial para Eventos
        "usersEventDeleteDefinitive"
      ]);
      if (!allowedTables.has(table) || !validateIdsAreStrings(ids)) {
        console.error(`[Calendar-MS][Delete] Payload inválido table=${table} → DLQ`);
        return nack(false);
      }

      // 🔪 Guard: split de mensajes gigantes para paralelismo real
      if (ids.length > MAX_IDS_PER_MSG) {
        const msgChunks = chunkArray(ids, MAX_IDS_PER_MSG);
        console.warn(
          `[Calendar-MS][Delete] Oversized message: ${ids.length} ids → republishing ${msgChunks.length} msgs`
        );
        for (const c of msgChunks) {
          await rabbit.publishToExchange(EXCHANGE, ROUTING_KEY, { table, ids: c, idRelation }, { persistent: true });
        }
        return ack();
      }

      const retries = getRetryCount(raw);
      console.log(`[Calendar-MS][Delete] → ${table} (${ids.length} ids) retry#${retries}`);

      try {
        /* ---- BORRADOS por tabla (en chunks/tx) ---- */
        if (table === "companies") {
          const batches = chunkArray(ids, CHUNK);
          for (const batch of batches) {
            await prisma.$transaction(async (tx) => {
              await tx.businessHour.deleteMany({ where: { idCompanyFk: { in: batch } } });
              await tx.workerBusinessHour.deleteMany({ where: { idCompanyFk: { in: batch } } });
              await tx.temporaryBusinessHour.deleteMany({ where: { idCompanyFk: { in: batch } } });
              await tx.workerAbsence.deleteMany({ where: { idCompanyFk: { in: batch } } });

              await tx.event.deleteMany({
                where: { idCompanyFk: { in: batch } },
              });

              // --- Comentado por refactor (mantener) ---
              // const calendars = await tx.calendar.findMany({
              //   where: { idCompanyFk: { in: batch } },
              //   select: { id: true },
              // });
              // const calendarIds = calendars.map((c) => c.id);
              // if (calendarIds.length > 0) {
              //   await tx.event.deleteMany({ where: { idCalendarFk: { in: calendarIds } } });
              // }
              // await tx.calendar.deleteMany({ where: { idCompanyFk: { in: batch } } });

              // TODO: Los servicios y categorías están ahora en MS-BookingPage
              // const services = await tx.service.findMany({ where: { idCompanyFk: { in: batch } }, select: { id: true } });
              // const serviceIds = services.map((s) => s.id);
              // if (serviceIds.length > 0) {
              //   await tx.userService.deleteMany({ where: { idServiceFk: { in: serviceIds } } });
              //   await tx.categoryService.deleteMany({
              //     where: { OR: [{ service: { idCompanyFk: { in: batch } } }, { category: { idCompanyFk: { in: batch } } }] },
              //   });
              // }
              // await tx.service.deleteMany({ where: { idCompanyFk: { in: batch } } });
              // await tx.category.deleteMany({ where: { idCompanyFk: { in: batch } } });
            });
          }
        } else if (table === "workspaces") {
          const batches = chunkArray(ids, CHUNK);
          for (const batch of batches) {
            await prisma.$transaction(async (tx) => {
              await tx.businessHour.deleteMany({ where: { idWorkspaceFk: { in: batch } } });
              await tx.workerAbsence.deleteMany({ where: { idWorkspaceFk: { in: batch } } });
              await tx.workerBusinessHour.deleteMany({ where: { idWorkspaceFk: { in: batch } } });
              await tx.temporaryBusinessHour.deleteMany({ where: { idWorkspaceFk: { in: batch } } });

              // await tx.event.deleteMany({
              //   where: { idWorkspaceFk: { in: batch } },
              // });

              // --- Comentado por refactor (mantener) ---
              // const calendars = await tx.calendar.findMany({
              //   where: { idWorkspaceFk: { in: batch } },
              //   select: { id: true },
              // });
              // const calendarIds = calendars.map((c) => c.id);
              // if (calendarIds.length > 0) {
              //   await tx.event.deleteMany({ where: { idCalendarFk: { in: calendarIds } } });
              // }
              // await tx.calendar.deleteMany({ where: { idWorkspaceFk: { in: batch } } });

              // const services = await tx.service.findMany({ where: { idWorkspaceFk: { in: batch } }, select: { id: true } });
              // const serviceIds = services.map((s) => s.id);
              // const categories = await tx.category.findMany({ where: { idWorkspaceFk: { in: batch } }, select: { id: true } });
              // const categoryIds = categories.map((c) => c.id);
              // if (serviceIds.length > 0 || categoryIds.length > 0) {
              //   await tx.userService.deleteMany({ where: { idServiceFk: { in: serviceIds } } });
              //   await tx.categoryService.deleteMany({
              //     where: { OR: [{ idServiceFk: { in: serviceIds } }, { idCategoryFk: { in: categoryIds } }] },
              //   });
              // }
              // await tx.service.deleteMany({ where: { idWorkspaceFk: { in: batch } } });
              // await tx.category.deleteMany({ where: { idWorkspaceFk: { in: batch } } });
            });
          }
        } else if (table === "userWorkspaces-byWorkspace") {
          // idRelation = userId
          const batches = chunkArray(ids, CHUNK);
          for (const batch of batches) {
            await prisma.$transaction(async (tx) => {

              await tx.workerBusinessHour.deleteMany({
                where: { idUserFk: idRelation, idWorkspaceFk: { in: batch } },
              });
              await tx.temporaryBusinessHour.deleteMany({
                where: { idUserFk: idRelation, idWorkspaceFk: { in: batch } },
              });
              await tx.workerAbsence.deleteMany({
                where: { idUserFk: idRelation, idWorkspaceFk: { in: batch } },
              });
              // await tx.userService.deleteMany({
              //   where: { idUserFk: idRelation, service: { idWorkspaceFk: { in: batch } } },
              // });
            });
          }
        } else if (table === "userWorkspaces-byUser") {
          // idRelation = workspaceId
          const batches = chunkArray(ids, CHUNK);
          for (const batch of batches) {
            await prisma.$transaction(async (tx) => {
              await tx.workerBusinessHour.deleteMany({
                where: { idUserFk: { in: batch }, idWorkspaceFk: idRelation },
              });
              await tx.temporaryBusinessHour.deleteMany({
                where: { idUserFk: { in: batch }, idWorkspaceFk: idRelation },
              });
              await tx.workerAbsence.deleteMany({
                where: { idUserFk: { in: batch }, idWorkspaceFk: idRelation },
              });

              // Ya no hay servicios en MS-Calendar
              // await tx.userService.deleteMany({
              //   where: { idUserFk: { in: batch }, service: { idWorkspaceFk: idRelation } },
              // });
            });
          }
        } else if (table === "clientWorkspaces") {
          const batches = chunkArray(ids, CHUNK);
          for (const batch of batches) {
            await prisma.$transaction(async (tx) => {
              const now = new Date();
              // Solo eliminar las relaciones de participantes, no los eventos completos
              await tx.eventParticipant.deleteMany({
                where: { idClientWorkspaceFk: { in: batch }, createdDate: { gte: now } },
              });

              // Lógica legacy deshabilitada:
              // El modelo actual no tiene la relación directa eventParticipant en Event.
            });
          }
        } else if (table === "clients") {
          const batches = chunkArray(ids, CHUNK);
          for (const batch of batches) {
            await prisma.$transaction(async (tx) => {
              const now = new Date();
              // Solo eliminar las relaciones de participantes, no los eventos completos
              await tx.eventParticipant.deleteMany({
                where: { idClientFk: { in: batch }, createdDate: { gte: now } },
              });

              // Lógica legacy deshabilitada:
              // El modelo actual no tiene la relación directa eventParticipant en Event.
            });
          }
        } else if (table === "users") {
          const batches = chunkArray(ids, CHUNK);
          for (const batch of batches) {
            await prisma.$transaction(async (tx) => {
              await tx.event.updateMany({
                where: { idUserPlatformFk: { in: batch } },
                data: { idUserPlatformFk: null },
              });

              await tx.workerBusinessHour.deleteMany({ where: { idUserFk: { in: batch } } });
              await tx.temporaryBusinessHour.deleteMany({ where: { idUserFk: { in: batch } } });
              await tx.workerAbsence.deleteMany({ where: { idUserFk: { in: batch } } });
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

        ack();
      } catch (err) {
        console.error("[Calendar-MS][Delete] Error procesando:", err);

        const retries = getRetryCount(raw);
        if (retries >= MAX_RETRIES) {
          console.error("[Calendar-MS][Delete] 💀 Max retries alcanzado → DLQ");
          return nack(false); // sin requeue → DLQ
        }

        // Reintento diferido (TTL)
        try {
          await RabbitPubSubService.instance.publishToExchange(
            EXCHANGE,
            ROUTING_KEY_RETRY,
            raw ? JSON.parse(raw.content.toString()) : { table, ids, idRelation },
            { persistent: true, headers: { "x-retry": retries + 1 } }
          );
          console.warn(`[Calendar-MS][Delete] 🔄 Programado retry #${retries + 1} en ${RETRY_DELAY_MS}ms`);
          ack();
        } catch (pubErr) {
          console.error("[Calendar-MS][Delete] ❗ Error re-publicando a retry; envío a DLQ", pubErr);
          nack(false);
        }
      }
    }
  );
}

/* -------------------- Consumer DLQ (observa/ACKea) -------------------- */
async function deleteRecordsDLQConsumer(): Promise<void> {
  const rabbit = RabbitPubSubService.instance;
  const channel: Channel = await rabbit.connect();

  // Misma config que en el principal para evitar inequivalence
  await channel.assertQueue(DLQ, {
    durable: true,
    arguments: {
      "x-message-ttl": DLQ_MESSAGE_TTL_MS, // ✨ antes 24h fijo; ahora por env (7d por defecto)
      "x-max-length": 2000,
      // "x-max-length-bytes": 10 * 1024 * 1024
    },
  });

  channel.prefetch(Math.min(5, Number(process.env.RABBITMQ_PREFETCH_DLQ || 1)));

  await rabbit.consumeQueue<any>(
    DLQ,
    async (content, raw, ack) => {
      console.error("[Calendar-MS][Delete][DLQ] Mensaje muerto:", {
        headers: raw.properties.headers,
        content,
      });
      // Aquí podrías persistir en tabla failed_messages, alertar, etc.
      ack();
    }
  );
}
