// import amqplib, { Channel, Message } from 'amqplib';
// import prisma from "../../../../../lib/prisma";
// import { RabbitMQKeys } from "../../../keys/rabbitmq.keys";
// import { RabbitMQService } from "../../../rabbitmq.service";
// import moment from 'moment';
// import { ModerationStatusType, Prisma } from '@prisma/client';

// /**
//  * Consumer que obtiene los eventos de un cliente para el flow.
//  *
//  * Recibe un objeto con la siguiente estructura:
//  *
//  *   requestGetEventsClient: {
//  *        idClient: string;
//  *        idClientWorkspace: string;
//  *        type: "all" | "active" | "past";
//  *   }
//  *
//  * La cola utilizada es:
//  *   handleRpcGeteventParticipantForFlowQueue: () => `rpc_get_event_client_for_flow_queue`
//  */
// export async function getEventsClientForFlowConsumer() {

//     const service = RabbitMQService.instance;
//     const channel: Channel = await service.connect();
//     const queueName = RabbitMQKeys.handleRpcGetEventParticipantForFlowQueue();

//     await channel.assertQueue(queueName, { durable: true });
//     console.log(`Esperando solicitudes RPC en ${queueName}`);

//     channel.consume(queueName, async (msg: Message | null) => {
//         if (msg) {
//             try {
//                 const content = JSON.parse(msg.content.toString());
//                 const { payload } = content;
//                 const { idClient, idClientWorkspace, type } = payload;

//                 console.log('Solicitud para obtener eventos del cliente recibida:', payload);

//                 const now = new Date();
//                 let events;

//                 let select: Prisma.EventSelect = {
//                     id: true,
//                     startDate: true,
//                     endDate: true,
//                     idUserPlatformFk: true,
//                     service: {
//                         select: {
//                             id: true,
//                             name: true,
//                             // category: {
//                             //     select: {
//                             //         id: true,
//                             //         name: true
//                             //     }
//                             // }
//                             categoryServices: {
//                                 select: {
//                                     category: {
//                                         select: {
//                                             id: true,
//                                             name: true,
//                                         }
//                                     }

//                                 }
//                             }
//                         },
//                         where: {
//                             deletedDate: null,
//                             // A la hora de pedir un evento en concreto no se filtrará por moderación en un principio
//                             // moderationStatusType: {
//                             //     in: [ModerationStatusType.ACCEPTED]
//                             // }
//                         }
//                     },

//                     calendar: {
//                         select: {
//                             idWorkspaceFk: true,
//                         },
//                         // where: {
//                         //     deletedDate: null
//                         // }
//                     },

//                     deletedDate: true
//                 }

//                 if (type === "all") {
//                     // Obtener todos los eventos del cliente (sin filtrar por fecha)
//                     events = await prisma.event.findMany({
//                         select,
//                         where: {
//                             // idClientFk: idClient,
//                             // idClientWorkspaceFk: idClientWorkspace,
//                             deletedDate: null,
//                             eventParticipant: {
//                                 some: {
//                                     idClientFk: idClient,
//                                     idClientWorkspaceFk: idClientWorkspace,
//                                     deletedDate: null
//                                 }
//                             }
//                         },
//                         orderBy: {
//                             startDate: 'asc'
//                         }
//                     });
//                 } else if (type === "active") {
//                     // Eventos activos: aquellos cuyo fin es mayor o igual a la fecha actual
//                     events = await prisma.event.findMany({
//                         select,
//                         where: {
//                             // idClientFk: idClient,
//                             // idClientWorkspaceFk: idClientWorkspace,
//                             endDate: { gte: now },
//                             deletedDate: null,
//                             eventParticipant: {
//                                 some: {
//                                     idClientFk: idClient,
//                                     idClientWorkspaceFk: idClientWorkspace,
//                                     deletedDate: null
//                                 }
//                             }
//                         },
//                         orderBy: {
//                             startDate: 'asc'
//                         }
//                     });
//                 } else if (type === "past") {
//                     // Eventos pasados: aquellos cuyo fin es menor a la fecha actual
//                     events = await prisma.event.findMany({
//                         select,
//                         where: {
//                             // idClientFk: idClient,
//                             // idClientWorkspaceFk: idClientWorkspace,
//                             endDate: { lt: now },
//                             deletedDate: null,
//                             eventParticipant: {
//                                 some: {
//                                     idClientFk: idClient,
//                                     idClientWorkspaceFk: idClientWorkspace,
//                                     deletedDate: null
//                                 }
//                             }
//                         },
//                         orderBy: {
//                             startDate: 'desc'
//                         }
//                     });
//                 } else {
//                     events = [];
//                 }

//                 console.log('Eventos encontrados:', events);

//                 // Enviar la respuesta con los eventos encontrados
//                 channel.sendToQueue(
//                     msg.properties.replyTo,
//                     Buffer.from(JSON.stringify({ events })),
//                     {
//                         correlationId: msg.properties.correlationId,
//                         contentType: 'application/json',
//                         deliveryMode: 2, // Persistente
//                     }
//                 );

//                 channel.ack(msg);
//             } catch (error) {
//                 console.error('Error al procesar el mensaje de eventos del cliente', error);
//                 channel.nack(msg, false, false); // Rechaza el mensaje y no se reencola
//             }
//         }
//     });
// }
