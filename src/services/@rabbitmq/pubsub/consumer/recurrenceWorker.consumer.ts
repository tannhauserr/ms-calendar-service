
// // import { Channel, ConsumeMessage } from "amqplib";
// // import { RabbitPubSubService } from "../facade-pubsub/rabbit-pubsub.service";
// // import { RabbitMQKeys } from "../../keys/rabbitmq.keys";
// // import { EventForBackend } from "../../../@database/event/dto/EventForBackend";
// // import { RecurrenceStrategyFactory } from "../../../@database/recurrence-rule/strategy/factory";
// // import { RecurrenceScope } from "../../../@database/recurrence-rule/types";
// // import { getValidRDates, isValidRRule } from "../../../@database/recurrence-rule/strategy/type";
// // import prisma from "../../../../lib/prisma";

// // const { RRule } = require('rrule');


// // // 1) Define el tipo de operación y el scope que espera la fábrica
// // type SplitOp =
// //     | "CREATE_SERIES"   // primera vez → NEW
// //     | "SPLIT_THIS"      // sólo esta instancia → THIS
// //     | "SPLIT_FUTURE"    // de aquí en adelante → FUTURE
// //     | "SPLIT_ALL";      // todas las instancias → ALL


// // // 2) Mapa tipado de SplitOp → RecurrenceScope
// // const splitOpToScope: Record<SplitOp, RecurrenceScope> = {
// //     CREATE_SERIES: "NEW",
// //     SPLIT_THIS: "THIS",
// //     SPLIT_FUTURE: "FUTURE",
// //     SPLIT_ALL: "ALL",
// // };



// // const PREFETCH = 5;
// // const MAX_RETRIES = 5;
// // const RETRY_DELAY_MS = 30_000;
// // const RETRY_TTL = RETRY_DELAY_MS;

// // const QUEUE = RabbitMQKeys.pubSubCalendarRecurrenceQueue();
// // const DLQ = RabbitMQKeys.pubSubCalendarRecurrenceDLQ();
// // const EXCHANGE = RabbitMQKeys.pubSubCalendarRecurrenceExchange();
// // const ROUTING_KEY = RabbitMQKeys.pubSubCalendarRecurrenceRoutingKey();

// // function getRetryCount(msg: ConsumeMessage): number {
// //     const headers = (msg.properties.headers ?? {}) as any;

// //     const xr = Number(headers["x-retry"]);
// //     if (Number.isFinite(xr) && xr >= 0) return xr;

// //     const deaths = headers["x-death"] as any[] | undefined;
// //     if (!Array.isArray(deaths) || deaths.length === 0) return 0;

// //     const retryDeath =
// //         deaths.find((d) => typeof d?.queue === "string" && d.queue.includes(".retry")) ??
// //         deaths[0];

// //     const c = Number(retryDeath?.count);
// //     return Number.isFinite(c) && c > 0 ? c : 0;
// // }

// // export async function recurrenceWorkerConsumer(): Promise<void> {
// //     const rabbit = RabbitPubSubService.instance;
// //     const channel: Channel = await rabbit.connect();

// //     // Topología
// //     await rabbit.assertExchange(EXCHANGE, "direct", true);
// //     await channel.assertQueue(DLQ, {
// //         durable: true,
// //         arguments: {
// //             "x-message-ttl": 24 * 60 * 60 * 1000,  // 24h en ms
// //             "x-max-length": 2000                   // límite de tamaño de la cola
// //         }
// //     });

// //     await channel.assertQueue(QUEUE, {
// //         durable: true,
// //         deadLetterExchange: EXCHANGE,
// //         deadLetterRoutingKey: `${ROUTING_KEY}.dlq`,
// //     });
// //     await rabbit.bindQueueToExchange(QUEUE, EXCHANGE, ROUTING_KEY);
// //     await rabbit.bindQueueToExchange(DLQ, EXCHANGE, `${ROUTING_KEY}.dlq`);
// //     await channel.prefetch(PREFETCH);

// //     console.log("[Recurrence-Worker] ⏳ Awaiting messages...");

// //     await rabbit.consumeQueue<"requestRecurrenceJob">(
// //         QUEUE,
// //         async (content, rawMsg, ack, nack) => {
// //             // 1) Validación básica del mensaje
// //             const { type, payload, amount, idRecurrence } = content;

// //             const retries = getRetryCount(rawMsg);
// //             console.log(
// //                 `[Recurrence-Worker] → ${type} for ${payload.event.id} (retry #${retries})`
// //             );

