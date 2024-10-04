import { EventType } from '@prisma/client';
import { EventService } from '../../services/@database/event/event.service';
import { Response } from '../../models/messages/response';
import { NextFunction } from 'express';



export class EventMiddleware {

    static async checkEventConflict(req: any, res: any, next: NextFunction) {
        try {
            const { force, startDate, endDate, idUserPlatformFk, idCalendarFk } = req.body;

            // Si `force` es true, omitir la comprobación de conflictos y pasar al siguiente middleware
            if (force) {
                return next();
            }

            // Validar la existencia de las fechas y el ID de usuario
            if (!startDate || !endDate || !idUserPlatformFk || !idCalendarFk) {
                return res.status(400).json(Response.build("Faltan parámetros obligatorios.", 400, false));
            }

            const eventService = new EventService();

            // Buscar eventos de tipo VACATION, HOLIDAY, LEAVE en las fechas especificadas
            const conflictingEvents = await eventService.findConflictingEvents(
                idUserPlatformFk,
                idCalendarFk,
                new Date(startDate),
                new Date(endDate),
                [EventType.VACATION, EventType.HOLIDAY, EventType.LEAVE]
            );

            if (conflictingEvents.length > 0) {
                return res.status(409).json(Response.build("Conflicto de eventos detectado.", 409, false, conflictingEvents));
            }

            // Si no hay conflictos, proceder al siguiente middleware
            next();
        } catch (error) {
            console.error("Error en checkEventConflict middleware:", error);
            res.status(500).json({ message: "Error interno del servidor." });
        }
    }
}
