import { CONSOLE_COLOR } from "./constant/console-color";
import { CheckCacheCronService, GeneratePrivateKeyCronService } from "./services/@cron";
import { conditionalLimiter } from './config/rate-limiter';
import express from 'express';

// const express = require('express');
import cookieParser from 'cookie-parser';
import cors from 'cors';
import bodyParser from 'body-parser';
import api from "./routes/index.routes";

import corsOptions from './config/cors-options';
import { JWTService } from "./services/jwt/jwt.service";
import { RedisCacheService } from "./services/@redis/redis.service";

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

// UtilGeneral.createConversations(15000, '2024-03-14').then(() => {
//     console.log('Conversaciones creadas con éxito');
// }).catch((error) => {
//     console.error('Error al crear conversaciones:', error);
// });




app.listen(port, () => {
    console.log(`${CONSOLE_COLOR.FgMagenta}Conectado, puerto ${port}${CONSOLE_COLOR.Reset}`);

    // Crons work
    CheckCacheCronService.instance.start();
    GeneratePrivateKeyCronService.instance.start();
});