// //             // 2) Procesamiento y reintentos
// //             try {
// //                 await handleMessage(type, payload, amount, idRecurrence);
// //                 console.log(`✅ [Recurrence-Worker] Done ${payload.event.id}`);
// //                 return ack();
// //             } catch (err) {
// //                 console.error(`❌ [Recurrence-Worker] Error on ${payload.event.id}`, err);

// //                 if (retries >= MAX_RETRIES) {
// //                     console.error(`💀 [Recurrence-Worker] Max retries, sending to DLQ`);
// //                     return nack(false);
// //                 }

// //                 console.warn(`🔄 [Recurrence-Worker] Scheduling retry #${retries + 1}`);
// //                 try {
// //                     await rabbit.publishToExchange(
// //                         EXCHANGE,
// //                         `${ROUTING_KEY}.retry`,
// //                         { type, payload, amount, idRecurrence },
// //                         {
// //                             persistent: true,
// //                             expiration: RETRY_TTL.toString(),
// //                             headers: { "x-retry": retries + 1 },
// //                         }
// //                     );
// //                 } catch (pubErr) {
// //                     console.error(
// //                         "[Recurrence-Worker] Failed to re-publish for retry, ack to avoid loop",
// //                         pubErr
// //                     );
// //                     ack();
// //                 }
// //             }
// //         }
// //     );
// // }

// // // --- Handlers de negocio, sin cambios en el try/catch principal ---

// // async function handleMessage(
// //     type: string,
// //     payload: EventForBackend,
// //     amount: number,
// //     idRecurrence?: string
// // ): Promise<void> {
// //     switch (type) {
// //         case "CREATE_SERIES":
// //             return createInitialSeries(payload, amount, idRecurrence);

// //         case "SPLIT_THIS":
// //         case "SPLIT_FUTURE":
// //         case "SPLIT_ALL":
// //             return splitSeries(type, payload, amount, idRecurrence);

// //         default:
// //             throw new Error(`Unknown message type: ${type}`);
// //     }
// // }

// // export async function createInitialSeries(
// //     payload: EventForBackend,
// //     amount: number,
// //     newRuleId: string
// // ): Promise<void> {
// //     console.log(
// //         `[CreateSeries] START eventId=${payload.event.id}, newRuleId=${newRuleId}, amount=${amount}`
// //     );

// //     if (!newRuleId) {
// //         throw new Error(
// //             `Missing newRuleId in payload for event ${payload.event.id}`
// //         );
// //     }

// //     const rruleText = payload.recurrenceRule?.rrule;
// //     const rdatesArr = payload.recurrenceRule?.rdates;
// //     console.log(
// //         `[CreateSeries] rrule=${rruleText}, rdates=${JSON.stringify(rdatesArr)}`
// //     );

// //     const strat = new (RecurrenceStrategyFactory.get("NEW") as any).constructor();
// //     const oldRuleId = undefined;

// //     const validRDates = getValidRDates(rdatesArr);
// //     console.log(
// //         `[CreateSeries] validRDates=${JSON.stringify(
// //             validRDates.map((d) => d.toISOString())
// //         )}`
// //     );

// //     if (validRDates.length > 0) {
// //         console.log(
// //             `[CreateSeries] Routing to handleWindow with ${validRDates.length} rdates`
// //         );
// //         await prisma.$transaction((tx: any) =>
// //             strat.handleWindow(payload, tx, oldRuleId, newRuleId, amount)
// //         );
// //     } else if (isValidRRule(rruleText)) {
// //         console.log("[CreateSeries] Routing to handleBackground (valid RRule)");
// //         await prisma.$transaction((tx: any) =>
// //             strat.handleBackground(payload, tx, oldRuleId, newRuleId, amount)
// //         );
// //     } else {
// //         console.warn(
// //             `[CreateSeries] Neither valid rdates nor rrule. Skipping for event ${payload.event.id}`
// //         );
// //     }

// //     console.log(
// //         `[CreateSeries] COMPLETED eventId=${payload.event.id}`
// //     );
// // }

