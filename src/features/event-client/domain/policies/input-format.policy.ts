const START_LOCAL_ISO_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

/**
 * Reglas de formato para campos de entrada.
 */
export class InputFormatPolicy {
    /**
     * Valida el formato esperado de `startLocalISO` en alta web.
     */
    public static isStartLocalISO(value: unknown): value is string {
        return typeof value === "string" && START_LOCAL_ISO_REGEX.test(value);
    }
}
