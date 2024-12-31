import amqplib, { Channel, Message } from 'amqplib';
import moment from 'moment-timezone';
import prisma from "../../../../../lib/prisma";
import { RabbitMQKeys } from "../../../keys/rabbitmq.keys";
import { RabbitMQService } from "../../../rabbitmq.service";
import { ActionPayloads } from '../../../actions/rabbitmq.action';
import { BusinessHoursType, WorkerHoursMapType } from '../../../../../models/interfaces';
import { BusinessHoursStrategy } from '../../../../@redis/cache/strategies/businessHours/businessHours.strategy';
import { WorkerHoursStrategy } from '../../../../@redis/cache/strategies/workerHours/workerHours.strategy';
import { TIME_SECONDS } from '../../../../../constant/time';
import { TemporaryHoursMapType } from '../../../../../models/interfaces/temporary-business-hours-type';
import { TemporaryHoursStrategy } from '../../../../@redis/cache/strategies/temporaryHours/temporaryHours.strategy';
import { BusinessHourService } from '../../../../@database/all-business-services/business-hours/business-hours.service';
import { WorkerBusinessHourService } from '../../../../@database/all-business-services/worker-business-hours/worker-business-hours.service';
import { TemporaryBusinessHourService } from '../../../../@database/all-business-services/temporary-business-hour/temporary-business-hour.service';
import CustomError from '../../../../../models/custom-error/CustomError';
import { CONSOLE_COLOR } from '../../../../../constant/console-color';

/**
 * Función para obtener los slots de tiempo disponibles para una cita.
 * Ajustada para considerar los horarios de negocio cuando no hay horarios específicos del trabajador.
 * 
 * MS-Chat - MS-Calendar
 */
export async function getAvailableTimeSlots() {

    const businessHoursService = new BusinessHourService();
    const workerHoursService = new WorkerBusinessHourService();
    const temporaryHoursService = new TemporaryBusinessHourService();

    const service = RabbitMQService.instance;
    const channel: Channel = await service.connect();
    const queueName = RabbitMQKeys.handleRpcGetAvaiableTimeSlotsForFlowQueue();

    await channel.assertQueue(queueName, { durable: true });
    console.log(`Waiting for RPC requests on ${queueName}`);

    channel.consume(queueName, async (msg: Message | null) => {
        if (msg) {
            const content = JSON.parse(msg.content.toString());
            const { payload } = content;
            const { idCompany, idEstablishment, idCategory, idService, establishmentTimeZone, timeService, idUser, date, daysAhead = 0 } = payload as ActionPayloads['requestGetAvaiableTimeSlotsForFlow'];

            try {
                console.log("Processing request for available time slots:", payload);

                // Paso 1: Obtener la duración del servicio
                const serviceDuration = timeService; // Duración en minutos
                const intervalMinutes = 30; // Cambia a 15 si es necesario en el futuro

                // Paso 2: Obtener los IDs de los usuarios que pueden realizar el servicio
                let usersToConsider: string[] = [];

                if (idUser === "Cualquiera") {
                    // Obtener todos los usuarios del establecimiento que pueden realizar el servicio
                    usersToConsider = await getUsersWhoCanPerformService(idEstablishment, idService, idCategory);
                } else {
                    usersToConsider = [idUser];
                }

                console.log("Users who can perform the service:", usersToConsider);

                // Paso 3: Obtener los horarios de negocio
                // TODO: 01/12/24 Se ha introducido el idEstablishment para obtener el horario de un establecimiento en concreto.
                const businessHours = await businessHoursService
                    .getBusinessHoursFromRedis(idCompany, idEstablishment);

                // console.log("Business hours for the company:", businessHours);
                // Paso 4: Obtener los horarios de los trabajadores
                const workerHoursMap = await workerHoursService
                    .getWorkerHoursFromRedis(usersToConsider, idCompany);

                console.log("Worker hours for the users:", workerHoursMap);

                const temporaryHoursMap = await temporaryHoursService
                    .getTemporaryHoursFromRedis(usersToConsider, idCompany);

                // Paso 5: Obtener los eventos existentes para los usuarios y fechas en cuestión
                const events = await getEventsForUsersAndDates(usersToConsider, date, daysAhead);

                // console.log("Events for the users and dates:", events);
                // Paso 6: Generar los slots de tiempo disponibles
                const timeSlots = generateAvailableTimeSlots({
                    dateSelected: date,
                    serviceDuration,
                    usersToConsider,
                    daysAhead,
                    intervalMinutes,
                    businessHours,
                    workerHoursMap,
                    temporaryHoursMap,
                    events,
                    establishmentTimeZone,
                });

                console.log("Available time slots:", timeSlots);

                // Paso 7: Enviar la respuesta
                channel.sendToQueue(msg.properties.replyTo, Buffer.from(JSON.stringify({ timeSlots })), {
                    correlationId: msg.properties.correlationId,
                    contentType: 'application/json',
                    deliveryMode: 2, // Persistente
                });

                channel.ack(msg);

            } catch (error: any) {
                console.error("Error processing request:", error);
                // Enviar un mensaje de error al cliente
                channel.sendToQueue(msg.properties.replyTo, Buffer.from(JSON.stringify({ error: error.message })), {
                    correlationId: msg.properties.correlationId,
                    contentType: 'application/json',
                    deliveryMode: 2, // Persistente
                });
                channel.ack(msg);
            }
        }
    });
}

