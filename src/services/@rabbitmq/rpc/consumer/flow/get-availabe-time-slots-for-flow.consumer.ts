// import amqplib, { Channel, Message } from 'amqplib';
// import moment from 'moment-timezone';
// import prisma from "../../../../../lib/prisma";
// import { RabbitMQKeys } from "../../../keys/rabbitmq.keys";
// import { RabbitMQService } from "../../../rabbitmq.service";
// import { ActionPayloads } from '../../../actions/rabbitmq.action';
// import { BusinessHoursType, WorkerHoursMapType } from '../../../../../models/interfaces';
// import { BusinessHoursStrategy } from '../../../../@redis/cache/strategies/businessHours/businessHours.strategy';
// import { WorkerHoursStrategy } from '../../../../@redis/cache/strategies/workerHours/workerHours.strategy';
// import { TIME_SECONDS } from '../../../../../constant/time';
// import { TemporaryHoursMapType } from '../../../../../models/interfaces/temporary-business-hours-type';
// import { TemporaryHoursStrategy } from '../../../../@redis/cache/strategies/temporaryHours/temporaryHours.strategy';
// import { BusinessHourService } from '../../../../@database/all-business-services/business-hours/business-hours.service';
// import { WorkerBusinessHourService } from '../../../../@database/all-business-services/worker-business-hours/worker-business-hours.service';
// import { TemporaryBusinessHourService } from '../../../../@database/all-business-services/temporary-business-hour/temporary-business-hour.service';
// import CustomError from '../../../../../models/custom-error/CustomError';
// import { CONSOLE_COLOR } from '../../../../../constant/console-color';
// import e from 'express';

// /**
//  * Función para obtener los slots de tiempo disponibles para una cita.
//  * Ajustada para considerar los horarios de negocio cuando no hay horarios específicos del trabajador.
//  * 
//  * MS-Chat - MS-Calendar
//  */
// export async function getAvailableTimeSlots() {

//     const businessHoursService = new BusinessHourService();
//     const workerHoursService = new WorkerBusinessHourService();
//     const temporaryHoursService = new TemporaryBusinessHourService();

//     const service = RabbitMQService.instance;
//     const channel: Channel = await service.connect();
//     const queueName = RabbitMQKeys.handleRpcGetAvaiableTimeSlotsForFlowQueue();

//     await channel.assertQueue(queueName, { durable: true });
//     console.log(`Waiting for RPC requests on ${queueName}`);

//     channel.consume(queueName, async (msg: Message | null) => {
//         if (msg) {
//             const content = JSON.parse(msg.content.toString());
//             const { payload } = content;
//             const {
//                 idCompany,
//                 idWorkspace,
//                 idCategory,
//                 idService,
//                 workspaceTimeZone,
//                 timeService,
//                 idUser,
//                 date,
//                 daysAhead = 0,
//                 idEventPrevent,
//             } = payload as ActionPayloads['requestGetAvaiableTimeSlotsForFlow'];

//             try {
//                 console.log("Processing request for available time slots:", payload);

//                 // Paso 1: Obtener la duración del servicio
//                 const serviceDuration = timeService; // Duración en minutos
//                 const intervalMinutes = 30; // Cambia a 15 si es necesario en el futuro

//                 // Paso 2: Obtener los IDs de los usuarios que pueden realizar el servicio
//                 let usersToConsider: string[] = [];

//                 if (idUser === "Cualquiera") {
//                     // Obtener todos los usuarios del establecimiento que pueden realizar el servicio
//                     usersToConsider = await getUsersWhoCanPerformService(idWorkspace, idService, idCategory);
//                 } else {
//                     usersToConsider = [idUser];
//                 }

//                 console.log("Users who can perform the service:", usersToConsider);

//                 // Paso 3: Obtener los horarios de negocio
//                 // TODO: 01/12/24 Se ha introducido el idWorkspace para obtener el horario de un establecimiento en concreto.
//                 const businessHours = await businessHoursService
//                     .getBusinessHoursFromRedis(idCompany, idWorkspace);

