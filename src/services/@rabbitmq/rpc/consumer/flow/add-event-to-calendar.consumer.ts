// import amqplib, { Channel, Message } from 'amqplib';
// import prisma from "../../../../../lib/prisma";
// import { RabbitMQKeys } from "../../../keys/rabbitmq.keys";
// import { RabbitMQService } from "../../../rabbitmq.service";
// import { EventService } from '../../../../@database/event/event.service';
// import { EventSourceType, EventStatusType } from '@prisma/client';
// import moment from 'moment';
// import { BusinessHourService } from '../../../../@database/all-business-services/business-hours/business-hours.service';
// import { TemporaryBusinessHourService } from '../../../../@database/all-business-services/temporary-business-hour/temporary-business-hour.service';
// import { WorkerBusinessHourService } from '../../../../@database/all-business-services/worker-business-hours/worker-business-hours.service';
// import { CONSOLE_COLOR } from '../../../../../constant/console-color';

// export async function addEventToCalendarConsumer() {

//     const eventService = new EventService();
//     const businessHoursService = new BusinessHourService();
//     const workerHoursService = new WorkerBusinessHourService();
//     const temporaryHoursService = new TemporaryBusinessHourService();

//     const service = RabbitMQService.instance;
//     const channel: Channel = await service.connect();
//     const queueName = RabbitMQKeys.handleRpcAddEventToCalendarQueue();

//     await channel.assertQueue(queueName, { durable: true });
//     console.log(`Waiting for RPC requests on ${queueName}`);

//     channel.consume(queueName, async (msg: Message | null) => {
//         if (msg) {
//             try {
//                 const content = JSON.parse(msg.content.toString());
//                 const { payload } = content;
//                 const {
//                     idUserList = [],
//                     idClient,
//                     idCompany,
//                     idWorkspace,
//                     idService,
//                     eventStart,
//                     eventEnd,
//                     commentClient = ""
//                 } = payload;

//                 console.log('Adding event to calendar', payload);

//                 const startDate = moment(eventStart, 'YYYY-MM-DD HH:mm').toDate();
//                 const endDate = moment(eventEnd, 'YYYY-MM-DD HH:mm').toDate();

//                 // Obtener horarios de negocio, trabajadores y temporales
//                 const businessHours = await businessHoursService.getBusinessHoursFromRedis(idCompany, idWorkspace);
//                 const workerHoursMap = await workerHoursService.getWorkerHoursFromRedis(idUserList, idWorkspace);
//                 const temporaryHoursMap = await temporaryHoursService.getTemporaryHoursFromRedis(idUserList, idWorkspace);

//                 let selectedUser: string | null = null;

//                 // Iterar sobre idUserList y verificar disponibilidad de cada usuario
//                 for (const idUser of idUserList) {

//                     console.log(" ");
//                     console.log("mira el idUser", idUser);
//                     const isAvailable = await checkWorkerAvailability(
//                         idUser,
//                         idCompany,
//                         idWorkspace,
//                         startDate,
//                         endDate,
//                         businessHours,
//                         workerHoursMap[idUser],
//                         temporaryHoursMap[idUser]
//                     );

//                     console.log("Es disponible?", isAvailable)

//                     if (isAvailable) {
//                         selectedUser = idUser;
//                         break; // Seleccionar el primer trabajador disponible y salir del bucle
//                     }
//                 }

//                 console.log("mira cual es el selectedUser", selectedUser)

//                 if (!selectedUser) {
//                     console.log('No available user for the requested time slot');
//                     // No se genera evento, solo se manda cancelado para mostrar el "Error" en el FLOW
//                     // Enviar una respuesta de error
//                     channel.sendToQueue(msg.properties.replyTo, Buffer.from(JSON.stringify({ status: EventStatusType.CANCELLED })), {
//                         correlationId: msg.properties.correlationId,
//                         contentType: 'application/json',
//                         deliveryMode: 2, // Persistente
//                     });
//                     channel.ack(msg); // Confirmar el mensaje como procesado
//                     return;
//                 }

//                 // Crear el evento con el usuario seleccionado
//                 // const eventCreated = await eventService.addEvent({
//                 //     title: "Cita Bot",
//                 //     idUserPlatformFk: selectedUser,
//                 //     idClientFk: idClient,
//                 //     idClientWorkspaceFk: "MANDARLO AL CONSUMER",
//                 //     // idCompanyFk: idCompany,
//                 //     // idWorkspaceFk: idWorkspace,
//                 //     idServiceFk: idService && Number(idService) ? +idService : null,
//                 //     startDate,
//                 //     endDate,
//                 //     commentClient: commentClient.substring(0, 255),
//                 //     eventSourceType: EventSourceType.BOT,
//                 //     eventStatusType: EventStatusType.CONFIRMED
//                 // });

//                 const calendar = await prisma.calendar.upsert({
//                     where: {
//                         idCompanyFk_idWorkspaceFk: {
//                             idCompanyFk: idCompany,
//                             idWorkspaceFk: idWorkspace,
//                         },
//                     },
//                     update: {},
//                     create: {
//                         idCompanyFk: idCompany,
//                         idWorkspaceFk: idWorkspace,
//                     },
//                 });

