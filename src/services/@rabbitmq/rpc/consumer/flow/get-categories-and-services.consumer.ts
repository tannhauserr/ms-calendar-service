// import amqplib, { Channel, Message } from 'amqplib';
// import prisma from "../../../../../lib/prisma";
// import { RabbitMQKeys } from "../../../keys/rabbitmq.keys";
// import { RabbitMQService } from "../../../rabbitmq.service";


// export async function getCategoriesAndServices() {
//     const service = RabbitMQService.instance;
//     const channel: Channel = await service.connect();
//     const queueName = RabbitMQKeys.handleRpcGetCategoryAndServicesForFlowQueue();

//     await channel.assertQueue(queueName, { durable: true });
//     console.log(`Waiting for RPC requests on ${queueName}`);

//     channel.consume(queueName, async (msg: Message | null) => {
//         if (msg) {
//             const content = JSON.parse(msg.content.toString());
//             const { payload } = content;
//             const { idEstablishment } = payload;


//             // Fetch Categories, Services, and User IDs
//             const categories = await prisma.category.findMany({
//                 where: {
//                     idEstablishmentFk: idEstablishment,
//                     deletedDate: null,
//                     // Filtra categorías que tengan al menos un servicio
//                     services: {
//                         some: {
//                             deletedDate: null,
//                             userServices: {
//                                 some: {}, 
//                             },
//                         },
//                     },
//                 },
//                 select: {
//                     id: true,
//                     name: true,
//                     services: {
//                         where: {
//                             deletedDate: null,
//                             userServices: {
//                                 some: {} 
//                             },
//                         },
//                         select: {
//                             id: true,
//                             name: true,
//                             price: true,
//                             duration: true,
//                             userServices: {
//                                 select: {
//                                     id: true,
//                                     idUserFk: true,
//                                 },
//                             },
//                         },
//                     },
//                 },
//             });


//             console.log('categories:', JSON.stringify(categories, null, 2));

//             // Send the response
//             channel.sendToQueue(msg.properties.replyTo, Buffer.from(JSON.stringify(categories)), {
//                 correlationId: msg.properties.correlationId,
//                 contentType: 'application/json',
//                 deliveryMode: 2, // Persistente
//             });

//             channel.ack(msg);
//         }
//     });
// }


import amqplib, { Channel, Message } from 'amqplib';
import prisma from "../../../../../lib/prisma";
import { RabbitMQKeys } from "../../../keys/rabbitmq.keys";
import { RabbitMQService } from "../../../rabbitmq.service";

export async function getCategoriesAndServices() {
    const service = RabbitMQService.instance;
    const channel: Channel = await service.connect();
    const queueName = RabbitMQKeys.handleRpcGetCategoryAndServicesForFlowQueue();

    await channel.assertQueue(queueName, { durable: true });
    console.log(`Waiting for RPC requests on ${queueName}`);

    channel.consume(queueName, async (msg: Message | null) => {
        if (msg) {
            try {
                const content = JSON.parse(msg.content.toString());
                const { payload } = content;
                const { idEstablishment } = payload;

                // Fetch Categories, Services, and User IDs using the updated schema
                const categories = await prisma.category.findMany({
                    where: {
                        categoryEstablishment: {
                            some: {
                                idEstablishmentFk: idEstablishment,
                            },
                        },
                        deletedDate: null,
                        service: {
                            some: {
                                deletedDate: null,
                                userServices: {
                                    some: {}, // Ensure there are userServices linked
                                },
                            },
                        },
                    },
                    select: {
                        id: true,
                        name: true,
                        service: {
                            where: {
                                deletedDate: null,
                                userServices: {
                                    some: {}, // Filter services with associated users
                                },
                            },
                            select: {
                                id: true,
                                name: true,
                                price: true,
                                duration: true,
                                userServices: {
                                    select: {
                                        id: true,
                                        idUserFk: true,
                                    },
                                },
                            },
                        },
                    },
                });

                console.log('categories:', JSON.stringify(categories, null, 2));

                // Send the response
                channel.sendToQueue(msg.properties.replyTo, Buffer.from(JSON.stringify(categories)), {
                    correlationId: msg.properties.correlationId,
                    contentType: 'application/json',
                    deliveryMode: 2, // Persistente
                });

                channel.ack(msg);
            } catch (error) {
                console.error('Error processing message:', error);
                channel.nack(msg, false, false); // Discard the message if an error occurs
            }
        }
    });
}

