import amqplib, { Channel, Message } from 'amqplib';
import { RabbitMQKeys } from "../../../../keys/rabbitmq.keys";
import { RabbitMQService } from "../../../../rabbitmq.service";
import { EventService } from '../../../../../@database/event/event.service';

import { BusinessHourService } from '../../../../../@database/all-business-services/business-hours/business-hours.service';
import { TemporaryBusinessHourService } from '../../../../../@database/all-business-services/temporary-business-hour/temporary-business-hour.service';
import { WorkerBusinessHourService } from '../../../../../@database/all-business-services/worker-business-hours/worker-business-hours.service';

import { addEventToCalendarHandler } from './functions/addEventToCalendarHandler';
import { deleteEventToCalendarHandler } from './functions/deleteEventToCalendarHandler';
import { updateEventToCalendarHandler } from './functions/updateEventToCalendarHandler';

export async function manageEventForFlowConsumer() {
    const eventService = new EventService();
    const businessHoursService = new BusinessHourService();
    const workerHoursService = new WorkerBusinessHourService();
    const temporaryHoursService = new TemporaryBusinessHourService();

    const service = RabbitMQService.instance;
    const channel: Channel = await service.connect();
    const queueName = RabbitMQKeys.handleRpcAddEventToCalendarQueue();

    await channel.assertQueue(queueName, { durable: true });
    console.log(`Waiting for RPC requests on ${queueName}`);

    channel.consume(queueName, async (msg: Message | null) => {
        if (msg) {
            try {
                let response: any;
                const content = JSON.parse(msg.content.toString());
                const { payload: payloadMsg } = content;
                const { type, payload } = payloadMsg;

                console.log("Received message:", content);
                switch (type) {
                    case 'add':
                        response = await addEventToCalendarHandler(payload, {
                            eventService,
                            businessHoursService,
                            workerHoursService,
                            temporaryHoursService
                        });
                        break;
                    case 'update':
                        response = await updateEventToCalendarHandler(payload, {
                            eventService,
                            businessHoursService,
                            workerHoursService,
                            temporaryHoursService
                        });
                        break;
                    case 'delete':
                        response = await deleteEventToCalendarHandler(payload, { eventService });
                        break;
                    default:
                        console.log("Tipo de operación desconocido.");
                        response = { status: 'UNKNOWN_TYPE' };
                        break;
                }

                // Envío centralizado de la respuesta
                channel.sendToQueue(
                    msg.properties.replyTo,
                    Buffer.from(JSON.stringify(response)),
                    {
                        correlationId: msg.properties.correlationId,
                        contentType: 'application/json',
                        deliveryMode: 2, // Persistente
                    }
                );
                channel.ack(msg);
            } catch (error) {
                console.error('Error processing message', error);
                channel.nack(msg, false, false);
            }
        }
    });
}