//                 // console.log("Business hours for the company:", businessHours);
//                 // Paso 4: Obtener los horarios de los trabajadores
//                 const workerHoursMap = await workerHoursService
//                     .getWorkerHoursFromRedis(usersToConsider, idCompany);

//                 console.log("Worker hours for the users:", workerHoursMap);

//                 const temporaryHoursMap = await temporaryHoursService
//                     .getTemporaryHoursFromRedis(usersToConsider, idCompany);

//                 /**
//                  * Paso 5: Obtener los eventos existentes para los usuarios y fechas en cuestión
//                  * Si se agrega idEventPrevent, no se cuenta como evento existente. Esto es para que devuelva 
//                  * los slots de tiempo disponibles para editar una cita.
//                  */
//                 console.log("mando idPrevent", idEventPrevent, serviceDuration, date, daysAhead, usersToConsider);
//                 const events = await getEventsForUsersAndDates(usersToConsider, date, daysAhead, idEventPrevent);


//                 console.log("Events for the users and dates:", events);
//                 // console.log("Events for the users and dates:", events);

//                 // Paso 6: Generar los slots de tiempo disponibles
//                 const timeSlots = generateAvailableTimeSlots(
//                     {
//                         dateSelected: date,
//                         serviceDuration,
//                         usersToConsider,
//                         daysAhead,
//                         intervalMinutes,
//                         businessHours,
//                         workerHoursMap,
//                         temporaryHoursMap,
//                         events,
//                         workspaceTimeZone,
//                     }
//                 );

//                 console.log("Available time slots:", timeSlots);

//                 // Paso 7: Enviar la respuesta
//                 channel.sendToQueue(msg.properties.replyTo, Buffer.from(JSON.stringify({ timeSlots })), {
//                     correlationId: msg.properties.correlationId,
//                     contentType: 'application/json',
//                     deliveryMode: 2, // Persistente
//                 });

//                 channel.ack(msg);

//             } catch (error: any) {
//                 console.error("Error processing request:", error);
//                 // Enviar un mensaje de error al cliente
//                 channel.sendToQueue(msg.properties.replyTo, Buffer.from(JSON.stringify({ error: error.message })), {
//                     correlationId: msg.properties.correlationId,
//                     contentType: 'application/json',
//                     deliveryMode: 2, // Persistente
//                 });
//                 channel.ack(msg);
//             }
//         }
//     });
// }

// // Función para obtener los usuarios que pueden realizar el servicio
// // async function getUsersWhoCanPerformService(idWorkspace: string, idService: number): Promise<string[]> {
// //     // Implementa la lógica para obtener los usuarios desde la base de datos

// //     const users = await prisma.userService.findMany({
// //         where: {
// //             idServiceFk: idService,
// //             service: {
// //                 idWorkspaceFk: idWorkspace
// //             },
// //         },
// //         select: {
// //             idUserFk: true,
// //         },
// //     });

// //     const userIds = users.map(u => u.idUserFk);
// //     return Array.from(new Set(userIds)); // Eliminar duplicados
// // }

// async function getUsersWhoCanPerformService(
//     idWorkspace: string,
//     idService: string,
//     idCategory: string
// ): Promise<string[]> {
//     try {
//         // const result = await prisma.categoryWorkspace.findMany({
//         //     where: {
//         //         idCategoryFk: idCategory,
//         //         idWorkspaceFk: idWorkspace,
//         //     },
//         //     select: {
//         //         category: {
//         //             select: {
//         //                 service: {
//         //                     where: {
//         //                         id: idService, // Filtrar por el servicio específico
//         //                     },
//         //                     select: {
//         //                         userServices: {
//         //                             select: {
//         //                                 idUserFk: true, // Obtener los IDs de usuarios
//         //                             },
//         //                         },
//         //                     },
//         //                 },
//         //             },
//         //         },
//         //     },
//         // });

