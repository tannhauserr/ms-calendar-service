import { TIME_SECONDS } from "../../../../../../constant/time";
import CustomError from "../../../../../../models/custom-error/CustomError";
import { EventCalendarGoogleService } from "../../../../../caledar-googleapi/event-calendar-googleapi.service";
import { CalendarValidationRequest } from "../../../../../caledar-googleapi/validator/pattern-validator/interface/calendar-validation-request";
import { ResponseValidator } from "../../../../../caledar-googleapi/validator/pattern-validator/interface/response-validation";
import { CalendarExistValidator, EventExistValidator, HasAccessToCalendarValidator, ValidateEventDataValidator } from "../../../../../caledar-googleapi/validator/pattern-validator/specific-validator";
import { AvoidSameEventStrategy } from "../../../../cache/strategies/avoidSameEvent/avoidSameEvent.strategy";
import { RedisStrategyFactory } from "../../../../cache/strategies/redisStrategyFactory";
import { SubscriberActions } from "../../../action/subscription.action";
import { RedisSubscriptionStrategyFactory } from "../redisSubscriptionStrategyFactory";

export const deleteEventGoogleSubscription = () => {
    const SSFactory = RedisSubscriptionStrategyFactory;

    SSFactory.execute('subscribe', 'deleteEventGoogle', async (message) => {
        console.log(`Mensaje recibido en el canal "${SubscriberActions.deleteEventGoogle}":`, message);
        const { idUserPlatformFk, idGoogleCalendar, idGoogleEvent } = message;

        try {
            const isValid = await _validadorDeleteEvent(idUserPlatformFk, idGoogleCalendar, idGoogleEvent);

            if (isValid) {
                /**
                * TODO: Esto es para evitar que el channel de google use el evento entrante para crear/editar/eliminar el mismo evento
                * Esta acción se habría hecho desde la plataforma o el bot
                */
                // let avoidSameEventStrategy = RedisStrategyFactory.getStrategy('avoidSameEvent') as AvoidSameEventStrategy;
                // avoidSameEventStrategy.setEventFromGoogle(idGoogleEvent, TIME_SECONDS.MINUTE);

                const eventCalendarGoogleService = new EventCalendarGoogleService();
                await eventCalendarGoogleService.deleteEvent(
                    idUserPlatformFk,
                    idGoogleCalendar,
                    idGoogleEvent
                );

                console.log("Evento eliminado exitosamente de Google Calendar.");
            } else {
                console.error("Validación fallida. No se eliminó el evento en Google Calendar.");
                new CustomError('deleteEventGoogleSubscription', new Error(isValid?.message));
            }
        } catch (error: any) {
            if (error.message && error.message.includes('Resource not found')) {
                console.warn("El evento no se encontró en Google Calendar, pero fue eliminado de la base de datos.");
            } else {
                console.error("Error al eliminar el evento en Google Calendar:", error);
                new CustomError('deleteEventGoogleSubscription', error, 'simple');
            }
        }
    });
}


const _validadorDeleteEvent = async (idUser: string, idCalendarGoogle, idEventGoogle): Promise<ResponseValidator> => {
    const calendarExistValidator = new CalendarExistValidator();
    const accessToCalendarValidator = new HasAccessToCalendarValidator();
    const validateEventExist = new EventExistValidator();

    // Configurar la cadena de validación
    calendarExistValidator
        .setNext(accessToCalendarValidator)
        .setNext(validateEventExist);

    // Crear el objeto request para los validadores
    const validationRequest: CalendarValidationRequest = {
        idUser: idUser,
        calendarId: idCalendarGoogle,
        eventId: idEventGoogle,
    };

    const isValid = await calendarExistValidator.validate(validationRequest);
    // Lógica para validar los datos del evento
    return isValid;
}
