// import { CONSOLE_COLOR } from "./constant/console-color";
// import { CalendarChannelRefreshCronService, CheckCacheCronService } from "./services/@cron";
// import { conditionalLimiter } from './config/rate-limiter';
// import express from 'express';

// // const express = require('express');
// import cookieParser from 'cookie-parser';
// import cors from 'cors';
// import bodyParser from 'body-parser';
// import api from "./routes/index.routes";

// import corsOptions from './config/cors-options';
// import { JWTService } from "./services/jwt/jwt.service";
// import { RedisCacheService } from "./services/@redis/cache/redis.service";
// import { RedisPublisherService } from "./services/@redis/pubsub/redis-publisher.service";
// import { RedisSubscriberService } from "./services/@redis/pubsub/redis-subscriber.service";
// import { initializeSubscriptionsRedis } from "./services/@redis/pubsub/initializeSubscriptions";

// import { initializeConsumerPubSub_RabbitMQ } from "./services/@rabbitmq/pubsub/initializePubSubConsumer";
// import { NotificationPlanCronService } from "./services/@cron/notification-plan-cron.service";

// // const ip = process.env.IP || "127.0.0.1";

// const port = process.env.PORT || 3200;


// const NODE_ENV = process.env.NODE_ENV || 'development';
// require('dotenv').config({
//     path: `.env.${NODE_ENV}`
// });

// const app = express();



// // Esto es cuando trabajas en local y necesitas una ruta http, en caso contrario no es en absoluto necesario
// // const ngrok = require('ngrok');

// // https://__INVENTADO__/webhook

// /**
//  * CORS
//  * Cuando quieres recibir las credenciales desde el backend, tienes que especificar el origen
//  * o de lo contrario tendrá el acceso prohibido.
//  */
// // const corsOptions = {
// //     origin: 'http://localhost:3000', // Asegúrate de que este sea el origen correcto
// //     credentials: true, // Esto permite que se envíen cookies
// // };


// console.log("🌐 CORS WHITELIST:", process.env.WEB_WHITELIST_CORS);
// app.use(cors(corsOptions));
// // Necesario para recibir y enviar tokens
// app.use(cookieParser());


// // Confía en el primer proxy que se encuentra en la cadena de proxies
// // Usado para el Channel de Google Calendar
// app.set('trust proxy', 1);
// // Aplicar el limitador de tasa a todas las solicitudes
// app.use(conditionalLimiter);

// // limite de request
// app.use(bodyParser.json({ limit: '50mb' }));
// app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));



// app.use("/", api);

// // app.use("/test", (req: any, res: any, next: any) => {
// //     res.status(200).json("TEST");
// // })

// // const server = http.createServer(app);

// // Genera una nueva clave privada en cada reinicio del servidor
// JWTService.instance.getPrivateKey();

// RedisCacheService.instance;
// RedisPublisherService.instance;
// RedisSubscriberService.instance;


// // setInterval(async () => {
// //     let factory = RedisStrategyFactory.getStrategy('oauth');
// //     console.log(await factory.getAccessToken("02d08b98-6700-47dd-af1b-d9bb8e75b5f8"));

// // }, 1000);



// app.listen(port, () => {
//     console.log(`${CONSOLE_COLOR.FgMagenta}Conectado, puerto ${port}${CONSOLE_COLOR.Reset}`);

//     // Crons work
//     CheckCacheCronService.instance.start();
//     NotificationPlanCronService.instance.start();
//     // TODO: Hasta que no tenga ruta https no se hacen pruebas con el canal de eventos
//     // CalendarChannelRefreshCronService.instance.start();
//     console.log("🌐 CORS WHITELIST:", process.env.WEB_WHITELIST_CORS);
//     // Inicializar las suscripciones de Redis
//     initializeSubscriptionsRedis();

//     // Inicializar los consumers de RabbitMQ
//     initializeConsumerPubSub_RabbitMQ();

// });

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
