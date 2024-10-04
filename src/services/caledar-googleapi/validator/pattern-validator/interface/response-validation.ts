export interface ResponseValidator {
    isValid: boolean;
    message?: string;
    item?: any;
}