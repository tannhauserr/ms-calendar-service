
// import moment from "moment";
// import { BusinessHourService } from "../../services/@database/all-business-services/business-hours/business-hours.service";
// import { TemporaryBusinessHourService } from "../../services/@database/all-business-services/temporary-business-hour/temporary-business-hour.service";
// import { WorkerBusinessHourService } from "../../services/@database/all-business-services/worker-business-hours/worker-business-hours.service";
// import { Response } from "../../models/messages/response";


// export class BusinessHourMiddleware {
//     static workerBusinessHourService = new WorkerBusinessHourService();
//     static businessHourService = new BusinessHourService();
//     static temporaryBusinessHourService = new TemporaryBusinessHourService();

//     static convertToISOTime_FirstPart = async (req: any, res: any, next: any) => {
//         const { startTime, endTime, idUserFk, date, weekDayType } = req.body;

//         if (req.body.closed) {
//             req.body.startTime = null;
//             req.body.endTime = null;

//             // Detectar si es un horario de trabajador, general o temporal
//             // if (idUserFk && date) {
//             //     // Es un horario temporal
//             //     await BusinessHourMiddleware.temporaryBusinessHourService.deleteTemporaryBusinessHourByWorkerAndDate(idUserFk, date);
//             // } else if (idUserFk) {
//             //     // Es un horario de trabajador
//             //     await BusinessHourMiddleware.workerBusinessHourService.deleteWorkerBusinessHourByWorker(req.body.weekDayType, idUserFk);
//             // } else {
//             //     // Es un horario general
//             //     await BusinessHourMiddleware.businessHourService.deleteBusinessHourByWeekDay(req.body.weekDayType);
//             // }

//         } else if (startTime && endTime) {
//             console.log("start antes", req.body.startTime)
//             console.log("end antes", req.body.endTime)
//             const transformHourToISOTime = (hour: string): Date => {
//                 const now = moment(); // Fecha y hora actual
//                 const [hourPart, minutePart] = hour.split(':');
//                 return now
//                     .set('hour', parseInt(hourPart, 10)) // Asigna la hora
//                     .set('minute', parseInt(minutePart, 10)) // Asigna los minutos
//                     .set('second', 0) // Opcional, resetear los segundos
//                     .set('millisecond', 0) // Opcional, resetear los milisegundos
//                     .toDate(); // Convierte el objeto moment a un Date (ISO-8601)
//             };

//             // Transformar las horas de 'HH:mm' a ISO-8601 antes de pasarlas al controlador
//             req.body.startTime = transformHourToISOTime(startTime);
//             req.body.endTime = transformHourToISOTime(endTime);

//             console.log("start fina", req.body.startTime)
//             console.log("end fina", req.body.endTime)

//             // if (idUserFk && date) {
//             //     // Es un horario temporal
//             //     await BusinessHourMiddleware.temporaryBusinessHourService.deleteClosedRecordsByWorkerAndDate(idUserFk, date);
//             // } else if (idUserFk) {
//             //     // Es un horario de trabajador
//             //     await BusinessHourMiddleware.workerBusinessHourService.deleteClosedRecordsByWorker(weekDayType, idUserFk);
//             // } else {
//             //     // Es un horario general
//             //     await BusinessHourMiddleware.businessHourService.deleteClosedRecordsByWeekDay(weekDayType);
//             // }

//         }

//         // Llamar al siguiente middleware o controlador
//         next();
//     };



//     /**
//      * Eliminar los registros cerrados de la base de datos 
//      * @param req 
//      * @param res 
//      * @param next 
//      */
//     static handleDeleteClosedRecords_SecondPart = async (req: any, res: Response, next: any) => {

