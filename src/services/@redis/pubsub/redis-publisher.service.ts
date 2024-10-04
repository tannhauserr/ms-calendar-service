import { createClient, RedisClientType } from 'redis';
import { CONSOLE_COLOR } from '../../../constant/console-color';

export class RedisPublisherService {
    private static _instance: RedisPublisherService;
    private publisherClient: RedisClientType;

    private constructor() {
        this.publisherClient = createClient({
            socket: {
                host: process.env.REDIS_HOST,
                port: parseInt(process.env.REDIS_PORT || '6379', 10),
            },
            password: process.env.REDIS_PASSWORD,
        });

        this.publisherClient.on('error', (err) => {
            console.error(`${CONSOLE_COLOR.FgRed}Redis Publisher Client Error: ${err}${CONSOLE_COLOR.Reset}`);
        });

        this.publisherClient.on('ready', () => {
            console.log(`${CONSOLE_COLOR.FgGreen}Redis publisher client connected and ready${CONSOLE_COLOR.Reset}`);
        });

        this.publisherClient.connect().catch((err) => console.error(`${CONSOLE_COLOR.FgRed}Redis Publisher Connection Error: ${err}${CONSOLE_COLOR.Reset}`));
    }

    public static get instance() {
        if (!this._instance) {
            this._instance = new this();
        }
        return this._instance;
    }

    public async publish(channel: string, message: string): Promise<void> {
        await this.publisherClient.publish(channel, message);
        console.log(`${CONSOLE_COLOR.FgCyan}Mensaje publicado en el canal "${channel}": ${message}${CONSOLE_COLOR.Reset}`);
    }
}
