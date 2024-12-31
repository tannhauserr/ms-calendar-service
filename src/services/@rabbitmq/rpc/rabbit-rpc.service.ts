import amqplib, { Channel, Message } from 'amqplib';
import { ActionKeys, ActionPayloads } from '../actions/rabbitmq.action';
import { RabbitMQService } from '../rabbitmq.service';

export class RabbitRpcService {
    private static _instance: RabbitRpcService;
    private channel!: Channel;

    private constructor() {
        this.init();
    }

    // Método estático para obtener la instancia Singleton
    public static get instance(): RabbitRpcService {
        if (!this._instance) {
            this._instance = new RabbitRpcService();
        }
        return this._instance;
    }

    // Inicializa la conexión y el canal
    private async init() {
        try {
            const service = RabbitMQService.instance;
            this.channel = await service.connect();
        } catch (error) {
            console.error('Error initializing RabbitMQ connection:', error);
            throw error;
        }
    }

     /**
     * Enviar una acción RPC a una cola específica.
     * @param queueName - Nombre de la cola a la que se enviará el mensaje.
     * @param action - Tipo de acción a realizar.
     * @param payload - Datos del payload a enviar.
     * @param correlationId - ID de correlación opcional.
     * @param timeout - Tiempo en milisegundos antes de que la solicitud RPC expire.
     * @returns Promesa que resuelve con la respuesta del servidor.
     */
     public async sendRpc<Action extends ActionKeys>(
        queueName: string, // Ahora recibimos el nombre de la cola como argumento
        action: Action,
        payload: ActionPayloads[Action],
        correlationId: string,
        isPersistent: boolean = true,
        timeout: number = 10000 // Tiempo de espera predeterminado: 10 segundos
    ): Promise<any> {
        const channel = await RabbitMQService.instance.connect();

        const callbackQueue = await channel.assertQueue('', { exclusive: true });
        console.log("el queueName", queueName)
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error(`RPC request timed out after ${timeout}ms`));
            }, timeout);

            // Consumir la respuesta de la cola de retorno
            channel.consume(
                callbackQueue.queue,
                (msg: Message | null) => {
                    if (msg && msg.properties.correlationId === correlationId) {
                        clearTimeout(timeoutId);
                        resolve(JSON.parse(msg.content.toString()));
                    }
                },
                { noAck: true }
            );

            // Enviar la solicitud a la cola especificada
            channel.sendToQueue(queueName, Buffer.from(JSON.stringify({ action, payload })), {
                correlationId,
                replyTo: callbackQueue.queue,
                contentType: 'application/json',
                deliveryMode: isPersistent ? 2 : 1
            });
        });
    }

    /**
     * Cerrar la conexión a RabbitMQ.
     */
    public async close(): Promise<void> {
        await RabbitMQService.instance.close();
    }
}
