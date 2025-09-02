import { ActionKeys, ActionPayloads } from "../../actions/rabbitmq.action";
import { RabbitMQKeys } from "../../keys/rabbitmq.keys";
import { connect, Connection, Channel, ConsumeMessage } from "amqplib";



type QueueKeys = keyof typeof RabbitMQKeys; // Crear un tipo a partir de las claves de RabbitMQKeys

export class RabbitPubSubService {
    private static _instance: RabbitPubSubService;

    private connection!: Connection;
    private channel!: Channel;
    private readonly host: string = process.env.RABBITMQ_HOST || 'localhost';
    private readonly port: number = Number(process.env.RABBITMQ_PORT) || 5672;
    private readonly user: string = process.env.RABBITMQ_USER || 'guest';
    private readonly password: string = process.env.RABBITMQ_PASSWORD || 'guest';
    private readonly vhost: string = process.env.RABBITMQ_VHOST || '/';

    private constructor() { }

    public static get instance(): RabbitPubSubService {
        if (!this._instance) {
            this._instance = new RabbitPubSubService();
        }
        return this._instance;
    }

    public async connect(): Promise<Channel> {
        if (!this.connection) {
            this.connection = await connect({
                hostname: this.host,
                port: this.port,
                username: this.user,
                password: this.password,
                vhost: this.vhost,


            });
            this.channel = await this.connection.createChannel();
            console.log('Conectado a RabbitMQ');
        }
        return this.channel;
    }

    // Asegurar que el exchange esté creado y enlazado a las colas
    public async assertExchange(
        exchangeKey: string,
        exchangeType: 'fanout' | 'topic' | 'direct' = 'fanout', // Puede ser 'fanout' para broadcast o 'topic' para mensajes específicos
        durable: boolean = true
    ): Promise<void> {
        const channel = await RabbitPubSubService.instance.connect();
        await channel.assertExchange(exchangeKey, exchangeType, { durable });
        console.log(`Exchange ${exchangeKey} de tipo ${exchangeType} asegurado con durabilidad: ${durable}`);
    }

    // Enlazar una cola a un exchange con un routingKey (especialmente útil para exchanges tipo 'topic')
    public async bindQueueToExchange(
        // queueKey: QueueKeys,
        queueKey: string, // Cambiado a string para permitir el uso de claves dinámicas
        exchangeKey: string,
        routingKey: string = ''
    ): Promise<void> {
        const channel = await RabbitPubSubService.instance.connect();
        // const queue = RabbitMQKeys[queueKey](); // Obtener el nombre de la cola a partir de la key
        const queue = queueKey;
        await channel.bindQueue(queue, exchangeKey, routingKey);
        console.log(`Queue ${queue} enlazada a exchange ${exchangeKey} con routingKey ${routingKey}`);
    }



    // Publicar un mensaje en un exchange, permitiendo que varios consumidores lo reciban si están enlazados al exchange
    // public async publishToExchange<T extends ActionKeys>(
    //     exchangeKey: string,
    //     routingKey: string = '',
    //     message: ActionPayloads[T],
    //     persistent: boolean = true
    // ): Promise<void> {
    //     const channel = await RabbitPubSubService.instance.connect();
    //     const content = Buffer.from(JSON.stringify(message));
    //     await channel.publish(exchangeKey, routingKey, content, { persistent });
    //     console.log(`Mensaje publicado a exchange ${exchangeKey} con routingKey ${routingKey}:`, message);
    // }

    public async publishToExchange<T extends ActionKeys>(
        exchangeKey: string,
        routingKey: string,
        message: ActionPayloads[T],
        options: {
            persistent?: boolean;
            expiration?: string;
            headers?: Record<string, any>;
        } = {}
    ): Promise<void> {
        const channel = await this.connect();
        const content = Buffer.from(JSON.stringify(message));
        await channel.publish(
            exchangeKey,
            routingKey,
            content,
            {
                persistent: options.persistent ?? true,
                expiration: options.expiration,
                headers: options.headers,
            }
        );
        console.log(`Mensaje publicado a exchange ${exchangeKey} con routingKey ${routingKey}:`, message);
    }

    // // Consumir mensajes de una cola que ha sido enlazada a un exchange, usando un callback tipado
    // public async consumeQueue<T extends ActionKeys>(
    //     // queueKey: QueueKeys,
    //     queueKey: string, // Cambiado a string para permitir el uso de claves dinámicas
    //     onMessage: (msg: ActionPayloads[T], ack: () => void) => void
    // ): Promise<void> {
    //     const channel = await RabbitPubSubService.instance.connect();
    //     // const queue = RabbitMQKeys[queueKey]();
    //     const queue = queueKey; // Obtener el nombre de la cola a partir de la key

    //     // Consumir mensajes de la cola especificada
    //     await channel.consume(queue, (msg) => {
    //         if (msg) {
    //             const content = JSON.parse(msg.content.toString()) as ActionPayloads[T];
    //             console.log(`Mensaje recibido de la cola ${queue}:`, content);

    //             // Proporcionamos un "ack" manual para el callback
    //             const ack = () => {
    //                 channel.ack(msg);
    //             };

    //             // Llamar al callback con el tipo correcto
    //             onMessage(content, ack);
    //         }
    //     });
    // }


    /**
   * Consume mensajes de una cola enlazada a un exchange.
   * Permite que el callback sea async y retorne Promise<void>.
   */
    public async consumeQueue<T extends ActionKeys>(
        queueName: string,
        onMessage: (
            content: ActionPayloads[T],
            rawMsg: ConsumeMessage,
            ack: () => void,
            nack: (requeue?: boolean) => void
        ) => Promise<void>
    ): Promise<void> {
        const channel: Channel = await this.connect();

        await channel.consume(
            queueName,
            async (msg) => {
                if (!msg) return;

                const content = JSON.parse(msg.content.toString()) as ActionPayloads[T];
                const ack = () => channel.ack(msg);
                const nack = (requeue = false) => channel.nack(msg, false, requeue);

                try {
                    await onMessage(content, msg, ack, nack);
                } catch (err) {
                    console.error(`[consumeQueue] Handler error:`, err);
                    // si no lo haces tú, reintentamos una sola vez
                    nack(/* requeue? */);
                }
            },
            { noAck: false }
        );
    }
}