//         const result = await prisma.category.findMany({
//             where: {
//                 id: idCategory,
//                 idWorkspaceFk: idWorkspace,
//             },
//             select: {
//                 id: true,
//                 name: true,
//                 categoryServices: {
//                     where: {
//                         deletedDate: null,
//                         service: {
//                             deletedDate: null,
//                             id: idService, // Filtrar por el servicio específico
//                             userServices: {
//                                 some: {}, // Asegurarse de que hay usuarios asociados
//                             },
//                         },
//                     },
//                     select: {
//                         service: {
//                             select: {
//                                 userServices: {                 
//                                     select: {
//                                         idUserFk: true, // Obtener los IDs de usuarios
//                                     },
//                                 },
//                             },
//                         },
//                     },  
//                 }
                
//                 // category: {
//                 //     select: {
//                 //         service: {
//                 //             where: {
//                 //                 id: idService, // Filtrar por el servicio específico
//                 //             },
//                 //             select: {
//                 //                 userServices: {
//                 //                     select: {
//                 //                         idUserFk: true, // Obtener los IDs de usuarios
//                 //                     },
//                 //                 },
//                 //             },
//                 //         },
//                 //     },
//                 // },
//             },
//         });

//         // Extraer los IDs de usuario de los resultados
//         const userIds = result
//             .flatMap((ce) =>
//                 ce.categoryServices.flatMap((cs) =>
//                     cs.service.userServices.map((userService) => userService.idUserFk)
//                 )
//             );

//         // Eliminar duplicados y retornar los IDs de usuario
//         return Array.from(new Set(userIds));
//     } catch (error: any) {
//         throw new CustomError('getUsersWhoCanPerformService', error);
//     }
// }


// /**
//  * Función para obtener los eventos existentes para los usuarios y fechas
//  * 
//  * @param userIds 
//  * @param dateSelected 
//  * @param daysAhead 
//  * @param idEventPrevent Sirve para cuando se va a editar una cita, recibir los datos de ella y no contarla como ocupada
//  * @returns 
//  */
// async function getEventsForUsersAndDates(
//     userIds: string[],
//     dateSelected: string,
//     daysAhead: number,
//     idEventPrevent?: string
// ): Promise<Event[]> {
//     const startDate = moment.utc(dateSelected).startOf('day').toDate();
//     const endDate = moment.utc(dateSelected).add(daysAhead, 'days').endOf('day').toDate();

//     console.log("Fetching events from", startDate, "to", endDate);

//     const whereClause: any = {
//         idUserPlatformFk: { in: userIds },
//         startDate: { gte: startDate, lte: endDate },
//         deletedDate: null,
//     };
//     console.log("que es preventEvent", idEventPrevent);
//     if (idEventPrevent !== undefined && idEventPrevent !== null && !Number.isNaN(Number(idEventPrevent))) {
//         whereClause.id = { not: Number(idEventPrevent) };
//     }

//     const events = await prisma.event.findMany({ where: whereClause });
//     console.log("Returned events:", events);

//     return events;
// }

// // Definimos el tipo para los eventos
// interface Event {
//     id: string;
//     idUserPlatformFk: string;
//     startDate: Date;
//     endDate: Date;
// }


// // Función para generar los slots de tiempo disponibles
// function generateAvailableTimeSlots(params: {
//     dateSelected: string;
//     serviceDuration: number;
//     usersToConsider: string[];
//     daysAhead: number;
//     intervalMinutes: number;
//     businessHours: BusinessHoursType;
//     workerHoursMap: WorkerHoursMapType;
//     temporaryHoursMap: TemporaryHoursMapType;
//     events: Event[];
//     workspaceTimeZone: string;
// }): { id: string; title: string; metadata?: string; description?: string }[] {

//     const {
//         dateSelected,
//         serviceDuration,
//         usersToConsider,
//         daysAhead,
//         intervalMinutes,
//         businessHours,
//         workerHoursMap,
//         temporaryHoursMap,
//         events,
//         workspaceTimeZone = "Europe/Madrid",
//     } = params;

//     const timeSlots: { id: string; title: string; metadata?: string; description?: string }[] = [];