//                 // Agregar el idCalendar al objeto del evento
//                 const eventData: any = {
//                     title: "Cita Bot",
//                     idUserPlatformFk: selectedUser,
//                     idClientFk: idClient,
//                     idClientWorkspaceFk: "MANDARLO_AL_CONSUMER",
//                     startDate,
//                     endDate,
//                     commentClient: commentClient.substring(0, 255),
//                     eventSourceType: EventSourceType.BOT,
//                     eventStatusType: EventStatusType.CONFIRMED,
//                     calendar: {
//                         connect: { id: calendar.id }
//                     },
//                 };

//                 if (idService && Number(idService)) {
//                     eventData.service = {
//                         connect: {
//                             id: Number(idService),
//                         },
//                     };
//                 }

//                 const eventCreated = await eventService.addEvent(eventData);

//                 // Enviar la respuesta de éxito
//                 channel.sendToQueue(msg.properties.replyTo, Buffer.from(JSON.stringify({ status: EventStatusType.CONFIRMED, event: eventCreated })), {
//                     correlationId: msg.properties.correlationId,
//                     contentType: 'application/json',
//                     deliveryMode: 2, // Persistente
//                 });

//                 channel.ack(msg);
//             } catch (error) {
//                 console.error('Error processing message', error);
//                 channel.nack(msg, false, false); // Reject the message and do not requeue
//             }
//         }
//     });
// }

// /**
//  * Verifica la disponibilidad de un trabajador para un intervalo de tiempo específico.
//  * @param idUser - El ID del trabajador a verificar
//  * @param idCompany - El ID de la empresa
//  * @param startDate - Fecha y hora de inicio del evento
//  * @param endDate - Fecha y hora de fin del evento
//  * @param businessHours - Horarios de negocio de la empresa
//  * @param workerHours - Horarios específicos del trabajador
//  * @param temporaryHours - Horarios temporales o excepcionales del trabajador
//  * @returns - `true` si el trabajador está disponible, `false` de lo contrario
//  */
// async function checkWorkerAvailability(
//     idUser: string,
//     idCompany: string,
//     idWorkspace: string,
//     startDate: Date,
//     endDate: Date,
//     businessHours: any,
//     workerHours: any,
//     temporaryHours: any
// ): Promise<boolean> {
//     const dayOfWeek = moment(startDate).format('dddd').toUpperCase(); // e.g., 'TUESDAY'
//     const timeSlot: [string, string] = [moment(startDate).format('HH:mm'), moment(endDate).format('HH:mm')];

//     // Verificar disponibilidad según horarios temporales
//     console.log("Verificando horarios temporales");
//     const dateStr = moment(startDate).format('YYYY-MM-DD');
//     if (temporaryHours[dateStr] !== undefined) {
//         // Si existe un horario temporal
//         if (temporaryHours[dateStr] === null) {
//             console.log("No disponible por horario temporal cerrado");
//             return false; // Día cerrado temporalmente para este trabajador
//         }
//         if (!isWithinBusinessHours(timeSlot, temporaryHours[dateStr])) {
//             console.log("No disponible por horario temporal");
//             return false;
//         }
//     } else if (workerHours[dayOfWeek] !== undefined) {
//         // Si no hay horario temporal, verificar según el horario del trabajador
//         console.log("Verificando horarios del trabajador");
//         if (!isWithinBusinessHours(timeSlot, workerHours[dayOfWeek])) {
//             console.log("No disponible por horarios del trabajador");
//             return false;
//         }
//     } else {
//         // Si no hay horario temporal ni del trabajador, verificar según el horario de negocio
//         console.log("Verificando horarios de negocio");
//         if (!businessHours[dayOfWeek] || !isWithinBusinessHours(timeSlot, businessHours[dayOfWeek])) {
//             console.log("No disponible por horarios de negocio");
//             return false;
//         }
//     }

//     // Verificar si el trabajador ya tiene eventos en conflicto en el horario solicitado
//     console.log("Verificando eventos en conflicto");
//     const conflictingEvents = await prisma.event.findMany({
//         where: {
//             idUserPlatformFk: idUser,
//             // idCompanyFk: idCompany,
//             AND: [
//                 { startDate: { lt: endDate } },  // El inicio del nuevo evento es antes del fin de uno existente
//                 { endDate: { gt: startDate } }   // El fin del nuevo evento es después del inicio de uno existente
//             ]
//         }
//     });

//     console.log("Eventos en conflicto encontrados:", conflictingEvents);
//     return conflictingEvents.length === 0;
// }

// /**
//  * Verifica si el intervalo de tiempo está dentro de los horarios permitidos.
//  * @param timeSlot - El intervalo de tiempo a verificar [start, end]
//  * @param allowedHours - Lista de intervalos permitidos para el día
//  * @returns - `true` si el intervalo está permitido, `false` de lo contrario
//  */
// function isWithinBusinessHours(timeSlot: [string, string], allowedHours: string[][]): boolean {
//     if (!allowedHours || allowedHours.length === 0) {
//         return false; // Si no hay horarios permitidos, consideramos que no está disponible
//     }

//     const [start, end] = timeSlot.map(time => moment(time, 'HH:mm'));
//     return allowedHours.some(([allowedStart, allowedEnd]) => {
//         const allowedStartMoment = moment(allowedStart, 'HH:mm');
//         const allowedEndMoment = moment(allowedEnd, 'HH:mm');
//         return start.isSameOrAfter(allowedStartMoment) && end.isSameOrBefore(allowedEndMoment);
//     });
// }

