import fs from 'fs';
import path from 'path';
import { UtilGeneral } from '../../utils/util-general';



class CustomError extends Error {
    serviceName: string;
    originalError: Error;

    errorFile: string;
    errorLine: number;

    constructor(serviceName: string, originalError: Error) {
        super(`Error in service ${serviceName}: ${originalError.message}`);
        this.name = 'CustomError';
        this.serviceName = serviceName;
        this.originalError = originalError;

        // Captura el archivo y la línea donde ocurrió el error
        // const { errorFile, errorLine } = this.extractErrorLocation(originalError);
        // this.errorFile = errorFile;
        // this.errorLine = errorLine;


        // Log the error to a file
        this.logErrorToFile();


        // Mantiene el stack trace del error original.
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, CustomError);
        }
    }



        public logErrorToFile = () => {
            const logFilePath = path.join(__dirname, '../../../error_service.log');
            const localISOTime = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString();

            const errorMessage = `
    =====================================================
    Date: ${localISOTime}
    Service: ${this.serviceName}
    Error Message: ${this.originalError.message}
    Stack Trace: ${this.originalError.stack}
    =====================================================
    `;

            fs.appendFile(logFilePath, errorMessage, (err) => {
                if (err) {
                    console.error('Failed to write error to log file:', err);
                } else {
                    console.log('Error logged to file:', logFilePath);
                }
            });
        }

    // private extractErrorLocation = (error: Error): { errorFile: string; errorLine: number } => {
    //     const stackLines = error.stack?.split('\n') || [];

    //     // Busca en cada línea del stack hasta encontrar una que contenga la ubicación del archivo
    //     for (const line of stackLines) {
    //         const match = line.match(/\((.*):(\d+):\d+\)/) || line.match(/at (.*):(\d+):\d+/);
    //         if (match) {
    //             return {
    //                 errorFile: match[1],
    //                 errorLine: parseInt(match[2], 10),
    //             };
    //         }
    //     }

    //     return {
    //         errorFile: undefined,
    //         errorLine: undefined,
    //     };
    // }

    // private logErrorToFile = () => {
    //     const logFilePath = path.join(__dirname, '../../../error_service.log');
    //     const currentTime = new Date();
    //     const localTime = currentTime.toLocaleTimeString('es-Es', { hour12: false });
    //     const formattedDate = currentTime.toISOString().split('T')[0]; // Solo la fecha en formato YYYY-MM-DD

    //     const errorMessage = `[${formattedDate}][${localTime}][${this.serviceName}][${this.originalError.message}][File: ${this.errorFile}, Line: ${this.errorLine}]\n`;

    //     fs.appendFile(logFilePath, errorMessage, (err) => {
    //         if (err) {
    //             console.error('Failed to write error to log file:', err);
    //         } else {
    //             console.log('Error logged to file:', logFilePath);
    //         }
    //     });
    // };

}

export default CustomError;