//     console.log(" ");
//     console.log(`${CONSOLE_COLOR.FgYellow} -- Recordatorio: Hay que comprobar que los días del trabajador y excepciones que reciban "null" en vez de un array significa que ese día no trabajan`);
//     console.log(" ");
//     console.log(`${CONSOLE_COLOR.FgYellow} -- Recordatorio: Hay que comprobar que los días del trabajador y excepciones que reciban "null" en vez de un array significa que ese día no trabajan`);
//     console.log(" ");
//     console.log(`${CONSOLE_COLOR.FgYellow} -- Recordatorio: Hay que comprobar que los días del trabajador y excepciones que reciban "null" en vez de un array significa que ese día no trabajan`);
//     console.log(" ");
//     console.log(`${CONSOLE_COLOR.FgYellow} -- Recordatorio: Hay que comprobar que los días del trabajador y excepciones que reciban "null" en vez de un array significa que ese día no trabajan`);
//     console.log(`${CONSOLE_COLOR.Reset}`);
//     console.log(" ");

//     // Iterar sobre los días desde la fecha seleccionada hasta el número de días especificado
//     for (let dayOffset = 0; dayOffset <= daysAhead; dayOffset++) {
//         // Al parsear la fecha, se usa la zona horaria del establecimiento
//         const currentDate = moment.tz(dateSelected, 'YYYY-MM-DD', workspaceTimeZone).add(dayOffset, 'days');
//         const currentDateStr = currentDate.format('YYYY-MM-DD');
//         const currentWeekDay = currentDate.format('dddd').toUpperCase(); // Día de la semana en inglés (ej.: 'MONDAY')

//         // Obtener los horarios de negocio para el día actual
//         const dayBusinessHours = businessHours[currentWeekDay] || [];

//         // Si el negocio está cerrado, continuar al siguiente día
//         if (dayBusinessHours.length === 0) continue;

//         // Mapear eventos por usuario para el día actual
//         const userEventsMap: { [userId: string]: Event[] } = {};
//         usersToConsider.forEach(uid => {
//             userEventsMap[uid] = events.filter(event => {
//                 return (
//                     event.idUserPlatformFk === uid &&
//                     moment.utc(event.startDate).format('YYYY-MM-DD') === currentDateStr
//                 );
//             });
//         });

//         // Generar slots de tiempo basados en el horario de trabajo de cada usuario
//         for (const uid of usersToConsider) {
//             let workShifts: string[][] = [];
//             const userTemporaryHours = temporaryHoursMap[uid]?.[currentDateStr];
//             console.log("currentDateStr", currentDateStr);
//             console.log("uid", uid);
//             console.log("userTemporaryHours", userTemporaryHours);

//             if (userTemporaryHours === null) {
//                 // El trabajador está cerrado en esta fecha
//                 console.log(`El trabajador ${uid} está cerrado el día ${currentDateStr} según horarios temporales.`);
//                 continue; // Pasar al siguiente usuario
//             } else if (Array.isArray(userTemporaryHours) && userTemporaryHours.length > 0) {
//                 // Usar los horarios temporales disponibles
//                 workShifts = userTemporaryHours;
//             } else {
//                 // Obtener los horarios del trabajador para el día actual
//                 workShifts = workerHoursMap[uid]?.[currentWeekDay] || [];

//                 // Si el trabajador no tiene horarios específicos para ese día, usar los horarios de negocio
//                 if (!workShifts || workShifts.length === 0) {
//                     workShifts = dayBusinessHours || [];
//                 }

//                 // Si después de considerar los horarios de negocio, aún no hay horarios, continuar al siguiente usuario
//                 if (!workShifts || workShifts.length === 0) continue;
//             }

//             // Obtener los eventos del usuario para el día actual
//             const userEvents = userEventsMap[uid];

//             // Iterar sobre cada bloque de horario del trabajador
//             for (const shift of workShifts) {
//                 // shift es un arreglo [startTime, endTime]
//                 const shiftStartStr = shift[0]; // Ej.: '03:00:00'
//                 const shiftEndStr = shift[1];   // Ej.: '14:00:00'

