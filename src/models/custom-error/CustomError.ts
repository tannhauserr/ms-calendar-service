import path from "path";
import pino from "pino";
import { CONSOLE_COLOR } from "../../constant/console-color";

type MessageStoredType = "simple" | "verbose" | "none";

const verboseLogPath = path.join(__dirname, "../../../error_service.log");
const simpleLogPath = path.join(__dirname, "../../../error_service_simple.log");
const isDevelopment = process.env.NODE_ENV !== "production";

const verboseLogger = pino(
    {
        level: "error",
        base: null,
        timestamp: pino.stdTimeFunctions.isoTime,
        transport: isDevelopment
            ? {
                  target: "pino-pretty",
                  options: {
                      colorize: true,
                      translateTime: "yyyy-mm-dd HH:MM:ss",
                      ignore: "pid,hostname",
                      destination: verboseLogPath,
                      mkdir: true,
                  },
              }
            : undefined,
    },
    isDevelopment ? undefined : pino.destination({ dest: verboseLogPath, sync: false })
);

const simpleLogger = pino(
    {
        level: "error",
        base: null,
        timestamp: pino.stdTimeFunctions.isoTime,
        transport: isDevelopment
            ? {
                  target: "pino-pretty",
                  options: {
                      colorize: true,
                      translateTime: "yyyy-mm-dd HH:MM:ss",
                      ignore: "pid,hostname",
                      destination: simpleLogPath,
                      mkdir: true,
                  },
              }
            : undefined,
    },
    isDevelopment ? undefined : pino.destination({ dest: simpleLogPath, sync: false })
);

class CustomError extends Error {
    serviceName: string;
    originalError: Error;
    errorFile?: string;
    errorLine?: number;

    constructor(serviceName: string, originalError: Error, messageStoredType: MessageStoredType = "verbose") {
        super(`Error in service ${serviceName}: ${originalError.message}`);
        this.name = "CustomError";
        this.serviceName = serviceName;
        this.originalError = originalError;

        const { errorFile, errorLine } = this.extractErrorLocation(originalError);
        this.errorFile = errorFile;
        this.errorLine = errorLine;

        if (messageStoredType === "simple") this.logErrorToFileSimple();
        else if (messageStoredType === "verbose") this.logErrorToFileVerbose();

        console.log(`${CONSOLE_COLOR.BgYellow}[CustomError]${CONSOLE_COLOR.Reset} ${serviceName} - ${originalError.message}`);
        if (this.errorFile && this.errorLine) {
            console.log(`    at ${this.errorFile}:${this.errorLine}`);
        }

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, CustomError);
        }
    }

    public logErrorToFileVerbose = () => {
        verboseLogger.error(
            {
                service: this.serviceName,
                err: this.originalError,
                errorFile: this.errorFile,
                errorLine: this.errorLine,
            },
            "Error en servicio (verbose)"
        );
    };

    private extractErrorLocation = (error: Error): { errorFile?: string; errorLine?: number } => {
        const stackLines = error.stack?.split("\n") || [];

        for (const line of stackLines) {
            const match = line.match(/\((.*):(\d+):\d+\)/) || line.match(/at (.*):(\d+):\d+/);
            if (match) {
                return {
                    errorFile: match[1],
                    errorLine: parseInt(match[2], 10),
                };
            }
        }

        return {};
    };

    private logErrorToFileSimple = () => {
        simpleLogger.error(
            {
                service: this.serviceName,
                message: this.originalError.message,
                errorFile: this.errorFile,
                errorLine: this.errorLine,
            },
            "Error en servicio (simple)"
        );
    };
}

export default CustomError;
