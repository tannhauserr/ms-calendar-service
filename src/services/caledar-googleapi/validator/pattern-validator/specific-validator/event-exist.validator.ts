import { ValidatorCalendarGoogleApiService as VCGS } from "../../validator-calendar-googleapi.service";
import { AbstractCalendarValidator } from "../abstract-validator";
import { ResponseValidator } from "../interface/response-validation";


export class EventExistValidator extends AbstractCalendarValidator {
    protected async doValidation(request: { idUser: string, calendarId: string, eventId: string }): Promise<ResponseValidator> {
        const { idUser, calendarId, eventId } = request;
        return VCGS.existEvent(idUser, calendarId, eventId);
    }
}