//                 // Se parsean primero como UTC (ya que se guardan en UTC) y luego se transforman
//                 // a la zona horaria del establecimiento. Esto evita aplicar un desfase incorrecto.
//                 const shiftStart = moment.utc(`${currentDateStr}T${shiftStartStr}`, 'YYYY-MM-DDTHH:mm:ss').tz(workspaceTimeZone);
//                 const shiftEnd = moment.utc(`${currentDateStr}T${shiftEndStr}`, 'YYYY-MM-DDTHH:mm:ss').tz(workspaceTimeZone);

//                 // console.log("0a shiftStartSty", shiftStartStr);
//                 // console.log("0a shiftEndStr", shiftEndStr);
//                 // console.log("aShift start:", shiftStart.format());
//                 // console.log("aShift end:", shiftEnd.format());

//                 let slotTime = shiftStart.clone();

//                 // NUEVO 12/04/2025
//                 // Si el día que estamos generando es "hoy", saltar horas pasadas
//                 if (dayOffset === 0) {
//                     const nowLocal = moment.tz(workspaceTimeZone);
//                     if (slotTime.isBefore(nowLocal)) {
//                         slotTime = nowLocal.clone();
//                     }
//                 }



//                 // Generar slots dentro del turno
//                 while (slotTime.isBefore(shiftEnd)) {
//                     const slotEndTime = slotTime.clone().add(serviceDuration, 'minutes');

//                     // Si el servicio no cabe en el tiempo restante del turno, salir del bucle
//                     if (slotEndTime.isAfter(shiftEnd)) {
//                         break;
//                     }

//                     // Verificar solapamiento con eventos existentes
//                     let isSlotAvailable = true;
//                     console.log("Este es el id", uid);
//                     for (const event of userEvents) {
//                         console.log("id evento", event.id);
//                         const eventStart = moment.utc(event.startDate);
//                         const eventEnd = moment.utc(event.endDate);

//                         // console.log("eventStart", eventStart.format());
//                         // console.log("eventEnd", eventEnd.format());

//                         if (
//                             slotTime.isBefore(eventEnd) &&
//                             slotEndTime.isAfter(eventStart)
//                         ) {
//                             isSlotAvailable = false;
//                             break;
//                         }
//                     }

//                     if (isSlotAvailable) {
//                         const timeSlotStr = slotTime.format('HH:mm');
//                         const slotId = `${currentDateStr} ${timeSlotStr}`;
//                         // Para metadata se muestra el día de la semana (en español) si se generan slots en varios días
//                         const metadata = daysAhead ? currentDate.locale("es").format('dddd').toUpperCase() : "";

//                         timeSlots.push({
//                             id: slotId,
//                             title: timeSlotStr,
//                             metadata: metadata,
//                             description: `${currentDate.format('DD/MM/YYYY')}`,
//                         });
//                     }

//                     // Avanzar al siguiente intervalo
//                     slotTime.add(intervalMinutes, 'minutes');
//                 }
//             }
//         }
//     }

//     // Eliminar posibles duplicados en los slots
//     const uniqueTimeSlots = Array.from(
//         new Map(timeSlots.map(item => [item.id, item])).values()
//     );

//     // Ordenar los slots por fecha y hora
//     uniqueTimeSlots.sort((a, b) => {
//         const dateA = moment.utc(a.id, 'YYYY-MM-DD HH:mm');
//         const dateB = moment.utc(b.id, 'YYYY-MM-DD HH:mm');
//         return dateA.diff(dateB);
//     });

//     return uniqueTimeSlots;
// }



// // // Función para generar los slots de tiempo disponibles
// // function generateAvailableTimeSlots(params: {
// //     dateSelected: string;
// //     serviceDuration: number;
// //     usersToConsider: string[];
// //     daysAhead: number;
// //     intervalMinutes: number;
// //     businessHours: BusinessHoursType;
// //     workerHoursMap: WorkerHoursMapType;
// //     temporaryHoursMap: TemporaryHoursMapType;
// //     events: Event[];
// //     workspaceTimeZone: string;
// // }): { id: string; title: string; metadata?: string; description?: string }[] {

