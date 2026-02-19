import rateLimit from 'express-rate-limit';
import { Response } from '../models/messages/response';
import { Message } from '../models/messages/failure';
import { env } from './env';


const maxMessage = env.NODE_ENV === 'production' ? 80 : 10000000;

export const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: maxMessage,
    standardHeaders: true,
    legacyHeaders: false,
    handler: async (req, res) => {
        try {
            // const row = await ConfigurationService.getFallbackMessage();
            res.status(429).json(Response.build(Message.Failure.BOT_EXCLUSION, 429, false, { code: "004", systemUnavailableMessage: {} }));
            return;
        } catch (e) {
            res.status(429).json(Response.build(Message.Failure.BOT_EXCLUSION, 429, false, { code: "004" }));
            return;
        }
    },
});

export const conditionalLimiter = (req, res, next) => {
    // Lista de rutas excluidas
    const whitelist = ['/uploads'];

    // console.log(req.path)
    // Verificar si la ruta actual está en la lista blanca
    if (whitelist.includes(req.path)) {
        next();
    } else {
        limiter(req, res, next);
    }
};