// // /**
// //  * Aplica la estrategia correspondiente según `scope`, ejecutándola dentro
// //  * de una transacción Prisma.
// //  */
// // export async function splitSeries(
// //     scope: SplitOp,
// //     payload: EventForBackend,
// //     amount: number,
// //     idRecurrence?: string
// // ): Promise<void> {
// //     console.log(
// //         `[SplitSeries] START scope=${scope}, eventId=${payload.event.id}, amount=${amount}, idRecurrence=${idRecurrence}`
// //     );
// //     const recurrenceScope = splitOpToScope[scope];
// //     console.log(`[SplitSeries] Using recurrenceScope=${recurrenceScope}`);
// //     const strat = RecurrenceStrategyFactory.get(recurrenceScope);

// //     const oldRuleId = payload.recurrenceRuleUpdate?.id!;
// //     if (!oldRuleId) {
// //         throw new Error(
// //             `Missing oldRuleId in payload for event ${payload.event.id}`
// //         );
// //     }
// //     console.log(`[SplitSeries] oldRuleId=${oldRuleId}`);

// //     const rruleText = payload.recurrenceRuleUpdate?.rrule;
// //     const rdatesArr = payload.recurrenceRuleUpdate?.rdates;
// //     console.log(
// //         `[SplitSeries] rruleText=${rruleText}, rdatesArr=${JSON.stringify(
// //             rdatesArr
// //         )}`
// //     );

// //     const validRDates = getValidRDates(rdatesArr);
// //     console.log(
// //         `[SplitSeries] validRDates=${JSON.stringify(
// //             validRDates.map((d) => d.toISOString())
// //         )}`
// //     );

// //     if (validRDates.length > 0) {
// //         console.log(
// //             `[SplitSeries] Routing to handleWindow with ${validRDates.length} rdates`
// //         );
// //         await prisma.$transaction((tx: any) =>
// //             strat.handleWindow(payload, tx, oldRuleId, idRecurrence, amount)
// //         );

// //     } else if (isValidRRule(rruleText)) {
// //         console.log("[SplitSeries] Routing to handleBackground (valid RRule)");
// //         await prisma.$transaction((tx: any) =>
// //             strat.handleBackground(
// //                 payload,
// //                 tx,
// //                 oldRuleId,
// //                 idRecurrence,
// //                 amount
// //             )
// //         );

// //     } else {
// //         console.warn(
// //             `[SplitSeries] Neither valid rdates nor rrule. Skipping regeneration for event ${payload.event.id}`
// //         );
// //     }

// //     console.log(`✅ [SplitSeries] COMPLETED scope=${scope}, eventId=${payload.event.id}`);
// // }




// import { Channel, ConsumeMessage } from "amqplib";
// import { RabbitPubSubService } from "../facade-pubsub/rabbit-pubsub.service";
// import { RabbitMQKeys } from "../../keys/rabbitmq.keys";
// import { EventForBackend } from "../../../@database/event/dto/EventForBackend";
// import { RecurrenceScope } from "../../../@database/recurrence-rule/types";
// import prisma from "../../../../lib/prisma";

// const { RRule } = require("rrule");

// // 1) Define el tipo de operación y el scope que espera la fábrica
// type SplitOp =
//   | "CREATE_SERIES" // primera vez → NEW
//   | "SPLIT_THIS" // sólo esta instancia → THIS
//   | "SPLIT_FUTURE" // de aquí en adelante → FUTURE
//   | "SPLIT_ALL"; // todas las instancias → ALL

// // 2) Mapa tipado de SplitOp → RecurrenceScope
// const splitOpToScope: Record<SplitOp, RecurrenceScope> = {
//   CREATE_SERIES: "NEW",
//   SPLIT_THIS: "THIS",
//   SPLIT_FUTURE: "FUTURE",
//   SPLIT_ALL: "ALL",
// };

// const PREFETCH = 5;
// const MAX_RETRIES = 5;
// const RETRY_DELAY_MS = 30_000;

// const QUEUE = RabbitMQKeys.pubSubCalendarRecurrenceQueue();
// const DLQ = RabbitMQKeys.pubSubCalendarRecurrenceDLQ();
// const EXCHANGE = RabbitMQKeys.pubSubCalendarRecurrenceExchange();
// const ROUTING_KEY = RabbitMQKeys.pubSubCalendarRecurrenceRoutingKey();

// // ✅ Cola de retry con TTL (y DL de vuelta a la cola principal)
// const RETRY_QUEUE = `${QUEUE}.retry`;
// const ROUTING_KEY_RETRY = `${ROUTING_KEY}.retry`;

// function getRetryCount(msg: ConsumeMessage): number {
//   const headers = (msg.properties.headers ?? {}) as any;

//   const xr = Number(headers["x-retry"]);
//   if (Number.isFinite(xr) && xr >= 0) return xr;

