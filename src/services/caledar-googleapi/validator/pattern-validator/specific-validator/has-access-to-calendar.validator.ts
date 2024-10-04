import { ValidatorCalendarGoogleApiService as VCGS } from "../../validator-calendar-googleapi.service";
import { AbstractCalendarValidator } from "../abstract-validator";
import { ResponseValidator } from "../interface/response-validation";

export class HasAccessToCalendarValidator extends AbstractCalendarValidator {
    protected async doValidation(request: { idUser: string, calendarId: string }): Promise<ResponseValidator> {
        const { idUser, calendarId } = request;
        return VCGS.hasAccessToCalendar(idUser, calendarId);
    }
}
