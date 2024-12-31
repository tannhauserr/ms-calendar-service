import { CONSOLE_COLOR } from "./constant/console-color";
import { CalendarChannelRefreshCronService, CheckCacheCronService } from "./services/@cron";
import { conditionalLimiter } from './config/rate-limiter';
import express from 'express';

// const express = require('express');
import cookieParser from 'cookie-parser';
import cors from 'cors';
import bodyParser from 'body-parser';
import api from "./routes/index.routes";

import corsOptions from './config/cors-options';
import { JWTService } from "./services/jwt/jwt.service";
import { RedisCacheService } from "./services/@redis/cache/redis.service";
import { RedisPublisherService } from "./services/@redis/pubsub/redis-publisher.service";
import { RedisSubscriberService } from "./services/@redis/pubsub/redis-subscriber.service";
import { initializeSubscriptionsRedis } from "./services/@redis/pubsub/initializeSubscriptions";
import { initializeChannels } from "./services/caledar-googleapi/channel-calendar/initializeChannelCalendar";
import { initializeConsumerRabbitMQ } from "./services/@rabbitmq/initializeConsumers";
import { initializeConsumerRCP_RabbitMQ } from "./services/@rabbitmq/rpc/initializeRpcConsumer";

// const ip = process.env.IP || "127.0.0.1";

const port = process.env.PORT || 3200;


const NODE_ENV = process.env.NODE_ENV || 'development';
require('dotenv').config({
    path: `.env.${NODE_ENV}`
});

const app = express();



// Esto es cuando trabajas en local y necesitas una ruta http, en caso contrario no es en absoluto necesario
// const ngrok = require('ngrok');

// https://__INVENTADO__/webhook

/**
 * CORS
 * Cuando quieres recibir las credenciales desde el backend, tienes que especificar el origen
 * o de lo contrario tendrá el acceso prohibido.
 */
// const corsOptions = {
//     origin: 'http://localhost:3000', // Asegúrate de que este sea el origen correcto
//     credentials: true, // Esto permite que se envíen cookies
// };


app.use(cors(corsOptions));
// Necesario para recibir y enviar tokens
app.use(cookieParser());


// Confía en el primer proxy que se encuentra en la cadena de proxies
// Usado para el Channel de Google Calendar
app.set('trust proxy', 1);
// Aplicar el limitador de tasa a todas las solicitudes
app.use(conditionalLimiter);

// limite de request
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));



app.use("/", api);

// app.use("/test", (req: any, res: any, next: any) => {
//     res.status(200).json("TEST");
// })

// const server = http.createServer(app);

// Genera una nueva clave privada en cada reinicio del servidor
JWTService.instance.getPrivateKey();

RedisCacheService.instance;
RedisPublisherService.instance;
RedisSubscriberService.instance;


// setInterval(async () => {
//     let factory = RedisStrategyFactory.getStrategy('googleOAuth');
//     console.log(await factory.getAccessToken("02d08b98-6700-47dd-af1b-d9bb8e75b5f8"));

// }, 1000);



app.listen(port, () => {
    console.log(`${CONSOLE_COLOR.FgMagenta}Conectado, puerto ${port}${CONSOLE_COLOR.Reset}`);

    // Crons work
    CheckCacheCronService.instance.start();
    // TODO: Hasta que no tenga ruta https no se hacen pruebas con el canal de eventos
    // CalendarChannelRefreshCronService.instance.start();

    // Inicializar las suscripciones de Redis
    initializeSubscriptionsRedis();

    // Inicializar los consumers de RabbitMQ
    initializeConsumerRabbitMQ();
    initializeConsumerRCP_RabbitMQ();

/**
   * IMPORTANTE LEER:
   * 
   * Hasta que no se disponga de una ruta HTTPS, no se deben realizar pruebas con el canal de eventos.
   * 
   * Se ha decidido comentar la lógica de los canales de eventos en la plataforma por las siguientes razones:
   * 
   * 1. **Duplicación de Eventos:**
   *    - Cuando se crea un evento desde la plataforma o el bot, el canal de Google Calendar se activa y
   *      trata de replicar esa misma acción. Esto provoca duplicación de acciones o eventos en el sistema.
   * 
   * 2. **Solución Temporal:**
   *    - Se consideró una solución en la que se almacenaría en Redis una propiedad con el ID del evento para
   *      evitar esta duplicación. Esta solución funciona, pero podría no cubrir todos los posibles problemas
   *      que puedan surgir con el manejo del canal de eventos.
   * 
   * 3. **Decisión:**
   *    - Por precaución, se ha decidido comentar el código relacionado con la lógica de los canales para evitar
   *      problemas imprevistos que no se hayan considerado.
   * 
   * 4. **Recordatorio:**
   *    - Los archivos `createEventGoogle.subscription.ts`, `updateEventGoogle.subscription.ts` y `deleteEventGoogle.subscription.ts`
   *      contienen la lógica comentada que impide que el canal duplique la acción de creación, actualización o eliminación
   *      de eventos.
   * 
   * 5. **Función:**
   *  initializeChannels()
   */
   


});


