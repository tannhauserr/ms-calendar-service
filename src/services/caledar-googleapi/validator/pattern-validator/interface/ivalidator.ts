import { CalendarValidationRequest } from "./calendar-validation-request";

export interface ICalendarValidator {
    setNext(validator: ICalendarValidator): ICalendarValidator;
    validate(request: CalendarValidationRequest): Promise<{
        isValid: boolean;
        message?: string;
        item?: any;
    }>;

}