//   const deaths = headers["x-death"] as any[] | undefined;
//   if (!Array.isArray(deaths) || deaths.length === 0) return 0;

//   const retryDeath =
//     deaths.find(
//       (d) => typeof d?.queue === "string" && d.queue.includes(".retry")
//     ) ?? deaths[0];

//   const c = Number(retryDeath?.count);
//   return Number.isFinite(c) && c > 0 ? c : 0;
// }

// export async function recurrenceWorkerConsumer(): Promise<void> {
//   const rabbit = RabbitPubSubService.instance;
//   const channel: Channel = await rabbit.connect();

//   // Topología
//   await rabbit.assertExchange(EXCHANGE, "direct", true);

//   // DLQ (no tiene DLX para evitar bucles)
//   await channel.assertQueue(DLQ, {
//     durable: true,
//     arguments: {
//       "x-message-ttl": 24 * 60 * 60 * 1000, // 24h
//       "x-max-length": 2000,
//     },
//   });

//   // ✅ Retry queue con TTL → al expirar, vuelve a QUEUE
//   await channel.assertQueue(RETRY_QUEUE, {
//     durable: true,
//     arguments: {
//       "x-message-ttl": RETRY_DELAY_MS,
//       "x-dead-letter-exchange": EXCHANGE,
//       "x-dead-letter-routing-key": ROUTING_KEY,
//       "x-max-length": 5000,
//     },
//   });

//   // ✅ Cola principal con DLQ
//   await channel.assertQueue(QUEUE, {
//     durable: true,
//     arguments: {
//       "x-dead-letter-exchange": EXCHANGE,
//       "x-dead-letter-routing-key": `${ROUTING_KEY}.dlq`,
//     },
//   });

//   await rabbit.bindQueueToExchange(QUEUE, EXCHANGE, ROUTING_KEY);
//   await rabbit.bindQueueToExchange(DLQ, EXCHANGE, `${ROUTING_KEY}.dlq`);
//   await rabbit.bindQueueToExchange(RETRY_QUEUE, EXCHANGE, ROUTING_KEY_RETRY);

//   await channel.prefetch(PREFETCH);

//   console.log("[Recurrence-Worker] ⏳ Awaiting messages...");

//   await rabbit.consumeQueue<"requestRecurrenceJob">(
//     QUEUE,
//     async (content, rawMsg, ack, nack) => {
//       // 1) Validación básica del mensaje
//       const { type, payload, amount, idRecurrence } = content as any;

//       const retries = getRetryCount(rawMsg);
//       console.log(
//         `[Recurrence-Worker] → ${type} for ${payload?.event?.id} (retry #${retries})`
//       );

//       // 2) Procesamiento y reintentos
//       try {
//         await handleMessage(type, payload, amount, idRecurrence);
//         console.log(`✅ [Recurrence-Worker] Done ${payload.event.id}`);
//         return ack();
//       } catch (err) {
//         console.error(`❌ [Recurrence-Worker] Error on ${payload?.event?.id}`, err);

//         if (retries >= MAX_RETRIES) {
//           console.error(`💀 [Recurrence-Worker] Max retries, sending to DLQ`);
//           return nack(false);
//         }

//         console.warn(`🔄 [Recurrence-Worker] Scheduling retry #${retries + 1}`);

//         try {
//           // ✅ Publica a la retry queue (TTL) y ACK del original para evitar duplicados/bucles
//           await rabbit.publishToExchange(
//             EXCHANGE,
//             ROUTING_KEY_RETRY,
//             { type, payload, amount, idRecurrence },
//             {
//               persistent: true,
//               headers: { "x-retry": retries + 1 },
//             }
//           );

//           return ack();
//         } catch (pubErr) {
//           console.error(
//             "[Recurrence-Worker] Failed to re-publish for retry; sending to DLQ",
//             pubErr
//           );
//           return nack(false);
//         }
//       }
//     }
//   );
// }

// // --- Handlers de negocio, sin cambios en el try/catch principal ---

// async function handleMessage(
//   type: string,
//   payload: EventForBackend,
//   amount: number,
//   idRecurrence?: string
// ): Promise<void> {
//   switch (type) {
//     case "CREATE_SERIES":
//       return createInitialSeries(payload, amount, idRecurrence);

//     case "SPLIT_THIS":
//     case "SPLIT_FUTURE":
//     case "SPLIT_ALL":
//       return splitSeries(type as SplitOp, payload, amount, idRecurrence);

