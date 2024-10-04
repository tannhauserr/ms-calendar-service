import { ValidatorCalendarGoogleApiService as VCGS } from "../../validator-calendar-googleapi.service";
import { AbstractCalendarValidator } from "../abstract-validator";
import { ResponseValidator } from "../interface/response-validation";

export class CalendarExistValidator extends AbstractCalendarValidator {
    protected async doValidation(request: { calendarId: string }): Promise<ResponseValidator> {
        // Lógica para verificar si el calendario existe
        return await VCGS.existCalendar(request.calendarId);
    }
}
