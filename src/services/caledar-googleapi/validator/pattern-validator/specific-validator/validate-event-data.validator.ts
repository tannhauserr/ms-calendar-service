import { ValidatorCalendarGoogleApiService as VCGS } from '../../validator-calendar-googleapi.service';
import { AbstractCalendarValidator } from '../abstract-validator';
import { calendar_v3 } from 'googleapis';
import { CalendarValidationRequest } from '../interface/calendar-validation-request';
import { ResponseValidator } from '../interface/response-validation';

export class ValidateEventDataValidator extends AbstractCalendarValidator {
    protected async doValidation(request: CalendarValidationRequest): Promise<ResponseValidator> {
        return VCGS.validateEventData(request);
    }
}
