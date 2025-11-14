import { createClient, RedisClientType } from 'redis';
import { CONSOLE_COLOR } from '../../../constant/console-color';
// import { handleCacheDelete } from './cache-event-handles';


const NODE_ENV = process.env.NODE_ENV || 'development';
require('dotenv').config({
    path: `.env.${NODE_ENV}`
});


export class RedisCacheService {
    private static _instance: RedisCacheService;
    private redisClient: RedisClientType;
    private subscriberClient: RedisClientType;

    private constructor() {
        this.redisClient = createClient({
            socket: {
                host: process.env.REDIS_HOST,
                port: parseInt(process.env.REDIS_PORT || '6379', 10),
            },
            password: process.env.REDIS_PASSWORD,
            database: parseInt(process.env.REDIS_DB || '0', 10),
        });

        this.subscriberClient = createClient({
            socket: {
                host: process.env.REDIS_HOST,
                port: parseInt(process.env.REDIS_PORT || '6379', 10),
            },
            password: process.env.REDIS_PASSWORD,
            database: parseInt(process.env.REDIS_DB || '0', 10),
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
    public async batchSet(operations: Array<{key: string, value: string, ttl?: number}>): Promise<void> {
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
}
