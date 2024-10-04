import { RabbitMQService } from '../rabbitmq.service';
import { RabbitMQKeys } from '../keys/rabbitmq.keys';
import { CONSOLE_COLOR } from '../../../constant/console-color';

export const calendarConsumer = async (): Promise<void> => {
    const channel = await RabbitMQService.instance.connect();
    const queue = RabbitMQKeys.calendarQueue(); // Cola general de solicitudes al calendario

    await channel.assertQueue(queue, { durable: true });
    console.log(`Esperando mensajes en la cola: ${queue}`);

    channel.consume(queue, async (msg) => {
        if (msg !== null) {
            const content = JSON.parse(msg.content.toString());
            const { action, payload } = content;

            // console.log('Mensaje recibido:', content);
            console.log(`${CONSOLE_COLOR.FgBlue}Procesando mensaje: ${action}${CONSOLE_COLOR.Reset}`);

            if (action === 'requestAvailableAppointments') {
                const { userId, dateRange } = payload;
                // console.log(`Procesando solicitud de citas para el usuario: ${userId} en el rango: ${dateRange}`);

                console.log(`${CONSOLE_COLOR.FgBlue}Solicitud de citas para el usuario: ${userId}${CONSOLE_COLOR.Reset}`);

                // Simulación de citas disponibles
                const availableAppointments = [
                    '2023-09-01 10:00 AM',
                    '2023-09-02 02:00 PM',
                    '2023-09-03 09:00 AM'
                ];

                // Crear la respuesta para el usuario
                const responseMessage = {
                    action: 'responseAvailableAppointments',
                    payload: {
                        userId,
                        availableAppointments
                    }
                };

                setTimeout(() => {
                    // Publicar la respuesta en la cola reply-to que recibimos con el mensaje original
                    channel.sendToQueue(msg.properties.replyTo, Buffer.from(JSON.stringify(responseMessage)), {
                        correlationId: msg.properties.correlationId // Mantener el mismo correlationId
                    });
                }, 6000)

                console.log(`Citas enviadas al usuario: ${userId} en la cola: ${msg.properties.replyTo}`);
            }

            channel.ack(msg); // Confirmar el procesamiento del mensaje
        }
    });
}
