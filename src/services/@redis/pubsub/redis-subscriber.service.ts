import { createClient, RedisClientType } from 'redis';
import { CONSOLE_COLOR } from '../../../constant/console-color';
import { RedisSubscriptionStrategy } from './estrategies/redis-subscription/unique-strategy/RedisSubscriptionStrategy';
import { SubscriberActions } from './action/subscription.action';
import { RedisSubscriptionStrategyFactory } from './estrategies/redis-subscription/redisSubscriptionStrategyFactory';


export class RedisSubscriberService {
    private static _instance: RedisSubscriberService;
    private subscriberClient: RedisClientType;

    private constructor() {
        this.subscriberClient = createClient({
            socket: {
                host: process.env.REDIS_HOST,
                port: parseInt(process.env.REDIS_PORT || '6379', 10),
            },
            password: process.env.REDIS_PASSWORD,
        });

        this.subscriberClient.on('error', (err) => {
            console.error(`${CONSOLE_COLOR.FgRed}Redis Subscriber Client Error: ${err}${CONSOLE_COLOR.Reset}`);
        });

        this.subscriberClient.on('ready', () => {
            console.log(`${CONSOLE_COLOR.FgGreen}Redis subscriber client connected and ready${CONSOLE_COLOR.Reset}`);
        });

        this.subscriberClient.connect().catch((err) => console.error(`${CONSOLE_COLOR.FgRed}Redis Subscriber Connection Error: ${err}${CONSOLE_COLOR.Reset}`));



        // this.subscribe(SubscriberKeys.removeUserFromCalendarChannel, (message) => {
        //     /**
        //      * TODO: En el mensaje recibo un objeto en string, tengo que parsearlo usando JSON.parse
        //      * En el objeto me viene el id del usuario (DB) y el email externo.
        //      * Con el email de Google puedo quitarle los permisos del calendario
        //      */
        //     console.log(`${CONSOLE_COLOR.FgBlue}Mensaje recibido en el canal "${SubscriberKeys.removeUserFromCalendarChannel}": ${message}${CONSOLE_COLOR.Reset}`);
        // });


      


    }


    public static get instance() {
        if (!this._instance) {
            this._instance = new this();
        }
        return this._instance;
    }

    public async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
        await this.subscriberClient.subscribe(channel, (message) => {
            console.log(`${CONSOLE_COLOR.FgYellow}Mensaje recibido en el canal "${channel}": ${message}${CONSOLE_COLOR.Reset}`);
            callback(message);
        });
    }

    public async unsubscribe(channel: string): Promise<void> {
        await this.subscriberClient.unsubscribe(channel);
    }


    public async getSubscribedChannels(): Promise<any> {
        try {
            const channels = await this.subscriberClient.sendCommand(['PUBSUB', 'CHANNELS']);
            return channels;
        } catch (error) {
            console.error(`${CONSOLE_COLOR.FgRed}Error al obtener los canales suscritos: ${error}${CONSOLE_COLOR.Reset}`);
            return [];
        }
    }
}