// //     const {
// //         dateSelected,
// //         serviceDuration,
// //         usersToConsider,
// //         daysAhead,
// //         intervalMinutes,
// //         businessHours,
// //         workerHoursMap,
// //         temporaryHoursMap,
// //         events,
// //         workspaceTimeZone = "Europe/Madrid",
// //     } = params;

// //     const timeSlots: { id: string; title: string; metadata?: string; description?: string }[] = [];

// //     console.log(" ")
// //     console.log(`${CONSOLE_COLOR.FgYellow} -- Recordatorio: Hay que comprobar que los días del trabajador y excepciones que reciban "null" en vez de un array significa que ese día no trabajan`)
// //     console.log(" ")
// //     console.log(`${CONSOLE_COLOR.FgYellow} -- Recordatorio: Hay que comprobar que los días del trabajador y excepciones que reciban "null" en vez de un array significa que ese día no trabajan`)
// //     console.log(" ")
// //     console.log(`${CONSOLE_COLOR.FgYellow} -- Recordatorio: Hay que comprobar que los días del trabajador y excepciones que reciban "null" en vez de un array significa que ese día no trabajan`)
// //     console.log(" ")
// //     console.log(`${CONSOLE_COLOR.FgYellow} -- Recordatorio: Hay que comprobar que los días del trabajador y excepciones que reciban "null" en vez de un array significa que ese día no trabajan`)
// //     console.log(`${CONSOLE_COLOR.Reset}`)
// //     console.log(" ")

// //     // Iterar sobre los días desde la fecha seleccionada hasta el número de días especificado
// //     for (let dayOffset = 0; dayOffset <= daysAhead; dayOffset++) {
// //         // const currentDate = moment.utc(dateSelected).add(dayOffset, 'days');

// //         // NUEVO
// //         const currentDate = moment.tz(dateSelected, 'YYYY-MM-DD', workspaceTimeZone).add(dayOffset, 'days');

// //         const currentDateStr = currentDate.format('YYYY-MM-DD');
// //         const currentWeekDay = currentDate.format('dddd').toUpperCase(); // Día de la semana en inglés (e.g., 'MONDAY')

// //         // Obtener los horarios de negocio para el día actual
// //         const dayBusinessHours = businessHours[currentWeekDay] || [];

// //         // Si el negocio está cerrado, continuar al siguiente día
// //         if (dayBusinessHours.length === 0) continue;

// //         // Mapear eventos por usuario para el día actual
// //         const userEventsMap: { [userId: string]: Event[] } = {};
// //         usersToConsider.forEach(uid => {
// //             userEventsMap[uid] = events.filter(event => {
// //                 return (
// //                     event.idUserPlatformFk === uid &&
// //                     moment.utc(event.startDate).format('YYYY-MM-DD') === currentDateStr
// //                 );
// //             });
// //         });



// //         // Generar slots de tiempo basados en el horario de trabajo de cada usuario
// //         for (const uid of usersToConsider) {

// //             let workShifts: string[][] = [];

// //             const userTemporaryHours = temporaryHoursMap[uid]?.[currentDateStr];
// //             console.log("currentDateStr", currentDateStr);
// //             console.log("uid", uid);
// //             console.log("userTemporaryHours", userTemporaryHours);


// //             if (userTemporaryHours === null) {
// //                 // El trabajador está cerrado en esta fecha
// //                 console.log(`El trabajador ${uid} está cerrado el día ${currentDateStr} según horarios temporales.`);
// //                 continue; // Pasar al siguiente usuario
// //             } else if (Array.isArray(userTemporaryHours) && userTemporaryHours.length > 0) {
// //                 // Usar los horarios temporales disponibles
// //                 workShifts = userTemporaryHours;
// //             } else {
// //                 // Obtener los horarios del trabajador para el día actual
// //                 workShifts = workerHoursMap[uid]?.[currentWeekDay] || [];


// //                 // Si el trabajador no tiene horarios específicos para ese día, usar los horarios de negocio
// //                 if (!workShifts || workShifts.length === 0) {
// //                     workShifts = dayBusinessHours || [];
// //                 }

