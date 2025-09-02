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
}