//         const { idUserFk, date, weekDayType, idWorkspaceFk } = req.body;
//         console.log("handleDeleteClosedRecords_SecondPart ID", req.body.id)
//         console.log("handleDeleteClosedRecords_SecondPart ID User Fk", idUserFk)
//         console.log("handleDeleteClosedRecords_SecondPart Date", date)
//         console.log("handleDeleteClosedRecords_SecondPart Week Day Type", weekDayType)
//         console.log("handleDeleteClosedRecords_SecondPart ID Establecimiento Fk", idWorkspaceFk)
//         console.log("handleDeleteClosedRecords_SecondPart Closed", req.body.closed)
//         if (req.body.closed) {
//             // Detectar si es un horario de trabajador, general o temporal
//             if (idUserFk && date) {
//                 // Es un horario temporal
//                 await BusinessHourMiddleware.temporaryBusinessHourService.deleteTemporaryBusinessHourByWorkerAndDate(idUserFk, date);
//             } else if (idUserFk) {
//                 // Es un horario de trabajador
//                 await BusinessHourMiddleware.workerBusinessHourService.deleteWorkerBusinessHourByWorker(weekDayType, idUserFk);
//             } else {
//                 // Es un horario general
//                 await BusinessHourMiddleware.businessHourService.deleteBusinessHourByWeekDay(weekDayType, idWorkspaceFk);
//             }

//         } else if (req.body.startTime && req.body.endTime) {
//             if (idUserFk && date) {
//                 // Es un horario temporal
//                 await BusinessHourMiddleware.temporaryBusinessHourService.deleteClosedRecordsByWorkerAndDate(idUserFk, date);
//             } else if (idUserFk) {
//                 // Es un horario de trabajador
//                 await BusinessHourMiddleware.workerBusinessHourService.deleteClosedRecordsByWorker(weekDayType, idUserFk);
//             } else {
//                 // Es un horario general
//                 await BusinessHourMiddleware.businessHourService.deleteClosedRecordsByWeekDay(weekDayType, idWorkspaceFk);
//             }

//         }

//         // Llamar al siguiente middleware o controlador
//         next();
//     }


//     static preventOverlapping_ThirdPart = async (req: any, res: any, next: any) => {
//         const { startTime, endTime, idUserFk, date, weekDayType, idWorkspaceFk, id } = req.body;

//         console.log("preventOverlapping_ThirdPart ID", id)

//         if (startTime && endTime) {
//             let isOverlapping = false;
//             if (idUserFk && date) {
//                 console.log('Es un horario temporal', startTime, " - ", endTime, idUserFk, date);
//                 // Es un horario temporal
//                 isOverlapping = await BusinessHourMiddleware.temporaryBusinessHourService.checkOverlappingTemporaryBusinessHour(
//                     startTime,
//                     endTime,
//                     idUserFk,
//                     date,
//                     id
//                 );
//             } else if (idUserFk) {
//                 // Es un horario de trabajador
//                 isOverlapping = await BusinessHourMiddleware.workerBusinessHourService.checkOverlappingWorkerBusinessHour(
//                     startTime,
//                     endTime,
//                     weekDayType,
//                     idUserFk,
//                     id
//                 );
//             } else {
//                 // Es un horario general
//                 isOverlapping = await BusinessHourMiddleware.businessHourService.checkOverlappingBusinessHour(
//                     startTime,
//                     endTime,
//                     weekDayType,
//                     idWorkspaceFk,
//                     id
//                 );
//             }
//             // Verificar si el horario se superpone con otro horario

//             if (isOverlapping) {
//                 return res.status(200).json(Response.build('El horario se superpone con otro horario existente', 400, false));
//             }
//         }

//         // Llamar al siguiente middleware o controlador
//         next();
//     }


// }


// BusinessHourMiddleware.ts
import moment from "moment-timezone";
import { BusinessHourService } from "../../services/@database/all-business-services/business-hours/business-hours.service";
import { TemporaryBusinessHourService } from "../../services/@database/all-business-services/temporary-business-hour/temporary-business-hour.service";
import { WorkerBusinessHourService } from "../../services/@database/all-business-services/worker-business-hours/worker-business-hours.service";
import { Response } from "../../models/messages/response";

