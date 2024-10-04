import { ActionKeys, ActionPayloads } from "../actions/rabbitmq.action";
import { RabbitMQKeys } from "../keys/rabbitmq.keys";
import { RabbitMQService } from "../rabbitmq.service";

type QueueKeys = keyof typeof RabbitMQKeys; // Crear un tipo a partir de las claves de RabbitMQKeys

export class RabbitMQFacade {
    private static _instance: RabbitMQFacade;

    private constructor() { }

    public static get instance(): RabbitMQFacade {
        if (!this._instance) {
            this._instance = new RabbitMQFacade();
        }
        return this._instance;
    }

    // Asegurar que la cola esté creada, con el tipo derivado de las keys
    public async assertQueue(queueKey: QueueKeys, durable: boolean = true): Promise<void> {
        const channel = await RabbitMQService.instance.connect();
        const queue = RabbitMQKeys[queueKey](); // Obtener la cola a partir de la key
        await channel.assertQueue(queue, { durable });
        console.log(`Queue ${queue} asegurada`);
    }

    // Enviar un mensaje a una cola específica y tipada
    public async sendToQueue<T extends ActionKeys>(
        queueKey: QueueKeys, // Solo permite usar las keys definidas
        message: ActionPayloads[T],
        persistent: boolean = true // El tipo del mensaje depende del tipo de payload esperado
    ): Promise<void> {
        const channel = await RabbitMQService.instance.connect();
        const queue = RabbitMQKeys[queueKey](); // Obtener la cola a partir de la key
        const content = Buffer.from(JSON.stringify(message));
        await channel.sendToQueue(queue, content, { persistent });
        console.log(`Mensaje enviado a la cola ${queue}:`, message);
    }

    // Consumir mensajes de una cola con un callback tipado
    public async consumeQueue<T extends ActionKeys>(
        queueKey: QueueKeys, // Solo acepta colas con las keys definidas
        onMessage: (msg: ActionPayloads[T], ack: () => void) => void // El callback usa el tipo de payload correspondiente y ack para confirmar el mensaje
    ): Promise<void> {
        const channel = await RabbitMQService.instance.connect();
        const queue = RabbitMQKeys[queueKey](); // Obtener la cola a partir de la key
        await channel.consume(queue, (msg) => {
            if (msg) {
                const content = JSON.parse(msg.content.toString()) as ActionPayloads[T];
                console.log(`Mensaje recibido de la cola ${queue}:`, content);

                // Proporcionamos un "ack" manual para el callback
                const ack = () => {
                    channel.ack(msg);
                };

                // Llamar al callback con el tipo correcto
                onMessage(content, ack);
            }
        });
    }
}
