import { TIME_SECONDS } from "../../../../../../constant/time";
import CustomError from "../../../../../../models/custom-error/CustomError";
import { EventService } from "../../../../../@database/event/event.service";
import { EventCalendarGoogleService } from "../../../../../caledar-googleapi/event-calendar-googleapi.service";
import { CalendarValidationRequest } from "../../../../../caledar-googleapi/validator/pattern-validator/interface/calendar-validation-request";
import { ResponseValidator } from "../../../../../caledar-googleapi/validator/pattern-validator/interface/response-validation";
import { CalendarExistValidator, HasAccessToCalendarValidator, ValidateEventDataValidator } from "../../../../../caledar-googleapi/validator/pattern-validator/specific-validator";
import { AvoidSameEventStrategy } from "../../../../cache/strategies/avoidSameEvent/avoidSameEvent.strategy";
import { RedisStrategyFactory } from "../../../../cache/strategies/redisStrategyFactory";
import { SubscriberActions } from "../../../action/subscription.action";
import { RedisSubscriptionStrategyFactory } from "../redisSubscriptionStrategyFactory";

export const createEventGoogleSubscription = () => {
    const SSFactory = RedisSubscriptionStrategyFactory;

    // Suscripción al canal 'createEvent'
    SSFactory.execute('subscribe', 'createEventGoogle', async (message) => {
        console.log(`Mensaje recibido en el canal "${SubscriberActions.createEventGoogle}":`, message);
        const {
            idRowEventDB,
            idUserPlatformFk,
            idGoogleCalendar,
            title,
            startDate,
            endDate,
            description,
            eventColor
        } = message;

        try {

            // Aquí puedes realizar la validación si es necesario antes de crear el evento
            const isValid = await _validadorCreateEvent(idUserPlatformFk, idGoogleCalendar, {
                summary: title,
                startDate,
                endDate
            });

            if (isValid) {
                const googleEvent = await _createGoogleEvent(
                    idUserPlatformFk,
                    idGoogleCalendar,
                    title,
                    startDate,
                    endDate,
                    description,
                    eventColor
                );
                console.log("Evento creado exitosamente en Google Calendar.");

                // /**
                //  * TODO: Esto es para evitar que el channel de google use el evento entrante para crear/editar/eliminar el mismo evento
                //  * Esta acción se habría hecho desde la plataforma o el bot
                //  */
                // let avoidSameEventStrategy = RedisStrategyFactory.getStrategy('avoidSameEvent') as AvoidSameEventStrategy;
                // avoidSameEventStrategy.setEventFromGoogle(googleEvent.id, TIME_SECONDS.MINUTE);

                // Finalmente, actualiza tu evento en la base de datos con el ID del evento de Google
                const eventService = new EventService();
                await eventService.updateEvent({ id: idRowEventDB, idGoogleEvent: googleEvent.id });


            } else {
                console.error("Validación fallida. No se creó el evento en Google Calendar.");
                // throw new Error("Validación fallida. No se creó el evento en Google Calendar.");
            }
        } catch (error: any) {
            console.error("Error al crear el evento en Google Calendar:", error);
            new CustomError('createEventSubscription', error);
        }
    });

}


const _validadorCreateEvent = async (idUser: string, idCalendarGoogle, eventData: {
    summary: string;
    startDate: string;
    endDate: string;
}): Promise<ResponseValidator> => {
    const calendarExistValidator = new CalendarExistValidator();
    const accessToCalendarValidator = new HasAccessToCalendarValidator();
    const eventDataValidator = new ValidateEventDataValidator();

    // Configurar la cadena de validación
    calendarExistValidator
        .setNext(accessToCalendarValidator)
        .setNext(eventDataValidator);

    // Crear el objeto request para los validadores
    const validationRequest: CalendarValidationRequest = {
        idUser: idUser,
        calendarId: idCalendarGoogle,
        eventData
    };

    const isValid = await calendarExistValidator.validate(validationRequest);
    // Lógica para validar los datos del evento
    return isValid;
}

const _createGoogleEvent = async (
    idUserPlatformFk: string,
    idGoogleCalendar: string,
    title: string,
    startDate: string,
    endDate: string,
    description: string,
    eventColor: string): Promise<any> => {
    const eventCalendarGoogleService = new EventCalendarGoogleService();
    return await eventCalendarGoogleService.createEvent(
        idUserPlatformFk,
        idGoogleCalendar,
        title,
        startDate,
        endDate,
        description,
        eventColor
    );
}