// Función para obtener los usuarios que pueden realizar el servicio
// async function getUsersWhoCanPerformService(idEstablishment: string, idService: number): Promise<string[]> {
//     // Implementa la lógica para obtener los usuarios desde la base de datos

//     const users = await prisma.userService.findMany({
//         where: {
//             idServiceFk: idService,
//             service: {
//                 idEstablishmentFk: idEstablishment
//             },
//         },
//         select: {
//             idUserFk: true,
//         },
//     });

//     const userIds = users.map(u => u.idUserFk);
//     return Array.from(new Set(userIds)); // Eliminar duplicados
// }

async function getUsersWhoCanPerformService(
    idEstablishment: string,
    idService: number,
    idCategory: number
): Promise<string[]> {
    try {
        const result = await prisma.categoryEstablishment.findMany({
            where: {
                idCategoryFk: idCategory,
                idEstablishmentFk: idEstablishment,
            },
            select: {
                category: {
                    select: {
                        service: {
                            where: {
                                id: idService, // Filtrar por el servicio específico
                            },
                            select: {
                                userServices: {
                                    select: {
                                        idUserFk: true, // Obtener los IDs de usuarios
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        // Extraer los IDs de usuario de los resultados
        const userIds = result
            .flatMap((ce) =>
                ce.category.service.flatMap((service) =>
                    service.userServices.map((userService) => userService.idUserFk)
                )
            );

        // Eliminar duplicados y retornar los IDs de usuario
        return Array.from(new Set(userIds));
    } catch (error: any) {
        throw new CustomError('getUsersWhoCanPerformService', error);
    }
}


// async function getBusinessHoursFromRedis(idCompany: string): Promise<BusinessHoursType> {
//     const businessHoursStrategy = new BusinessHoursStrategy();

//     // Intentar obtener los horarios de negocio desde Redis
//     let businessHours = await businessHoursStrategy.getBusinessHours(idCompany);

//     if (businessHours) {
//         console.log("Horarios de negocio obtenidos de Redis");
//         return businessHours;
//     }

//     // Si no están en Redis, obtenerlos de la base de datos
//     const businessHoursRecords = await prisma.businessHour.findMany({
//         where: {
//             idCompanyFk: idCompany,
//             deletedDate: null,
//         },
//     });

//     // Estructurar los datos
//     businessHours = {};

//     for (const record of businessHoursRecords) {
//         const weekDay = record.weekDayType; // e.g., 'MONDAY'
//         if (record.closed) continue; // Omitir días cerrados

//         // Convertir los tiempos a cadenas en formato 'HH:mm' usando moment
//         const startTime = moment(record.startTime).format('HH:mm');
//         const endTime = moment(record.endTime).format('HH:mm');

//         // Asegurar que existe una entrada para el día de la semana
//         if (!businessHours[weekDay]) {
//             businessHours[weekDay] = [];
//         }

//         // Añadir el rango de tiempo al día correspondiente
//         businessHours[weekDay].push([startTime, endTime]);
//     }

//     // Guardar en Redis para futuras consultas
//     await businessHoursStrategy.saveBusinessHours(idCompany, businessHours, TIME_SECONDS.HOUR);


//     return businessHours;
// }


// async function getWorkerHoursFromRedis(userIds: string[], idCompany: string): Promise<WorkerHoursMapType> {
//     const workerHoursMap: WorkerHoursMapType = {};
//     const workerHoursStrategy = new WorkerHoursStrategy();

//     for (const userId of userIds) {
//         // Intentar obtener los horarios del trabajador desde Redis
//         let workerHours = await workerHoursStrategy.getWorkerHours(idCompany, userId);

//         if (workerHours) {
//             console.log(`Horarios del trabajador ${userId} obtenidos de Redis`);
//             workerHoursMap[userId] = workerHours;
//             continue;
//         }

//         // Si no están en Redis, obtenerlos de la base de datos
//         const workerHoursRecords = await prisma.workerBusinessHour.findMany({
//             where: {
//                 idUserFk: userId,
//                 idCompanyFk: idCompany,
//                 deletedDate: null,
//             },
//         });

//         // Estructurar los datos
//         workerHours = {};

//         for (const record of workerHoursRecords) {
//             const weekDay = record.weekDayType; // e.g., 'MONDAY'
//             if (record.closed) continue; // Omitir días cerrados

//             // Convertir los tiempos a cadenas en formato 'HH:mm' usando moment
//             const startTime = moment(record.startTime).format('HH:mm');
//             const endTime = moment(record.endTime).format('HH:mm');

//             // Asegurar que existe una entrada para el día de la semana
//             if (!workerHours[weekDay]) {
//                 workerHours[weekDay] = [];
//             }

//             // Añadir el rango de tiempo al día correspondiente
//             workerHours[weekDay].push([startTime, endTime]);
//         }

//         // Guardar en Redis para futuras consultas
//         await workerHoursStrategy.saveWorkerHours(idCompany, userId, workerHours, TIME_SECONDS.HOUR);

//         console.log(`Horarios del trabajador ${userId} guardados en Redis`);

//         workerHoursMap[userId] = workerHours;
//     }




//     return workerHoursMap;
// }


// async function getTemporaryHoursFromRedis(userIds: string[], idCompany: string): Promise<TemporaryHoursMapType> {
//     const temporaryHoursMap: TemporaryHoursMapType = {};
//     const temporaryHoursStrategy = new TemporaryHoursStrategy();

//     for (const userId of userIds) {
//         // Intentar obtener los horarios temporales desde Redis
//         let temporaryHours = await temporaryHoursStrategy.getTemporaryHours(idCompany, userId);

//         if (temporaryHours) {
//             console.log(`Horarios temporales del usuario ${userId} obtenidos de Redis ${JSON.stringify(temporaryHours)}`);
//             temporaryHoursMap[userId] = temporaryHours;
//             continue;
//         }

//         // Obtenemos los registros de horarios temporales de la base de datos
//         const temporaryHoursRecords = await prisma.temporaryBusinessHour.findMany({
//             where: {
//                 idCompanyFk: idCompany,
//                 idUserFk: userId,
//                 deletedDate: null,
//             },
//         });

//         // Inicializamos el mapa de horarios temporales para el usuario
//         const userTemporaryHours: { [date: string]: string[][] | null } = {};

//         for (const record of temporaryHoursRecords) {
//             const dateStr = moment(record.date).format('YYYY-MM-DD'); // Fecha en formato 'YYYY-MM-DD'

//             if (record.closed) {
//                 // Registrar que el trabajador está cerrado en esta fecha
//                 userTemporaryHours[dateStr] = null;
//                 continue; // Pasar al siguiente registro
//             }

//             // Si startTime o endTime son nulos, omitimos este registro
//             if (!record.startTime || !record.endTime) continue;

//             // Convertir los tiempos a cadenas en formato 'HH:mm'
//             const startTime = moment(record.startTime).format('HH:mm');
//             const endTime = moment(record.endTime).format('HH:mm');

//             // Asegurar que existe una entrada para la fecha
//             if (!userTemporaryHours[dateStr]) {
//                 userTemporaryHours[dateStr] = [];
//             }

//             // Añadir el rango de tiempo a la fecha correspondiente
//             (userTemporaryHours[dateStr] as string[][]).push([startTime, endTime]);
//         }

//         // Guardamos los horarios temporales del usuario en el mapa principal
//         temporaryHoursMap[userId] = userTemporaryHours;
//     }

//     return temporaryHoursMap;
// }


// Función para obtener los eventos existentes para los usuarios y fechas
async function getEventsForUsersAndDates(userIds: string[], dateSelected: string, daysAhead: number): Promise<Event[]> {
    const startDate = moment.utc(dateSelected).startOf('day').toDate();
    const endDate = moment.utc(dateSelected).add(daysAhead, 'days').endOf('day').toDate();

    console.log("Start date:", startDate);
    console.log("Start date:", startDate);
    console.log("Start date:", startDate);
    console.log("Start date:", startDate);


    const events = await prisma.event.findMany({
        where: {
            idUserPlatformFk: { in: userIds },
            startDate: { gte: startDate, lte: endDate },
            deletedDate: null,
        },
    });

    console.log("eventos devueltos", events)

    return events;
}

// Definimos el tipo para los eventos
interface Event {
    id: number;
    idUserPlatformFk: string;
    startDate: Date;
    endDate: Date;
}

// Función para generar los slots de tiempo disponibles
function generateAvailableTimeSlots(params: {
    dateSelected: string;
    serviceDuration: number;
    usersToConsider: string[];
    daysAhead: number;
    intervalMinutes: number;
    businessHours: BusinessHoursType;
    workerHoursMap: WorkerHoursMapType;
    temporaryHoursMap: TemporaryHoursMapType;
    events: Event[];
    establishmentTimeZone: string;
}): { id: string; title: string; metadata?: string; description?: string }[] {

    const {
        dateSelected,
        serviceDuration,
        usersToConsider,
        daysAhead,
        intervalMinutes,
        businessHours,
        workerHoursMap,
        temporaryHoursMap,
        events,
        establishmentTimeZone = "Europe/Madrid",
    } = params;

    const timeSlots: { id: string; title: string; metadata?: string; description?: string }[] = [];

    console.log(" ")
    console.log(`${CONSOLE_COLOR.FgYellow} -- Recordatorio: Hay que comprobar que los días del trabajador y excepciones que reciban "null" en vez de un array significa que ese día no trabajan`)
    console.log(" ")
    console.log(`${CONSOLE_COLOR.FgYellow} -- Recordatorio: Hay que comprobar que los días del trabajador y excepciones que reciban "null" en vez de un array significa que ese día no trabajan`)
    console.log(" ")
    console.log(`${CONSOLE_COLOR.FgYellow} -- Recordatorio: Hay que comprobar que los días del trabajador y excepciones que reciban "null" en vez de un array significa que ese día no trabajan`)
    console.log(" ")
    console.log(`${CONSOLE_COLOR.FgYellow} -- Recordatorio: Hay que comprobar que los días del trabajador y excepciones que reciban "null" en vez de un array significa que ese día no trabajan`)
    console.log(`${CONSOLE_COLOR.Reset}`)
    console.log(" ")
    
    // Iterar sobre los días desde la fecha seleccionada hasta el número de días especificado
    for (let dayOffset = 0; dayOffset <= daysAhead; dayOffset++) {
        // const currentDate = moment.utc(dateSelected).add(dayOffset, 'days');

        // NUEVO
        const currentDate = moment.tz(dateSelected, 'YYYY-MM-DD', establishmentTimeZone).add(dayOffset, 'days');

        const currentDateStr = currentDate.format('YYYY-MM-DD');
        const currentWeekDay = currentDate.format('dddd').toUpperCase(); // Día de la semana en inglés (e.g., 'MONDAY')

        // Obtener los horarios de negocio para el día actual
        const dayBusinessHours = businessHours[currentWeekDay] || [];

        // Si el negocio está cerrado, continuar al siguiente día
        if (dayBusinessHours.length === 0) continue;

        // Mapear eventos por usuario para el día actual
        const userEventsMap: { [userId: string]: Event[] } = {};
        usersToConsider.forEach(uid => {
            userEventsMap[uid] = events.filter(event => {
                return (
                    event.idUserPlatformFk === uid &&
                    moment.utc(event.startDate).format('YYYY-MM-DD') === currentDateStr
                );
            });
        });



        // Generar slots de tiempo basados en el horario de trabajo de cada usuario
        for (const uid of usersToConsider) {

            let workShifts: string[][] = [];

            const userTemporaryHours = temporaryHoursMap[uid]?.[currentDateStr];
            console.log("currentDateStr", currentDateStr);
            console.log("uid", uid);
            console.log("userTemporaryHours", userTemporaryHours);


            if (userTemporaryHours === null) {
                // El trabajador está cerrado en esta fecha
                console.log(`El trabajador ${uid} está cerrado el día ${currentDateStr} según horarios temporales.`);
                continue; // Pasar al siguiente usuario
            } else if (Array.isArray(userTemporaryHours) && userTemporaryHours.length > 0) {
                // Usar los horarios temporales disponibles
                workShifts = userTemporaryHours;
            } else {
                // Obtener los horarios del trabajador para el día actual
                workShifts = workerHoursMap[uid]?.[currentWeekDay] || [];


                // Si el trabajador no tiene horarios específicos para ese día, usar los horarios de negocio
                if (!workShifts || workShifts.length === 0) {
                    workShifts = dayBusinessHours || [];
                }

                // Si después de considerar los horarios de negocio, aún no hay horarios, continuar al siguiente usuario
                if (!workShifts || workShifts.length === 0) continue;

            }




            // Obtener los eventos del usuario para el día actual
            const userEvents = userEventsMap[uid];

            // Iterar sobre cada bloque de horario del trabajador
            for (const shift of workShifts) {


                // console.log("Shift:", shift);
                // shift es un arreglo [startTime, endTime]
                const shiftStartStr = shift[0]; // 'HH:mm:ss'
                const shiftEndStr = shift[1];   // 'HH:mm:ss'

                // Crear objetos moment para las horas de inicio y fin del turno
                // TODO: Esto está comentado ya que para Whatsapp es necesario saber la hora local del establecimiento
                // const shiftStart = moment.utc(`${currentDateStr}T${shiftStartStr}`);
                // const shiftEnd = moment.utc(`${currentDateStr}T${shiftEndStr}`);

                // NUEVO
                const shiftStart = moment.tz(`${currentDateStr}T${shiftStartStr}`, 'YYYY-MM-DDTHH:mm', establishmentTimeZone);
                const shiftEnd = moment.tz(`${currentDateStr}T${shiftEndStr}`, 'YYYY-MM-DDTHH:mm', establishmentTimeZone);

                // console.log("Shift start:", shiftStart);
                // console.log("Shift end:", shiftEnd);

                let slotTime = shiftStart.clone();

                // console.log("Slot time:", slotTime);

                // Generar slots dentro del turno
                while (slotTime.isBefore(shiftEnd)) {
                    const slotEndTime = slotTime.clone().add(serviceDuration, 'minutes');

                    // Si el servicio no cabe en el tiempo restante del turno, salir del bucle
                    if (slotEndTime.isAfter(shiftEnd)) {
                        break;
                    }

                    // Verificar solapamiento con eventos existentes
                    let isSlotAvailable = true;

                    console.log("Este es el id", uid)
                    for (const event of userEvents) {
                        console.log("id evento", event.id)
                        const eventStart = moment.utc(event.startDate);
                        const eventEnd = moment.utc(event.endDate);


                        console.log("eventStart", eventStart);
                        console.log("eventEnd", eventEnd);

                        if (
                            slotTime.isBefore(eventEnd) &&
                            slotEndTime.isAfter(eventStart)
                        ) {
                            isSlotAvailable = false;
                            break;
                        }
                    }

                    if (isSlotAvailable) {
                        const timeSlotStr = slotTime.format('HH:mm');
                        const slotId = `${currentDateStr} ${timeSlotStr}`;
                        const metadata = daysAhead ? currentDate.locale("es").format('dddd').toUpperCase() : "";

                        timeSlots.push({
                            id: slotId,
                            title: timeSlotStr,
                            metadata: metadata,
                            description: `${currentDate.format('DD/MM/YYYY')}`,
                        });
                    }

                    // Avanzar al siguiente intervalo
                    slotTime.add(intervalMinutes, 'minutes');
                }
            }
        }
    }

    // Eliminar posibles duplicados en los slots
    const uniqueTimeSlots = Array.from(
        new Map(timeSlots.map(item => [item.id, item])).values()
    );

    // Ordenar los slots por fecha y hora
    uniqueTimeSlots.sort((a, b) => {
        const dateA = moment.utc(a.id, 'YYYY-MM-DD HH:mm');
        const dateB = moment.utc(b.id, 'YYYY-MM-DD HH:mm');
        return dateA.diff(dateB);
    });

    return uniqueTimeSlots;
}