// //                 // Si después de considerar los horarios de negocio, aún no hay horarios, continuar al siguiente usuario
// //                 if (!workShifts || workShifts.length === 0) continue;

// //             }




// //             // Obtener los eventos del usuario para el día actual
// //             const userEvents = userEventsMap[uid];

// //             // Iterar sobre cada bloque de horario del trabajador
// //             for (const shift of workShifts) {


// //                 // console.log("Shift:", shift);
// //                 // shift es un arreglo [startTime, endTime]
// //                 const shiftStartStr = shift[0]; // 'HH:mm:ss'
// //                 const shiftEndStr = shift[1];   // 'HH:mm:ss'

// //                 // Crear objetos moment para las horas de inicio y fin del turno
// //                 // TODO: Esto está comentado ya que para Whatsapp es necesario saber la hora local del establecimiento
// //                 // const shiftStart = moment.utc(`${currentDateStr}T${shiftStartStr}`);
// //                 // const shiftEnd = moment.utc(`${currentDateStr}T${shiftEndStr}`);

// //                 // NUEVO
// //                 const shiftStart = moment.tz(`${currentDateStr}T${shiftStartStr}`, 'YYYY-MM-DDTHH:mm', workspaceTimeZone);
// //                 const shiftEnd = moment.tz(`${currentDateStr}T${shiftEndStr}`, 'YYYY-MM-DDTHH:mm', workspaceTimeZone);

// //                 console.log("aShift start:", shiftStart);
// //                 console.log("aShift end:", shiftEnd);

// //                 let slotTime = shiftStart.clone();

// //                 // console.log("Slot time:", slotTime);

// //                 // Generar slots dentro del turno
// //                 while (slotTime.isBefore(shiftEnd)) {
// //                     const slotEndTime = slotTime.clone().add(serviceDuration, 'minutes');

// //                     // Si el servicio no cabe en el tiempo restante del turno, salir del bucle
// //                     if (slotEndTime.isAfter(shiftEnd)) {
// //                         break;
// //                     }

// //                     // Verificar solapamiento con eventos existentes
// //                     let isSlotAvailable = true;

// //                     console.log("Este es el id", uid)
// //                     for (const event of userEvents) {
// //                         console.log("id evento", event.id)
// //                         const eventStart = moment.utc(event.startDate);
// //                         const eventEnd = moment.utc(event.endDate);


// //                         console.log("eventStart", eventStart);
// //                         console.log("eventEnd", eventEnd);

// //                         if (
// //                             slotTime.isBefore(eventEnd) &&
// //                             slotEndTime.isAfter(eventStart)
// //                         ) {
// //                             isSlotAvailable = false;
// //                             break;
// //                         }
// //                     }

// //                     if (isSlotAvailable) {
// //                         const timeSlotStr = slotTime.format('HH:mm');
// //                         const slotId = `${currentDateStr} ${timeSlotStr}`;
// //                         const metadata = daysAhead ? currentDate.locale("es").format('dddd').toUpperCase() : "";

// //                         timeSlots.push({
// //                             id: slotId,
// //                             title: timeSlotStr,
// //                             metadata: metadata,
// //                             description: `${currentDate.format('DD/MM/YYYY')}`,
// //                         });
// //                     }

// //                     // Avanzar al siguiente intervalo
// //                     slotTime.add(intervalMinutes, 'minutes');
// //                 }
// //             }
// //         }
// //     }

// //     // Eliminar posibles duplicados en los slots
// //     const uniqueTimeSlots = Array.from(
// //         new Map(timeSlots.map(item => [item.id, item])).values()
// //     );

// //     // Ordenar los slots por fecha y hora
// //     uniqueTimeSlots.sort((a, b) => {
// //         const dateA = moment.utc(a.id, 'YYYY-MM-DD HH:mm');
// //         const dateB = moment.utc(b.id, 'YYYY-MM-DD HH:mm');
// //         return dateA.diff(dateB);
// //     });

// //     return uniqueTimeSlots;
// // }

