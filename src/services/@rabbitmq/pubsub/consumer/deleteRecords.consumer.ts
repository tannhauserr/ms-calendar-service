

import { RabbitPubSubService } from "../facade-pubsub/rabbit-pubsub.service";
import { Channel, ConsumeMessage } from "amqplib";

import prisma from "../../../../lib/prisma"; // Ajusta la ruta de tu instancia Prisma
import { RabbitMQKeys } from "../../keys/rabbitmq.keys";

/**
 * Consumer para borrar datos relacionados a "companies", "workspaces", "users", "clientWorkspaces" y "client"
 * dentro del microservicio de Calendar.
 */
export async function deleteRecordsConsumer(): Promise<void> {
    // 1) Obtenemos la instancia de nuestro servicio
    const rabbitPubSubService = RabbitPubSubService.instance;
    // Conectamos y obtenemos el channel para asserts directos
    const channel: Channel = await rabbitPubSubService.connect();

    // 2) Declaramos la cola (durable)
    const queueName = RabbitMQKeys.pubSubDeleteCalendarQueue();
    await channel.assertQueue(queueName, { durable: true });

    // 3) Declaramos (o aseguramos) el exchange.
    const exchangeName = RabbitMQKeys.pubSubDeleteExchange();
    await rabbitPubSubService.assertExchange(exchangeName, "direct", true);

    // 4) Hacemos el bind de la cola al exchange con el routing key correspondiente
    await rabbitPubSubService.bindQueueToExchange(
        queueName, // key de la cola en tu enum
        exchangeName,
        RabbitMQKeys.pubSubDeleteCalendarRoutingKey()
    );

    // 5) Consumimos la cola
    await rabbitPubSubService.consumeQueue<"requestDeleteRecords">(
        queueName,
        async ({ table, ids, idRelation }, msg: ConsumeMessage, ack, nack) => {
            try {

                console.log(`[Calendar-MS] Borrando registros de la tabla ${table} con IDs: ${ids.join(", ")}`);
                if (table === "companies") {
                    // Borrar en cascada registros relacionados a companies
                    await prisma.$transaction(async (tx) => {
                        for (const idCompany of ids) {
                            // 1. BusinessHour
                            await tx.businessHour.deleteMany({
                                where: { idCompanyFk: idCompany },
                            });

                            // 2. WorkerBusinessHour
                            await tx.workerBusinessHour.deleteMany({
                                where: { idCompanyFk: idCompany },
                            });

                            // 3. TemporaryBusinessHour
                            await tx.temporaryBusinessHour.deleteMany({
                                where: { idCompanyFk: idCompany },
                            });

                            // 4. WorkerAbsence
                            await tx.workerAbsence.deleteMany({
                                where: { idCompanyFk: idCompany },
                            });

                            // 5. Calendars y sus Events asociados
                            const calendars = await tx.calendar.findMany({
                                where: { idCompanyFk: idCompany },
                                select: { id: true },
                            });
                            const calendarIds = calendars.map((c) => c.id);

                            // Borrar Events que referencian estos calendars
                            await tx.event.deleteMany({
                                where: {
                                    idCalendarFk: { in: calendarIds },
                                },
                            });
                            // Borrar los propios calendars
                            await tx.calendar.deleteMany({
                                where: { idCompanyFk: idCompany },
                            });

                            // 6. Services y sus UserServices asociados
                            const services = await tx.service.findMany({
                                where: { idCompanyFk: idCompany },
                                select: { id: true },
                            });
                            const serviceIds = services.map((s) => s.id);

                            // Borrar UserServices que referencian esos services
                            await tx.userService.deleteMany({
                                where: {
                                    idServiceFk: { in: serviceIds },
                                },
                            });
                            // Borrar los Services
                            await tx.service.deleteMany({
                                where: { idCompanyFk: idCompany },
                            });

                            // 7. Categories y sus CategoryWorkspaces asociados
                            const categories = await tx.category.findMany({
                                where: { idCompanyFk: idCompany },
                                select: { id: true },
                            });
                            const categoryIds = categories.map((cat) => cat.id);

                            // Borrar CategoryWorkspaces que referencian esas categorías
                            // await tx.categoryWorkspace.deleteMany({
                            //     where: {
                            //         idCategoryFk: { in: categoryIds },
                            //     },
                            // });

                            await tx.categoryService.deleteMany({
                                where: {
                                    category: {
                                        idCompanyFk: idCompany,
                                    },
                                    service: {
                                        idCompanyFk: idCompany,
                                    }
                                },
                            });

                            await tx.service.deleteMany({
                                where: {
                                    idCompanyFk: idCompany,
                                    // idCategoryFk: { in: categoryIds },
                                },
                            });

                            // Borrar las categorías
                            await tx.category.deleteMany({
                                where: { idCompanyFk: idCompany },
                            });
                        }
                    });
                    console.log(
                        `[Calendar-MS] Eliminados registros relacionados a companies con IDs: ${ids.join(", ")}`
                    );

                } else if (table === "workspaces") {
                    // Borrar en cascada registros relacionados a workspaces
                    await prisma.$transaction(async (tx) => {
                        for (const idWorkspace of ids) {
                            // 1. BusinessHour
                            await tx.businessHour.deleteMany({
                                where: { idWorkspaceFk: idWorkspace },
                            });

                            // 2. WorkerAbsence
                            await tx.workerAbsence.deleteMany({
                                where: { idWorkspaceFk: idWorkspace },
                            });

                            // 3. Calendars y sus Events asociados
                            const calendars = await tx.calendar.findMany({
                                where: { idWorkspaceFk: idWorkspace },
                                select: { id: true },
                            });
                            const calendarIds = calendars.map((c) => c.id);

                            // Borrar Events que referencian estos calendars
                            await tx.event.deleteMany({
                                where: {
                                    idCalendarFk: { in: calendarIds },
                                },
                            });
                            // Borrar los propios calendars
                            await tx.calendar.deleteMany({
                                where: { idWorkspaceFk: idWorkspace },
                            });

                            // 4. CategoryWorkspace
                            // await tx.categoryWorkspace.deleteMany({
                            //     where: { idWorkspaceFk: idWorkspace },
                            // });
                            // 1. Determinar cuáles son los IDs de los servicios de este establecimiento
                            const servicios = await tx.service.findMany({
                                where: { idWorkspaceFk: idWorkspace },
                                select: { id: true },
                            });
                            const serviceIds = servicios.map(s => s.id);

                            // 2. Determinar cuáles son los IDs de las categorías de este establecimiento
                            const categorias = await tx.category.findMany({
                                where: { idWorkspaceFk: idWorkspace },
                                select: { id: true },
                            });
                            const categoryIds = categorias.map(c => c.id);

                            // 3. Borrar todas las relaciones UserService donde el servicio pertenezca al establecimiento
                            if (serviceIds.length > 0) {
                                await tx.userService.deleteMany({
                                    where: {
                                        idServiceFk: { in: serviceIds },
                                    },
                                });
                            }

                            // 4. Borrar todas las relaciones CategoryService que apunten a:
                            //    – servicios de este establecimiento, o
                            //    – categorías de este establecimiento
                            //    (de este modo cubrimos cualquier pivote category⇄service donde al menos un lado
                            //     esté en el establecimiento que borramos)
                            if (serviceIds.length > 0) {
                                await tx.categoryService.deleteMany({
                                    where: {
                                        OR: [
                                            { idServiceFk: { in: serviceIds } },
                                            { idCategoryFk: { in: categoryIds } },
                                        ],
                                    },
                                });
                            }

                            // 5. Borrar los servicios de ese establecimiento
                            await tx.service.deleteMany({
                                where: { idWorkspaceFk: idWorkspace },
                            });

                            // 6. Borrar las categorías de ese establecimiento
                            await tx.category.deleteMany({
                                where: { idWorkspaceFk: idWorkspace },
                            });



                        }
                    });
                    console.log(
                        `[Calendar-MS] Eliminados registros relacionados a workspaces con IDs: ${ids.join(", ")}`
                    );
                } else if (table === "userWorkspaces-byWorkspace") {

                    await prisma.$transaction(async (tx) => {

                        // Obtenemos todos los calendarios de los establecimientos que se van a eliminar
                        const calendars = await tx.calendar.findMany({
                            where: { idWorkspaceFk: { in: ids } },
                            select: { id: true },
                        });

                        if (calendars.length === 0) {
                            // Mandar LOG si no se encuentran calendarios
                            console.log(`[Calendar-MS] No se encontraron calendarios para los establecimientos: ${ids.join(", ")}`);
                            return;
                        }

                        const calendarIds = calendars.map(c => c.id);
                        
                        // Borramos los eventos del usuario en estos establecimientos
                        await tx.event.deleteMany({
                            where: { idUserPlatformFk: idRelation, idCalendarFk: { in: calendarIds } },
                         
                        });

                        // Borramos los registros de horas de trabajo del usuario en estos establecimientos
                        await tx.workerBusinessHour.deleteMany({
                            where: { idUserFk: idRelation, idWorkspaceFk: { in: ids } },
                        });

                        // Borramos los registros de horas temporales del usuario en estos establecimientos
                        await tx.temporaryBusinessHour.deleteMany({
                            where: { idUserFk: idRelation, idWorkspaceFk: { in: ids } },
                        });

                        // Borramos las ausencias del usuario en estos establecimientos
                        await tx.workerAbsence.deleteMany({
                            where: { idUserFk: idRelation, idWorkspaceFk: { in: ids } },
                        });

                        // Borramos todos los servicios del usuario en estos establecimientos
                        await tx.userService.deleteMany({
                            where: { idUserFk: idRelation, service: { idWorkspaceFk: { in: ids } } },
                        });
                    });
                } else if (table === "userWorkspaces-byUser") {

                    // Borrar registros relacionados a userWorkspaces-byUser
                    // idRelation es el establecimiento
                    await prisma.$transaction(async (tx) => {
                        // Borrar los registros de horas de trabajo del usuario en este establecimiento
                        await tx.workerBusinessHour.deleteMany({
                            where: { idUserFk: { in: ids }, idWorkspaceFk: idRelation },
                        });

                        // Borrar los registros de horas temporales del usuario en este establecimiento
                        await tx.temporaryBusinessHour.deleteMany({
                            where: { idUserFk: { in: ids }, idWorkspaceFk: idRelation },
                        });

                        // Borrar las ausencias del usuario en este establecimiento
                        await tx.workerAbsence.deleteMany({
                            where: { idUserFk: { in: ids }, idWorkspaceFk: idRelation },
                        });

                        // Borrar los servicios del usuario en este establecimiento
                        await tx.userService.deleteMany({
                            where: { idUserFk: { in: ids }, service: { idWorkspaceFk: idRelation } },
                        });
                    });
                    console.log(
                        `[Calendar-MS] Eliminados registros relacionados a userWorkspaces-byUser con IDs: ${ids.join(", ")} en el establecimiento ${idRelation}`
                    );

                } else if (table === "clientWorkspaces" || table === "clients") {  // Para clientWorkspaces o client, se borran directamente los eventos asociados
                    await prisma.$transaction(async (tx) => {
                        if (table === "clientWorkspaces") {
                            await tx.event.deleteMany({
                                where: {
                                    // idClientWorkspaceFk: { in: ids }
                                    eventParticipant: {
                                        some: {
                                            idClientWorkspaceFk: { in: ids },
                                        }
                                    }
                                },
                            });
                        } else {
                            await tx.event.deleteMany({
                                where: {
                                    //  idClientFk: { in: ids }
                                    eventParticipant: {
                                        some: {
                                            idClientFk: { in: ids },

                                        }
                                    }
                                },
                            });
                        }
                    });
                    console.log(
                        `[Calendar-MS] Eliminados eventos relacionados a ${table} con IDs: ${ids.join(", ")}`
                    );

                } else if (table === "users") {
                    // Para users:
                    // 1. No se borran los eventos, sino que se actualiza el campo idUserPlatformFk a null.
                    // 2. Se borran registros relacionados al usuario en varias tablas.
                    await prisma.$transaction(async (tx) => {
                        // Actualizar eventos: poner a null el idUserPlatformFk donde corresponda
                        await tx.event.updateMany({
                            where: { idUserPlatformFk: { in: ids } },
                            data: { idUserPlatformFk: null },
                        });

                        // Borrar registros relacionados al usuario
                        await tx.workerBusinessHour.deleteMany({
                            where: { idUserFk: { in: ids } },
                        });
                        await tx.temporaryBusinessHour.deleteMany({
                            where: { idUserFk: { in: ids } },
                        });
                        await tx.workerAbsence.deleteMany({
                            where: { idUserFk: { in: ids } },
                        });
                        // await tx.userColor.deleteMany({
                        //     where: { idUserFk: { in: ids } },
                        // });
                        await tx.userService.deleteMany({
                            where: { idUserFk: { in: ids } },
                        });
                    });
                    console.log(
                        `[Calendar-MS] Actualizados eventos y eliminados registros relacionados a users con IDs: ${ids.join(", ")}`
                    );

                } else {
                    console.log(`[Calendar-MS] Tabla ${table} no procesada.`);
                }

                // Confirmamos el mensaje una vez finalizado el borrado
                ack();
            } catch (error) {
                console.error("[Calendar-MS] Error al procesar el borrado:", error);
                // No se llama a ack() para permitir reintentos o envío a DLQ
            }
        }
    );
}
