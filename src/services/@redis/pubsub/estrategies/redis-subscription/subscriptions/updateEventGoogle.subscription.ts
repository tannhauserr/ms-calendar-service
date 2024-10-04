import { TIME_SECONDS } from "../../../../../../constant/time";
import CustomError from "../../../../../../models/custom-error/CustomError";
import { CalendarGoogleApiService } from "../../../../../caledar-googleapi/calendar-googleapi.service";
import { EventCalendarGoogleService } from "../../../../../caledar-googleapi/event-calendar-googleapi.service";
import { CalendarValidationRequest } from "../../../../../caledar-googleapi/validator/pattern-validator/interface/calendar-validation-request";
import { ResponseValidator } from "../../../../../caledar-googleapi/validator/pattern-validator/interface/response-validation";
import { CalendarExistValidator, EventExistValidator, HasAccessToCalendarValidator, ValidateEventDataValidator } from "../../../../../caledar-googleapi/validator/pattern-validator/specific-validator";
import { AvoidSameEventStrategy } from "../../../../cache/strategies/avoidSameEvent/avoidSameEvent.strategy";
import { RedisStrategyFactory } from "../../../../cache/strategies/redisStrategyFactory";
import { SubscriberActions } from "../../../action/subscription.action";
import { RedisSubscriptionStrategyFactory } from "../redisSubscriptionStrategyFactory";

export const updateEventGoogleSubscription = () => {
    const SSFactory = RedisSubscriptionStrategyFactory;

    SSFactory.execute('subscribe', 'updateEventGoogle', async (message) => {
        console.log(`Mensaje recibido en el canal "${SubscriberActions.updateEventGoogle}":`, message);
        const {
            idRowEventDB,
            idUserPlatformFk,
            idGoogleCalendar,
            idGoogleEvent,
            title,
            startDate,
            endDate,
            description,
            eventColor
        } = message;

        try {
            // Realizar la validación antes de actualizar el evento en Google Calendar
            const isValid = await _validadorUpdateEvent(idUserPlatformFk, idGoogleCalendar, {
                summary: title,
                startDate,
                endDate
            });

            if (isValid) {
                /**
                * TODO: Esto es para evitar que el channel de google use el evento entrante para crear/editar/eliminar el mismo evento
                * Esta acción se habría hecho desde la plataforma o el bot
                */
                // let avoidSameEventStrategy = RedisStrategyFactory.getStrategy('avoidSameEvent') as AvoidSameEventStrategy;
                // avoidSameEventStrategy.setEventFromGoogle(idGoogleEvent, TIME_SECONDS.MINUTE);

                await _updateGoogleEvent(
                    idUserPlatformFk,
                    idGoogleCalendar,
                    idGoogleEvent,
                    title,
                    startDate,
                    endDate,
                    description,
                    eventColor

                );
                console.log("Evento actualizado exitosamente en Google Calendar.");
            } else {
                console.error("Validación fallida. No se actualizó el evento en Google Calendar.");
                new CustomError('updateEventGoogleSubscription', new Error(isValid?.message));
            }
        } catch (error: any) {
            console.error("Error al actualizar el evento en Google Calendar:", error);
            new CustomError('updateEventGoogleSubscription', error, 'simple');
        }
    });
};

const _validadorUpdateEvent = async (idUser: string, idCalendarGoogle: string, eventData: {
    summary: string;
    startDate: string;
    endDate: string;
}): Promise<ResponseValidator> => {
    const calendarExistValidator = new CalendarExistValidator();
    const accessValidator = new HasAccessToCalendarValidator();
    const validateEventExist = new EventExistValidator();
    const eventDataValidator = new ValidateEventDataValidator();


    // Configurar la cadena de validación
    calendarExistValidator
        .setNext(accessValidator)
        .setNext(validateEventExist)
        .setNext(eventDataValidator);

    // Crear el objeto request para los validadores
    const validationRequest: CalendarValidationRequest = {
        idUser: idUser,
        calendarId: idCalendarGoogle,
        eventData
    };

    const responseValidator = await calendarExistValidator.validate(validationRequest);
    return responseValidator;
};



const _updateGoogleEvent = async (
    idUserPlatformFk: string,
    idGoogleCalendar: string,
    idGoogleEvent: string,
    title: string,
    startDate: string,
    endDate: string,
    description: string,
    eventColor: string
): Promise<any> => {
    const eventCalendarGoogleService = new EventCalendarGoogleService();
    console.log("llega idGoogleEvent", idGoogleEvent);
    return await eventCalendarGoogleService.updateEvent(
        idUserPlatformFk,
        idGoogleCalendar,
        idGoogleEvent,
        title,
        startDate,
        endDate,
        description,
        eventColor
    );
}