//     default:
//       throw new Error(`Unknown message type: ${type}`);
//   }
// }

// export async function createInitialSeries(
//   payload: EventForBackend,
//   amount: number,
//   newRuleId: string
// ): Promise<void> {
//   console.log(
//     `[CreateSeries] START eventId=${payload.event.id}, newRuleId=${newRuleId}, amount=${amount}`
//   );

//   if (!newRuleId) {
//     throw new Error(
//       `Missing newRuleId in payload for event ${payload.event.id}`
//     );
//   }

//   const rruleText = payload.recurrenceRule?.rrule;
//   const rdatesArr = payload.recurrenceRule?.rdates;
//   console.log(
//     `[CreateSeries] rrule=${rruleText}, rdates=${JSON.stringify(rdatesArr)}`
//   );

//   const strat = new (RecurrenceStrategyFactory.get("NEW") as any).constructor();
//   const oldRuleId = undefined;

//   const validRDates = getValidRDates(rdatesArr);
//   console.log(
//     `[CreateSeries] validRDates=${JSON.stringify(
//       validRDates.map((d) => d.toISOString())
//     )}`
//   );

//   if (validRDates.length > 0) {
//     console.log(
//       `[CreateSeries] Routing to handleWindow with ${validRDates.length} rdates`
//     );
//     await prisma.$transaction((tx: any) =>
//       strat.handleWindow(payload, tx, oldRuleId, newRuleId, amount)
//     );
//   } else if (isValidRRule(rruleText)) {
//     console.log("[CreateSeries] Routing to handleBackground (valid RRule)");
//     await prisma.$transaction((tx: any) =>
//       strat.handleBackground(payload, tx, oldRuleId, newRuleId, amount)
//     );
//   } else {
//     console.warn(
//       `[CreateSeries] Neither valid rdates nor rrule. Skipping for event ${payload.event.id}`
//     );
//   }

//   console.log(`[CreateSeries] COMPLETED eventId=${payload.event.id}`);
// }

// /**
//  * Aplica la estrategia correspondiente según `scope`, ejecutándola dentro
//  * de una transacción Prisma.
//  */
// export async function splitSeries(
//   scope: SplitOp,
//   payload: EventForBackend,
//   amount: number,
//   idRecurrence?: string
// ): Promise<void> {
//   console.log(
//     `[SplitSeries] START scope=${scope}, eventId=${payload.event.id}, amount=${amount}, idRecurrence=${idRecurrence}`
//   );
//   const recurrenceScope = splitOpToScope[scope];
//   console.log(`[SplitSeries] Using recurrenceScope=${recurrenceScope}`);
//   const strat = RecurrenceStrategyFactory.get(recurrenceScope);

//   const oldRuleId = payload.recurrenceRuleUpdate?.id!;
//   if (!oldRuleId) {
//     throw new Error(
//       `Missing oldRuleId in payload for event ${payload.event.id}`
//     );
//   }
//   console.log(`[SplitSeries] oldRuleId=${oldRuleId}`);

//   const rruleText = payload.recurrenceRuleUpdate?.rrule;
//   const rdatesArr = payload.recurrenceRuleUpdate?.rdates;
//   console.log(
//     `[SplitSeries] rruleText=${rruleText}, rdatesArr=${JSON.stringify(rdatesArr)}`
//   );

//   const validRDates = getValidRDates(rdatesArr);
//   console.log(
//     `[SplitSeries] validRDates=${JSON.stringify(
//       validRDates.map((d) => d.toISOString())
//     )}`
//   );

//   if (validRDates.length > 0) {
//     console.log(
//       `[SplitSeries] Routing to handleWindow with ${validRDates.length} rdates`
//     );
//     await prisma.$transaction((tx: any) =>
//       strat.handleWindow(payload, tx, oldRuleId, idRecurrence, amount)
//     );
//   } else if (isValidRRule(rruleText)) {
//     console.log("[SplitSeries] Routing to handleBackground (valid RRule)");
//     await prisma.$transaction((tx: any) =>
//       strat.handleBackground(payload, tx, oldRuleId, idRecurrence, amount)
//     );
//   } else {
//     console.warn(
//       `[SplitSeries] Neither valid rdates nor rrule. Skipping regeneration for event ${payload.event.id}`
//     );
//   }

//   console.log(
//     `✅ [SplitSeries] COMPLETED scope=${scope}, eventId=${payload.event.id}`
//   );
// }
