const whitelist = process.env.WEB_WHITELIST_CORS;
/**
 * CORS
 * Cuando quieres recibir las credenciales desde el backend, tienes que especificar el origen
 * o de lo contrario tendrá el acceso prohibido.
 * 
 * "Credentials" es necesario para recibir y enviar tokens
 */
const corsOptions = {
    origin: function (origin, callback) {
        if (whitelist.indexOf(origin) !== -1 || !origin) {
            callback(null, true);
        } else {
            callback(new Error('No permitido por CORS'));
        }
    },
    credentials: true,
};

export default corsOptions;