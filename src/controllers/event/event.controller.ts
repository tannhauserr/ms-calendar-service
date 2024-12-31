import { GoogleOAuthErrorCodes } from "../../models/error-codes/oauth-error-codes";
import { googleCalendarColors } from "../../models/interfaces/google-events-color";
import { Response } from "../../models/messages/response";
import { EventService } from "../../services/@database/event/event.service";
import { UserColorService } from "../../services/@database/user-color/user-color.service";
import { RedisSubscriptionStrategyFactory } from "../../services/@redis/pubsub/estrategies/redis-subscription/redisSubscriptionStrategyFactory";
import { EventCalendarGoogleService } from "../../services/caledar-googleapi/event-calendar-googleapi.service";
import { UserColorCalendar } from "../../services/caledar-googleapi/interfaces/user-color-calendar";
import { JWTService } from "../../services/jwt/jwt.service";

export class EventController {
    public eventService: EventService;
    private jwtService: JWTService;

    constructor() {
        this.jwtService = JWTService.instance;
        this.eventService = new EventService();
    }

    public add = async (req: any, res: any, next: any) => {
        try {
            const body = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.eventService.addEvent(body);
            res.status(200).json(Response.build("Evento creado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }


    // TODO: Esto funciona a dia de hoy: 31/08/2024
    // public addGoogleTotal = async (req: any, res: any, next: any) => {
    //     try {
    //         const {
    //             // idGoogleCalendar,
    //             title,
    //             startDate,
    //             endDate,
    //             description,
    //             idUserPlatformFk,
    //             idCalendarFk,
    //             idServiceFk,
    //             eventSourceType
    //         } = req.body;
    //         const token = req.token;
    //         await this.jwtService.verify(token);

    //         console.log("*************************");
    //         console.log("mira que es body", req.body);
    //         console.log("*************************");


    //         // Primero, guarda el evento en tu base de datos
    //         const newEvent = await this.eventService.addEvent({
    //             title,
    //             description,
    //             startDate,
    //             endDate,
    //             idUserPlatformFk: idUserPlatformFk,
    //             idCalendarFk,
    //             idServiceFk,
    //             eventSourceType
    //         });



    //         console.log("*************************");
    //         console.log("mira que es newEvent", newEvent);

    //         const idGoogleCalendar = newEvent.calendar.idGoogleCalendar;




    //         const userColor = await this._getUserColor(idUserPlatformFk);
    //         const eventColor = userColor?.eventColorGoogle?.idColorGoogle || googleCalendarColors.get("1").id;



    //         // Valida los datos del evento antes de crearlo en Google Calendar
    //         const isValid = await this._validadorCreateEvent(idUserPlatformFk, idGoogleCalendar, { summary: title, startDate, endDate: undefined });
    //         console.log("que sale de la validación", isValid);
    //         if (!isValid) {
    //             return res.status(200).json(Response.build("No se ha creado el evento en Google", 200, false, newEvent));
    //         }

    //         // Luego, crea el evento en Google Calendar
    //         // Crea el evento en Google Calendar en paralelo
    //         const [googleEvent] = await Promise.all([
    //             this._createGoogleEvent(idUserPlatformFk, idGoogleCalendar, title, startDate, endDate, description, eventColor),
    //             // Otras tareas en paralelo si es necesario
    //         ]);
    //         console.log("*************************");
    //         console.log("mira que es googleEvent", googleEvent);

    //         // Finalmente, actualiza tu evento en la base de datos con el ID del evento de Google
    //         await this.eventService.updateEvent({ id: newEvent.id, idGoogleEvent: googleEvent.id });

    //         res.status(200).json(Response.build("Evento creado exitosamente", 200, true, { newEvent, googleEvent }));
    //     } catch (err: any) {
    //         res.status(401).json(Response.build("Error al crear el evento", 401, false, err.message));
    //     }
    // }



    public addGoogleTotal = async (req: any, res: any, next: any) => {
        try {
            const {
                title,
                startDate,
                endDate,
                description,
                idUserPlatformFk,
                idCalendarFk,
                idServiceFk,
                eventSourceType,
                eventPurposeType,
                eventStatusType
            } = req.body;

            await this.jwtService.verify(req.token);

            const newEvent = await this.eventService.addEvent({
                title,
                description,
                startDate,
                endDate,
                idUserPlatformFk,
                idCalendarFk,
                idServiceFk,
                eventSourceType,
                eventPurposeType,
                eventStatusType,
            });

            // const idGoogleCalendar = newEvent.calendar.idGoogleCalendar;
            // const userColor = await this._getUserColor(idUserPlatformFk);
            // const eventColor = userColor?.eventColorGoogle?.idColorGoogle || googleCalendarColors.get("1").id;



            // RedisSubscriptionStrategyFactory.execute('publish', 'createEventGoogle', {
            //     idRowEventDB: newEvent.id,
            //     idUserPlatformFk,
            //     idGoogleCalendar,
            //     title,
            //     startDate,
            //     endDate,
            //     description,
            //     eventColor
            // });

            res.status(200).json(Response.build("Evento creado exitosamente", 200, true, newEvent));
        } catch (err: any) {
            res.status(401).json(Response.build("Error al crear el evento", 401, false, err.message));
        }
    }

    // private async _getUserColor(idUserPlatformFk: string): Promise<UserColorCalendar | null> {
    //     const userColorService = new UserColorService();
    //     return await userColorService.getUserColorByIdUser(idUserPlatformFk, true);
    // }

    // private async _validadorCreateEvent(idUser: string, idCalendarGoogle, eventData: {
    //     summary: string;
    //     startDate: string;
    //     endDate: string;
    // }): Promise<boolean> {
    //     const calendarExistValidator = new CalendarExistValidator();
    //     const accessValidator = new HasAccessToCalendarValidator();
    //     const eventDataValidator = new ValidateEventDataValidator();

    //     // Configurar la cadena de validación
    //     calendarExistValidator
    //         .setNext(accessValidator)
    //         .setNext(eventDataValidator);

    //     // Crear el objeto request para los validadores
    //     const validationRequest: CalendarValidationRequest = {
    //         idUser: idUser,
    //         calendarId: idCalendarGoogle,
    //         eventData
    //     };

    //     const isValid = await calendarExistValidator.validate(validationRequest);

    //     console.log("*********** ENTRO este otro valid, saldrá antes", isValid);
    //     // Lógica para validar los datos del evento
    //     return isValid;
    // }

    // private async _createGoogleEvent(idUserPlatformFk: string, idGoogleCalendar: string, title: string, startDate: string, endDate: string, description: string, eventColor: string): Promise<any> {
    //     const eventCalendarGoogleService = new EventCalendarGoogleService();
    //     return await eventCalendarGoogleService.createEvent(
    //         idUserPlatformFk,
    //         idGoogleCalendar,
    //         title,
    //         startDate,
    //         endDate,
    //         description,
    //         eventColor
    //     );
    // }

    public get = async (req: any, res: any, next: any) => {
        try {
            const { pagination } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.eventService.getEvents(pagination, true);
            res.status(200).json({ message: "Eventos encontrados", ok: true, item: result });
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    public getList = async (req: any, res: any, next: any) => {
        try {
            const { pagination } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.eventService.getEvents(pagination, false);
            res.status(200).json({ message: "Eventos encontrados", ok: true, item: result });
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    public getById = async (req: any, res: any, next: any) => {
        try {
            const { id } = req.params;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.eventService.getEventById(id);
            res.status(200).json(Response.build("Evento encontrado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }

    public updateGoogleTotal = async (req: any, res: any, next: any) => {
        try {
            const {
                id,
                title,
                startDate,
                endDate,
                description,
                idUserPlatformFk,
                idCalendarFk,
                idServiceFk,
                eventSourceType,
                eventPurposeType,
                eventStatusType
            } = req.body;
            await this.jwtService.verify(req.token);

            const updatedEvent = await this.eventService.updateEvent({
                id,
                title,
                description,
                startDate,
                endDate,
                idUserPlatformFk,
                // idCalendarFk,
                idServiceFk,
                eventSourceType,
                eventPurposeType,
                eventStatusType
            });

            // const idGoogleCalendar = updatedEvent.calendar.idGoogleCalendar;
            // const idGoogleEvent = updatedEvent.idGoogleEvent;

            // const userColor = await this._getUserColor(idUserPlatformFk);
            // const eventColor = userColor?.eventColorGoogle?.idColorGoogle || googleCalendarColors.get("1").id;

            // // Publicar en Pub/Sub para actualizar el evento en Google Calendar
            // RedisSubscriptionStrategyFactory.execute('publish', 'updateEventGoogle', {
            //     idRowEventDB: updatedEvent.id,
            //     idUserPlatformFk,
            //     idGoogleCalendar,
            //     idGoogleEvent,
            //     title,
            //     startDate,
            //     endDate,
            //     description,
            //     eventColor
            // });

            res.status(200).json(Response.build("Evento actualizado exitosamente", 200, true, updatedEvent));
        } catch (err: any) {
            if (err?.message.includes('Missing required parameters: eventId')) {
                res.status(400).json(Response.build("El evento no tiene un ID de Google Calendar", 400, false, { code: GoogleOAuthErrorCodes.MISSING_EVENT_ID }));
            } else {
                res.status(401).json(Response.build("Error al actualizar el evento", 401, false, err.message));
            }
        }
    }

    // public updateGoogleTotal = async (req: any, res: any, next: any) => {
    //     try {
    //         const {
    //             id,
    //             title,
    //             startDate,
    //             endDate,
    //             description,
    //             idUserPlatformFk,
    //             idCalendarFk,
    //             idServiceFk,
    //             eventSourceType,
    //         } = req.body;
    //         const token = req.token;
    //         await this.jwtService.verify(token);

    //         console.log("*************************");
    //         console.log("mira que es body", req.body);
    //         console.log("*************************");

    //         // Actualiza el evento en tu base de datos
    //         const updatedEvent = await this.eventService.updateEvent({
    //             id,
    //             title,
    //             description,
    //             startDate,
    //             endDate,
    //             idUserPlatformFk,
    //             idCalendarFk,
    //             idServiceFk,
    //             eventSourceType,
    //         });

    //         console.log("*************************");
    //         console.log("mira que es updatedEvent", updatedEvent);

    //         const idGoogleCalendar = updatedEvent.calendar.idGoogleCalendar;

    //         // Obtén el color del evento, si no está disponible usa uno por defecto
    //         const userColor = await this._getUserColor(idUserPlatformFk);
    //         const eventColor = userColor?.eventColorGoogle?.idColorGoogle || googleCalendarColors.get("1").id;

    //         // Actualiza el evento en Google Calendar en paralelo
    //         const updatedGoogleEvent = await this._updateGoogleEvent(
    //             idUserPlatformFk,
    //             idGoogleCalendar,
    //             updatedEvent.idGoogleEvent,
    //             title,
    //             startDate,
    //             endDate,
    //             description,
    //             eventColor
    //         );

    //         console.log("*************************");
    //         console.log("mira que es updatedGoogleEvent", updatedGoogleEvent);

    //         res.status(200).json(Response.build("Evento actualizado exitosamente", 200, true, { updatedEvent, updatedGoogleEvent }));
    //     } catch (err: any) {

    //         if (err?.message.includes('Missing required parameters: eventId')) {
    //             res.status(400).json(Response.build("El evento no tiene un ID de Google Calendar", 400, false, { code: GoogleOAuthErrorCodes.MISSING_EVENT_ID }));
    //         } else {
    //             res.status(401).json(Response.build("Error al actualizar el evento", 401, false, err.message));
    //         }
    //     }
    // }

    // private async _updateGoogleEvent(
    //     idUserPlatformFk: string,
    //     idGoogleCalendar: string,
    //     idGoogleEvent: string,
    //     title: string,
    //     startDate: string,
    //     endDate: string,
    //     description: string,
    //     eventColor: string
    // ): Promise<any> {
    //     const eventCalendarGoogleService = new EventCalendarGoogleService();

    //     console.log("llega idGoogleEvent", idGoogleEvent);
    //     return await eventCalendarGoogleService.updateEvent(
    //         idUserPlatformFk,
    //         idGoogleCalendar,
    //         idGoogleEvent,
    //         title,
    //         startDate,
    //         endDate,
    //         description,
    //         eventColor
    //     );
    // }

    // public delete = async (req: any, res: any, next: any) => {
    //     try {
    //         const { id } = req.body;
    //         const token = req.token;
    //         await this.jwtService.verify(token);

    //         const result = await this.eventService.deleteEvent(id);
    //         res.status(200).json(Response.build("Evento eliminado", 200, true, result));
    //     } catch (err: any) {
    //         res.status(500).json({ message: err.message });
    //     }
    // }


    // public deleteGoogleTotal = async (req: any, res: any, next: any) => {
    //     try {
    //         const { id } = req.body;
    //         const token = req.token;
    //         await this.jwtService.verify(token);

    //         // Primero, obtén el evento desde la base de datos para obtener el idGoogleEvent y otros datos necesarios
    //         const event = await this.eventService.getEventById(id);

    //         if (!event) {
    //             return res.status(404).json(Response.build("Evento no encontrado en la base de datos", 404, false));
    //         }

    //         console.log("mira que es id", id);
    //         console.log("mira que es event", event);

    //         // Luego, elimina el evento de la base de datos
    //         const result = await this.eventService.deleteEvent(id);


    //         // Elimina el evento de Google Calendar si tiene un idGoogleEvent
    //         if (event?.idGoogleEvent && event?.calendar && event?.calendar?.idGoogleCalendar) {
    //             try {
    //                 const eventCalendarGoogleService = new EventCalendarGoogleService();
    //                 await eventCalendarGoogleService.deleteEvent(
    //                     event.idUserPlatformFk,  // Usuario
    //                     event.calendar.idGoogleCalendar, // ID del calendario de Google
    //                     event.idGoogleEvent  // ID del evento en Google Calendar
    //                 );
    //             } catch (googleError: any) {
    //                 // Verifica si el error es porque el evento no existe en Google Calendar
    //                 if (googleError.message && googleError.message.includes('Resource not found')) {
    //                     console.warn("El evento no se encontró en Google Calendar, pero será eliminado de la base de datos.");
    //                 } else {
    //                     throw googleError;
    //                 }
    //             }
    //         }



    //         res.status(200).json(Response.build("Evento eliminado exitosamente", 200, true, result));
    //     } catch (err: any) {
    //         console.error("Error al eliminar el evento:", err);
    //         res.status(500).json({ message: err.message });
    //     }
    // }


    public deleteGoogleTotal = async (req: any, res: any, next: any) => {
        try {
            const { id } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            // Primero, obtén el evento desde la base de datos para obtener el idGoogleEvent y otros datos necesarios
            const event = await this.eventService.getEventById(id);

            if (!event) {
                return res.status(404).json(Response.build("Evento no encontrado en la base de datos", 404, false));
            }

            // Luego, elimina el evento de la base de datos
            const result = await this.eventService.deleteEvent(id);

            // Publicar la acción para eliminar el evento en Google Calendar
            RedisSubscriptionStrategyFactory.execute('publish', 'deleteEventGoogle', {
                idUserPlatformFk: event?.idUserPlatformFk,
                idGoogleCalendar: event.calendar?.idGoogleCalendar,
                idGoogleEvent: event?.idGoogleEvent
            });

            res.status(200).json(Response.build("Evento eliminado exitosamente", 200, true, result));
        } catch (err: any) {
            console.error("Error al eliminar el evento:", err);
            res.status(500).json({ message: err.message });
        }
    }


    changeEventStatus = async (req: any, res: any, next: any) => {
        try {
            const { id, status } = req.body;
            const token = req.token;
            await this.jwtService.verify(token);

            const result = await this.eventService.changeEventStatus(id, status);
            res.status(200).json(Response.build("Estado del evento actualizado", 200, true, result));
        } catch (err: any) {
            res.status(500).json({ message: err.message });
        }
    }
}
