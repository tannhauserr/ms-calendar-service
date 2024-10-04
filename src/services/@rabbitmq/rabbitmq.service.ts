// rabbitmq.service.ts
import amqplib, { Connection, Channel } from 'amqplib';

export class RabbitMQService {
    private static _instance: RabbitMQService;
    private connection!: Connection;
    private channel!: Channel;
    private readonly host: string = process.env.RABBITMQ_HOST;
    private readonly port: number = Number(process.env.RABBITMQ_PORT) || 5672;
    private readonly user: string = process.env.RABBITMQ_USER;
    private readonly password: string = process.env.RABBITMQ_PASSWORD;

    private constructor() { }

    // Obtener la instancia Singleton
    public static get instance() {
        if (!this._instance) {
            this._instance = new this();
        }
        return this._instance;
    }

    // Conectar a RabbitMQ (si no está conectado)
    public async connect(): Promise<Channel> {
        if (!this.connection) {
            this.connection = await amqplib.connect({
                hostname: this.host,
                port: this.port,
                username: this.user,
                password: this.password
            });
            this.channel = await this.connection.createChannel();
            console.log('Conectado a RabbitMQ');
        }
        return this.channel;
    }

    // Cerrar la conexión (opcional)
    public async close(): Promise<void> {
        if (this.channel) {
            await this.channel.close();
        }
        if (this.connection) {
            await this.connection.close();
        }
        console.log('Conexión a RabbitMQ cerrada');
    }
}