export class BusinessHourMiddleware {
    static workerBusinessHourService = new WorkerBusinessHourService();
    static businessHourService = new BusinessHourService();
    static temporaryBusinessHourService = new TemporaryBusinessHourService();

    /** --- Utils --- */

    /** Normaliza "9:00", "09:00", "09:00:00" -> "09:00" (throw si no cuadra) */
    private static toHHmm(v: any): string {
        if (v == null) throw new Error("startTime/endTime no puede ser null");
        // Si viene Date (clientes legacy), normaliza a "HH:mm"
        if (v instanceof Date) {
            return v.toISOString().slice(11, 16); // "HH:mm"
        }
        const s = String(v).trim();
        // Si viene ISO "2025-08-02T06:00:00.000Z"
        if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
            const d = new Date(s);
            if (!isNaN(d.getTime())) return d.toISOString().slice(11, 16);
        }
        const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
        if (!m) throw new Error(`Hora con formato no soportado: ${s}`);
        const h = m[1].padStart(2, "0");
        const min = m[2];
        return `${h}:${min}`;
    }

    /** Convierte "YYYY-MM-DD" + "HH:mm" en tz -> ISO UTC (string o Date) */
    private static toUtcFromLocal(date: string, hhmm: string, tz: string, asDate = true): string | Date {
        const m = moment.tz(`${date} ${hhmm}`, "YYYY-MM-DD HH:mm", tz);
        const iso = m.utc().toISOString();
        return asDate ? new Date(iso) : iso;
    }

    /**
     * PRIMERA PARTE:
     * - Si 'closed' => start/end null
     * - Si hay 'date' => es TEMPORAL => convertir date + HH:mm en TZ del ESTABLECIMIENTO a UTC (ISO/Date)
     * - Si NO hay 'date' => es RECURRENTE (worker o business) => mantener HH:mm (string)
     */
    static convertToISOTime_FirstPart = async (req: any, res: any, next: any) => {
        try {
            const { startTime, endTime, idUserFk, date, weekDayType, timeZoneWorkspace } = req.body;

            // 1) Día cerrado
            if (req.body.closed) {
                req.body.startTime = null;
                req.body.endTime = null;
                return next();
            }

            // Si no hay horas, continuar sin tocar
            if (!startTime || !endTime) return next();

            // 2) Normaliza a "HH:mm" (acepta Date, ISO, HH:mm:ss, etc.)
            const startHH = BusinessHourMiddleware.toHHmm(startTime);
            const endHH = BusinessHourMiddleware.toHHmm(endTime);

            // 3) ¿Temporal o recurrente?
            if (idUserFk && date) {
                // TEMPORAL (tiene fecha concreta)
                // IMPORTANTÍSIMO: convertir desde TZ del ESTABLECIMIENTO.
                const tz = (timeZoneWorkspace || "Europe/Madrid").trim();
                if (!moment.tz.zone(tz)) {
                    // Si no hay TZ válida, como fallback tratamos fecha/hora como UTC
                    req.body.startTime = new Date(`${date}T${startHH}:00.000Z`);
                    req.body.endTime = new Date(`${date}T${endHH}:00.000Z`);
                } else {
                    req.body.startTime = BusinessHourMiddleware.toUtcFromLocal(date, startHH, tz, true); // Date
                    req.body.endTime = BusinessHourMiddleware.toUtcFromLocal(date, endHH, tz, true);     // Date
                }
            } else {
                // RECURRENTE (worker o business) => guardar como "HH:mm" (String)
                req.body.startTime = startHH;
                req.body.endTime = endHH;
            }

            next();
        } catch (err) {
            console.error("convertToISOTime_FirstPart error:", err);
            // No rompas el flujo: devuelve error claro
            return res
                .status(200)
                .json(Response.build("Formato de hora inválido. Usa 'HH:mm'.", 400, false));
        }
    };
    /**
     * SEGUNDA PARTE: borrar registros 'closed' existentes cuando corresponda.
     * (Tu lógica original, no toco salvo que quieras cambiar algo)
     */
    static handleDeleteClosedRecords_SecondPart = async (req: any, res: any, next: any) => {
        try {
            const { idUserFk, date, weekDayType, idWorkspaceFk } = req.body;
            if (req.body.closed) {
                if (idUserFk && date) {
                    await BusinessHourMiddleware.temporaryBusinessHourService.deleteTemporaryBusinessHourByWorkerAndDate(
                        idUserFk,
                        date
                    );
                } else if (idUserFk) {
                    await BusinessHourMiddleware.workerBusinessHourService.deleteWorkerBusinessHourByWorker(
                        weekDayType,
                        idUserFk
                    );
                } else {
                    await BusinessHourMiddleware.businessHourService.deleteBusinessHourByWeekDay(
                        weekDayType,
                        idWorkspaceFk
                    );
                }
            } else if (req.body.startTime && req.body.endTime) {
                if (idUserFk && date) {
                    await BusinessHourMiddleware.temporaryBusinessHourService.deleteClosedRecordsByWorkerAndDate(
                        idUserFk,
                        date
                    );
                } else if (idUserFk) {
                    await BusinessHourMiddleware.workerBusinessHourService.deleteClosedRecordsByWorker(
                        weekDayType,
                        idUserFk
                    );
                } else {
                    await BusinessHourMiddleware.businessHourService.deleteClosedRecordsByWeekDay(
                        weekDayType,
                        idWorkspaceFk
                    );
                }
            }
            next();
        } catch (err) {
            console.error("handleDeleteClosedRecords_SecondPart error:", err);
            return res
                .status(200)
                .json(Response.build("Error al borrar registros cerrados.", 400, false));
        }
    };
    /**
     * TERCERA PARTE: prevención de solapamientos.
     * Mantengo tus llamadas. Cada service debe entender su tipo:
     * - Temporal: Date/ISO (instantes)
     * - Recurrente: "HH:mm" (strings)
     */
    static preventOverlapping_ThirdPart = async (req: any, res: any, next: any) => {
        try {
            const { startTime, endTime, idUserFk, date, weekDayType, idWorkspaceFk, id } = req.body;

            if (startTime && endTime) {
                let isOverlapping = false;
                if (idUserFk && date) {
                    // Temporal
                    isOverlapping =
                        await BusinessHourMiddleware.temporaryBusinessHourService.checkOverlappingTemporaryBusinessHour(
                            startTime, // Date/ISO
                            endTime,   // Date/ISO
                            idUserFk,
                            idWorkspaceFk,
                            date,
                            id
                        );
                } else if (idUserFk) {
                    // Worker recurrente
                    isOverlapping =
                        await BusinessHourMiddleware.workerBusinessHourService.checkOverlappingWorkerBusinessHour(
                            startTime as string, // "HH:mm"
                            endTime as string,   // "HH:mm"
                            weekDayType,
                            idUserFk,
                            id
                        );
                } else {
                    // Business recurrente
                    isOverlapping =
                        await BusinessHourMiddleware.businessHourService.checkOverlappingBusinessHour(
                            startTime as string, // "HH:mm"
                            endTime as string,   // "HH:mm"
                            weekDayType,
                            idWorkspaceFk,
                            id
                        );
                }

                if (isOverlapping) {
                    return res
                        .status(200)
                        .json(Response.build("El horario se superpone con otro horario existente", 400, false));
                }
            }

            next();
        } catch (err) {
            console.error("preventOverlapping_ThirdPart error:", err);
            return res
                .status(200)
                .json(Response.build("Error al verificar solapamiento de horarios.", 400, false));
        }
    };
}
