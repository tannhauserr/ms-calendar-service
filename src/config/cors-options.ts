import { env } from "./env";

const parseWhitelist = (rawValue: string): string[] => {
    const trimmed = rawValue.trim();

    if (!trimmed) return [];

    if (trimmed.startsWith("[")) {
        try {
            const parsed = JSON.parse(trimmed);
            return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
        } catch {
            return [];
        }
    }

    return trimmed
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
};

const whitelist = parseWhitelist(env.WEB_WHITELIST_CORS);
/**
 * CORS
 * Cuando quieres recibir las credenciales desde el backend, tienes que especificar el origen
 * o de lo contrario tendrá el acceso prohibido.
 * 
 * "Credentials" es necesario para recibir y enviar tokens
 */
const corsOptions = {
    origin: function (origin, callback) {
        if (!origin || whitelist.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('No permitido por CORS'));
        }
    },
    credentials: true,
};

export default corsOptions;
