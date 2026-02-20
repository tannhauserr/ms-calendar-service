

import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import bodyParser from "body-parser";

import { CONSOLE_COLOR } from "./constant/console-color";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { conditionalLimiter } from "./config/rate-limiter";
import corsOptions from "./config/cors-options";
import api from "./routes/index.routes";

import { JWTService } from "./services/jwt/jwt.service";

import { RedisCacheService } from "./services/@redis/cache/redis.service";
import { RedisPublisherService } from "./services/@redis/pubsub/redis-publisher.service";
import { RedisSubscriberService } from "./services/@redis/pubsub/redis-subscriber.service";
import { initializeSubscriptionsRedis } from "./services/@redis/pubsub/initializeSubscriptions";

import { initializeConsumerPubSub_RabbitMQ } from "./services/@rabbitmq/pubsub/initializePubSubConsumer";

import {
  CheckCacheCronService,
  WaitListCronService,
} from "./services/@cron";

import prisma from "./lib/prisma";

const port = env.PORT;

// ─────────────────────────────────────────────────────────────────
// APP
// ─────────────────────────────────────────────────────────────────
const app = express();

logger.info({ whitelist: env.WEB_WHITELIST_CORS }, "CORS whitelist loaded");

app.use(cors(corsOptions));
app.use(cookieParser());

// Confía en el primer proxy
app.set("trust proxy", 1);

app.use(conditionalLimiter);

app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));

app.use("/", api);

// ─────────────────────────────────────────────────────────────────
// INIT SERVICES
// ─────────────────────────────────────────────────────────────────
async function initializeServices() {
  try {
    // JWT key (si es sync, no pasa nada; si es async, mejor con await)
    await JWTService.instance.getPrivateKey();

    if (env.ENABLE_REDIS) {
      // Redis singletons
      RedisCacheService.instance;
      RedisPublisherService.instance;
      RedisSubscriberService.instance;

      // Redis subscriptions
      initializeSubscriptionsRedis();
    } else {
      logger.warn("Redis deshabilitado por entorno (ENABLE_REDIS=false)");
    }

    if (env.ENABLE_RABBITMQ) {
      // RabbitMQ consumers
      await initializeConsumerPubSub_RabbitMQ();
    } else {
      logger.warn("RabbitMQ deshabilitado por entorno (ENABLE_RABBITMQ=false)");
    }

    // Crons
    CheckCacheCronService.instance.start();
    WaitListCronService.instance.start();
    console.log(`${CONSOLE_COLOR.FgGreen}✅ Servicios inicializados${CONSOLE_COLOR.Reset}`);
  } catch (error) {
    console.error(
      `${CONSOLE_COLOR.FgRed}❌ Error inicializando servicios:${CONSOLE_COLOR.Reset}`,
      error
    );
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────────────────────────
let server: ReturnType<typeof app.listen> | null = null;

(async () => {
  try {
    await initializeServices();

    server = app.listen(port, () => {
      console.log(`${CONSOLE_COLOR.FgMagenta}🚀 Conectado, puerto ${port}${CONSOLE_COLOR.Reset}`);
      console.log(`${CONSOLE_COLOR.FgCyan}📝 Entorno: ${env.NODE_ENV}${CONSOLE_COLOR.Reset}`);
      console.log(`${CONSOLE_COLOR.FgCyan}🌐 CORS WHITELIST: ${env.WEB_WHITELIST_CORS}${CONSOLE_COLOR.Reset}`);
    });
  } catch (error) {
    console.error(
      `${CONSOLE_COLOR.FgRed}❌ Error al iniciar servidor:${CONSOLE_COLOR.Reset}`,
      error
    );
    process.exit(1);
  }
})();

// ─────────────────────────────────────────────────────────────────
// GRACEFUL SHUTDOWN
// ─────────────────────────────────────────────────────────────────
async function gracefulShutdown(signal: string) {
  console.log(`\n${CONSOLE_COLOR.FgYellow}⚠️  Recibida señal ${signal}${CONSOLE_COLOR.Reset}`);

  try {
    // 1) Dejar de aceptar conexiones HTTP
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      console.log(`${CONSOLE_COLOR.FgGreen}✅ HTTP server cerrado${CONSOLE_COLOR.Reset}`);
    }

    // 2) Parar crons
    CheckCacheCronService.instance.stop?.();
    WaitListCronService.instance.stop?.();

    // 3) Cerrar DB (Prisma)
    await prisma.$disconnect();
    console.log(`${CONSOLE_COLOR.FgGreen}✅ Prisma desconectado${CONSOLE_COLOR.Reset}`);

    process.exit(0);
  } catch (err) {
    console.error(`${CONSOLE_COLOR.FgRed}❌ Error en shutdown:${CONSOLE_COLOR.Reset}`, err);
    process.exit(1);
  }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("uncaughtException", (err) => {
  console.error("❌ Excepción no capturada:", err);
  gracefulShutdown("uncaughtException");
});
process.on("unhandledRejection", (reason) => {
  console.error("❌ Promesa rechazada no capturada:", reason);
  gracefulShutdown("unhandledRejection");
});
