// import amqplib, { Channel, Connection, Message } from 'amqplib';
import { Channel, Message } from 'amqplib';
import { ActionKeys, ActionPayloads } from '../actions/rabbitmq.action';
import { RabbitMQService } from '../rabbitmq.service';

type Resolver = (data: any) => void;

export class RabbitRpcService {
    private static _instance: RabbitRpcService;
    private channel!: Channel;
    private replyQueue?: string;
    private pending = new Map<string, Resolver>();

    private constructor() { }

    public static get instance(): RabbitRpcService {
        if (!this._instance) {
            this._instance = new RabbitRpcService();
        }
        return this._instance;
    }

    private async init() {
        const service = RabbitMQService.instance;
        this.channel = await service.connect();

        // crear la reply queue solo una vez
        const { queue } = await this.channel.assertQueue('', {
            exclusive: true,
            autoDelete: true,
            durable: false,
        });
        this.replyQueue = queue;

        // consumir la cola de respuestas una vez
        this.channel.consume(
            queue,
            (msg: Message | null) => {
                if (!msg) return;
                const corrId = msg.properties.correlationId;
                const resolver = this.pending.get(corrId);
                if (resolver) {
                    resolver(JSON.parse(msg.content.toString()));
                    this.pending.delete(corrId);
                }
            },
            { noAck: true }
        );
    }

    public async sendRpc<Action extends ActionKeys>(
        queueName: string,
        action: Action,
        payload: ActionPayloads[Action],
        correlationId: string,
        timeout = 10000
    ): Promise<any> {
        if (!this.channel) {
            await this.init();
        }

        if (!this.replyQueue) {
            throw new Error('Reply queue no inicializada');
        }

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this.pending.delete(correlationId);
                reject(new Error(`RPC request timed out after ${timeout}ms`));
            }, timeout);

            this.pending.set(correlationId, (data: any) => {
                clearTimeout(timeoutId);
                resolve(data);
            });

            this.channel.sendToQueue(
                queueName,
                Buffer.from(JSON.stringify({ action, payload })),
                {
                    correlationId,
                    replyTo: this.replyQueue,
                    contentType: 'application/json',
                    deliveryMode: 2,
                }
            );
        });
    }

    public async close(): Promise<void> {
        await RabbitMQService.instance.close();
    }
}
