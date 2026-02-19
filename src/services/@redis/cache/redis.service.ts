import { createClient, RedisClientType } from 'redis';
import { CONSOLE_COLOR } from '../../../constant/console-color';
import { env } from '../../../config/env';
// import { handleCacheDelete } from './cache-event-handles';


export class RedisCacheService {
    private static _instance: RedisCacheService;
    private redisClient: RedisClientType;
    private subscriberClient: RedisClientType;

    private constructor() {
        this.redisClient = createClient({
            socket: {
                host: env.REDIS_HOST,
                port: env.REDIS_PORT,
            },
            password: env.REDIS_PASSWORD,
            database: env.REDIS_DB,
        });

        this.subscriberClient = createClient({
            socket: {
                host: env.REDIS_HOST,
                port: env.REDIS_PORT,
            },
            password: env.REDIS_PASSWORD,
            database: env.REDIS_DB,
        });


        this.redisClient.on('error', (err) => {
            console.error(`${CONSOLE_COLOR.FgRed}Redis Client Error: ${err}${CONSOLE_COLOR.Reset}`);
        });

        this.redisClient.on('ready', () => {
            console.log(`${CONSOLE_COLOR.FgGreen}Redis client connected and ready${CONSOLE_COLOR.Reset}`);
        });

        this.subscriberClient.on('error', (err) => {
            console.error(`${CONSOLE_COLOR.FgRed}Redis Subscriber Client Error: ${err}${CONSOLE_COLOR.Reset}`);
        });

        this.subscriberClient.on('ready', () => {
            console.log(`${CONSOLE_COLOR.FgGreen}Redis subscriber client connected and ready${CONSOLE_COLOR.Reset}`);
        });

        this.redisClient.connect().catch((err) => console.error(`${CONSOLE_COLOR.FgRed}Redis Connection Error: ${err}${CONSOLE_COLOR.Reset}`));
        this.subscriberClient.connect().catch((err) => console.error(`${CONSOLE_COLOR.FgRed}Redis Subscriber Connection Error: ${err}${CONSOLE_COLOR.Reset}`));

        // Suscribirse a los eventos de eliminación y expiración
        // this.subscriberClient.subscribe('__keyevent@0__:del', (message) => {
        //     handleCacheDelete(message); // Manejar eliminaciones manuales
        // });

        // this.subscriberClient.subscribe('__keyevent@0__:expired', (message) => {
        //     handleCacheDelete(message); // Manejar expiraciones automáticas
        // });
    }

    public static get instance() {
        if (!this._instance) {
            this._instance = new this();
        }
        return this._instance;
    }

    public async set(key: string, value: string, ttl?: number): Promise<void> {
        if (ttl) {
            await this.redisClient.set(key, value, {
                EX: ttl,
            });
        } else {
            await this.redisClient.set(key, value);
        }
    }

    public async setIfNotExists(key: string, value: string, ttl: number): Promise<boolean> {
        const result = await this.redisClient.set(key, value, {
            EX: ttl,
            NX: true,
        });

        return result === "OK";
    }

    public async get(key: string): Promise<string | null> {
        return this.redisClient.get(key);
    }

    public async delete(key: string): Promise<number> {
        return this.redisClient.del(key);
    }

    public async clear(): Promise<void> {
        await this.redisClient.flushAll();
    }

    /**
     * Crea un pipeline para operaciones en lote
     * Útil para múltiples operaciones SET/DEL que se pueden ejecutar juntas
     * Retorna un wrapper que soporta operaciones condicionales
     */
    public pipeline() {
        const pipeline = this.redisClient.multi();

        const wrapper = {
            set: (key: string, value: string, ttl?: number, condition: boolean = true) => {
                if (condition) {
                    if (ttl) {
                        pipeline.set(key, value, { EX: ttl });
                    } else {
                        pipeline.set(key, value);
                    }
                }
                return wrapper; // retorna el wrapper para chaining
            },
            del: (key: string, condition: boolean = true) => {
                if (condition && key !== "_") { // evita operaciones no-op con "_"
                    pipeline.del(key);
                }
                return wrapper; // retorna el wrapper para chaining  
            },
            exec: () => pipeline.exec()
        };

        return wrapper;
    }

    /**
     * Ejecuta múltiples operaciones SET en un pipeline
     * @param operations Array de operaciones {key, value, ttl?}
     */
    public async batchSet(operations: Array<{ key: string, value: string, ttl?: number }>): Promise<void> {
        if (operations.length === 0) return;

        const pipeline = this.redisClient.multi();

        for (const op of operations) {
            if (op.ttl) {
                pipeline.set(op.key, op.value, { EX: op.ttl });
            } else {
                pipeline.set(op.key, op.value);
            }
        }

        await pipeline.exec();
    }

    /**
     * Ejecuta múltiples operaciones DELETE en un pipeline
     * @param keys Array de keys a eliminar
     */
    public async batchDelete(keys: string[]): Promise<void> {
        if (keys.length === 0) return;

        const pipeline = this.redisClient.multi();
        keys.forEach(key => pipeline.del(key));
        await pipeline.exec();
    }



    /**
     * Escanea y elimina keys que coincidan con un patrón dado
     * @param pattern 
     */
    async deleteByPattern(pattern: string): Promise<void> {
        let cursor = 0; // número

        do {
            const { cursor: nextCursor, keys } = await this.redisClient.scan(cursor, {
                MATCH: pattern,
                COUNT: 100,
            });

            if (keys.length > 0) {
                await this.redisClient.del(keys);
            }

            cursor = nextCursor;
        } while (cursor !== 0);
    }
}
