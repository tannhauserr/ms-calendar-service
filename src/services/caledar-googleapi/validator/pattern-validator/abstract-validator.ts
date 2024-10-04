// import { CalendarValidationRequest } from "./interface/calendar-validation-request";
// import { ICalendarValidator } from "./interface/ivalidator";

// export abstract class AbstractCalendarValidator implements ICalendarValidator {
//     private nextValidator: ICalendarValidator;

//     public setNext(validator: ICalendarValidator): ICalendarValidator {
//         this.nextValidator = validator;
//         return validator;
//     }

//     public async validate(request: CalendarValidationRequest): Promise<boolean> {
//         const isValid = await this.doValidation(request);
//         if (isValid) {
//             return this.nextValidator ? this.nextValidator.validate(request) : isValid;
//         }
//         return false;
//     }

//     protected abstract doValidation(request: CalendarValidationRequest): Promise<boolean>;
// }


import { CalendarValidationRequest } from "./interface/calendar-validation-request";
import { ICalendarValidator } from "./interface/ivalidator";
import { ResponseValidator } from "./interface/response-validation";

export abstract class AbstractCalendarValidator implements ICalendarValidator {
    private nextValidator: ICalendarValidator;

    public setNext(validator: ICalendarValidator): ICalendarValidator {
        this.nextValidator = validator;
        return validator;
    }

    public async validate(request: CalendarValidationRequest): Promise<ResponseValidator> {
        const result = await this.doValidation(request);
        if (result.isValid) {
            return this.nextValidator ? this.nextValidator.validate(request) : result;
        }
        // Si no es válido, retornamos el resultado con el mensaje y/o ítem asociado
        return result;
    }

    // Ahora, el método abstracto doValidation devuelve un objeto que contiene isValid, message, y item
    protected abstract doValidation(request: CalendarValidationRequest): Promise<ResponseValidator>;
}
