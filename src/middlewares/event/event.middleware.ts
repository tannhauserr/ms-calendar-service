
import { EventService } from '../../services/@database/event/event.service';
import { Response } from '../../models/messages/response';
import { NextFunction } from 'express';
import { JWTService } from "../../services/jwt/jwt.service";


export class EventMiddleware {

    static async checkEventConflict(req: any, res: any, next: NextFunction) {
        try {
            const { force, startDate, endDate, idUserPlatformFk, idCalendarFk, id, eventStatusType } = req.body;

            // Si `force` es true, omitir la comprobación de conflictos y pasar al siguiente middleware
            if (force || eventStatusType === 'CANCELLED') {
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
            );



            if (conflictingEvents.length > 0 && !id) {
                return res.status(409).json(Response.build("Event conflict detected.", 409, false, {
                    // conflictingEvents,
                    code: 'EVENT_CONFLICT',
                }));
            } else if (conflictingEvents.length > 0 && id) {
                const event = conflictingEvents.find((event: any) => event.id === id);
                if (!event) {
                    return res.status(409).json(Response.build("Event conflict detected.", 409, false, {
                        conflictingEvents,
                        code: 'EVENT_CONFLICT',
                    }));
                }
            }

            // Si no hay conflictos, proceder al siguiente middleware
            next();
        } catch (error) {
            console.error("Error en checkEventConflict middleware:", error);
            res.status(500).json({ message: "Error interno del servidor." });
        }
    }



    static async validateEventStatusChange(req: any, res: any, next: NextFunction) {
        try {
            const { id, eventStatusType } = req.body;

            // Validar la existencia de parámetros obligatorios
            if (!id || !eventStatusType) {
                return res
                    .status(400)
                    .json(Response.build("Faltan parámetros obligatorios: 'id' o 'newStatus'.", 400, false));
            }

            const eventService = new EventService();

            // Obtener el evento actual
            const currentEvent = await eventService.getEventById(id);

            if (!currentEvent) {
                return res
                    .status(404)
                    .json(Response.build("El evento especificado no existe.", 404, false));
            }

            const { eventStatusType: currentStatus } = currentEvent;

            // Validar reglas de cambio de estado
            if (currentStatus === 'CANCELLED') {
                // Si el evento está cancelado, no se permite modificar
                return res
                    .status(409)
                    .json(Response.build("Cannot modify an event that is already cancelled.", 409, false, { code: 'INVALID_STATUS_CHANGE' }));
            }

            if (currentStatus === 'CONFIRMED' && eventStatusType === 'PENDING') {
                // Si el evento está confirmado, no se permite volver a 'PENDING'
                return res
                    .status(409)
                    .json(Response.build("Cannot change a confirmed event to pending.", 409, false, { code: 'INVALID_STATUS_CHANGE' }));
            }

            // Si pasa todas las validaciones, continuar con el siguiente middleware
            next();
        } catch (error) {
            console.error("Error en validateEventStatusChange middleware:", error);
            res.status(500).json({ message: "Error interno del servidor." });
        }
    }


    static async preventPastEvent(req: any, res: any, next: NextFunction) {
        try {
            const { id, startDate } = req.body;

            // Validar la existencia del parámetro obligatorio
            if (!startDate) {
                return res
                    .status(400)
                    .json(Response.build("Faltan parámetros obligatorios: 'startDate'.", 400, false));
            }

            // Obtener la fecha actual
            const now = new Date();

            // Comparar la fecha de inicio del evento con la fecha actual
            if (new Date(startDate) < now) {
                if (id) {
                    return res
                        .status(409)
                        .json(Response.build("No se permite la creación o edición de eventos antiguos.", 409, false, { code: 'FORMER_DATE_UPDATE' }));
                } else {
                    return res
                        .status(409)
                        .json(Response.build("No se permite la creación o edición de eventos antiguos.", 409, false, { code: 'FORMER_DATE_ADD' }));
                }

            }

            // Si no es un evento antiguo, continuar con el siguiente middleware
            next();
        } catch (error) {
            console.error("Error en prohibitPastEvents middleware:", error);
            res.status(500).json({ message: "Error interno del servidor." });
        }
    }


}
