
import moment from "moment";
import { BusinessHourService } from "../../services/@database/all-business-services/business-hours/business-hours.service";
import { TemporaryBusinessHourService } from "../../services/@database/all-business-services/temporary-business-hour/temporary-business-hour.service";
import { WorkerBusinessHourService } from "../../services/@database/all-business-services/worker-business-hours/worker-business-hours.service";
import { Response } from "../../models/messages/response";


export class BusinessHourMiddleware {
    static workerBusinessHourService = new WorkerBusinessHourService();
    static businessHourService = new BusinessHourService();
    static temporaryBusinessHourService = new TemporaryBusinessHourService();

    static convertToISOTime_FirstPart = async (req: any, res: any, next: any) => {
        const { startTime, endTime, idUserFk, date, weekDayType } = req.body;

        if (req.body.closed) {
            req.body.startTime = null;
            req.body.endTime = null;

            // Detectar si es un horario de trabajador, general o temporal
            // if (idUserFk && date) {
            //     // Es un horario temporal
            //     await BusinessHourMiddleware.temporaryBusinessHourService.deleteTemporaryBusinessHourByWorkerAndDate(idUserFk, date);
            // } else if (idUserFk) {
            //     // Es un horario de trabajador
            //     await BusinessHourMiddleware.workerBusinessHourService.deleteWorkerBusinessHourByWorker(req.body.weekDayType, idUserFk);
            // } else {
            //     // Es un horario general
            //     await BusinessHourMiddleware.businessHourService.deleteBusinessHourByWeekDay(req.body.weekDayType);
            // }

        } else if (startTime && endTime) {
            console.log("start antes", req.body.startTime)
            console.log("end antes", req.body.endTime)
            const transformHourToISOTime = (hour: string): Date => {
                const now = moment(); // Fecha y hora actual
                const [hourPart, minutePart] = hour.split(':');
                return now
                    .set('hour', parseInt(hourPart, 10)) // Asigna la hora
                    .set('minute', parseInt(minutePart, 10)) // Asigna los minutos
                    .set('second', 0) // Opcional, resetear los segundos
                    .set('millisecond', 0) // Opcional, resetear los milisegundos
                    .toDate(); // Convierte el objeto moment a un Date (ISO-8601)
            };

            // Transformar las horas de 'HH:mm' a ISO-8601 antes de pasarlas al controlador
            req.body.startTime = transformHourToISOTime(startTime);
            req.body.endTime = transformHourToISOTime(endTime);

            console.log("start fina", req.body.startTime)
            console.log("end fina", req.body.endTime)

            // if (idUserFk && date) {
            //     // Es un horario temporal
            //     await BusinessHourMiddleware.temporaryBusinessHourService.deleteClosedRecordsByWorkerAndDate(idUserFk, date);
            // } else if (idUserFk) {
            //     // Es un horario de trabajador
            //     await BusinessHourMiddleware.workerBusinessHourService.deleteClosedRecordsByWorker(weekDayType, idUserFk);
            // } else {
            //     // Es un horario general
            //     await BusinessHourMiddleware.businessHourService.deleteClosedRecordsByWeekDay(weekDayType);
            // }

        }

        // Llamar al siguiente middleware o controlador
        next();
    };



    static handleDeleteClosedRecords_SecondPart = async (req: any, res: Response, next: any) => {

        const { idUserFk, date, weekDayType } = req.body;

        if (req.body.closed) {
            // Detectar si es un horario de trabajador, general o temporal
            if (idUserFk && date) {
                // Es un horario temporal
                await BusinessHourMiddleware.temporaryBusinessHourService.deleteTemporaryBusinessHourByWorkerAndDate(idUserFk, date);
            } else if (idUserFk) {
                // Es un horario de trabajador
                await BusinessHourMiddleware.workerBusinessHourService.deleteWorkerBusinessHourByWorker(weekDayType, idUserFk);
            } else {
                // Es un horario general
                await BusinessHourMiddleware.businessHourService.deleteBusinessHourByWeekDay(weekDayType);
            }

        } else if (req.body.startTime && req.body.endTime) {
            if (idUserFk && date) {
                // Es un horario temporal
                await BusinessHourMiddleware.temporaryBusinessHourService.deleteClosedRecordsByWorkerAndDate(idUserFk, date);
            } else if (idUserFk) {
                // Es un horario de trabajador
                await BusinessHourMiddleware.workerBusinessHourService.deleteClosedRecordsByWorker(weekDayType, idUserFk);
            } else {
                // Es un horario general
                await BusinessHourMiddleware.businessHourService.deleteClosedRecordsByWeekDay(weekDayType);
            }

        }

        // Llamar al siguiente middleware o controlador
        next();
    }


    static preventOverlapping_ThirdPart = async (req: any, res: any, next: any) => {
        const { startTime, endTime, idUserFk, date, weekDayType } = req.body;

        if (startTime && endTime) {
            let isOverlapping = false;
            if (idUserFk && date) {
                console.log('Es un horario temporal', startTime, " - ", endTime, idUserFk, date);
                // Es un horario temporal
                isOverlapping = await BusinessHourMiddleware.temporaryBusinessHourService.checkOverlappingTemporaryBusinessHour(
                    startTime,
                    endTime,
                    idUserFk,
                    date);
            } else if (idUserFk) {
                // Es un horario de trabajador
                isOverlapping = await BusinessHourMiddleware.workerBusinessHourService.checkOverlappingWorkerBusinessHour(startTime, endTime, weekDayType, idUserFk);
            } else {
                // Es un horario general
                isOverlapping = await BusinessHourMiddleware.businessHourService.checkOverlappingBusinessHour(startTime, endTime, weekDayType);
            }
            // Verificar si el horario se superpone con otro horario

            if (isOverlapping) {
                return res.status(200).json(Response.build('El horario se superpone con otro horario existente', 400, false));
            }
        }

        // Llamar al siguiente middleware o controlador
        next();
    }


}
