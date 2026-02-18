type RequiredContext = {
    idCompany?: string;
    idWorkspace?: string;
    timeZoneWorkspace?: string;
    timeZoneClient?: string;
};

type CustomerIdentity = {
    id?: string;
    idClientWorkspace?: string;
} | null | undefined;

/**
 * Reglas de presencia mínima de datos para crear reservas web.
 */
export class InputRequiredPolicy {
    /**
     * Comprueba que el contexto base tenga los identificadores obligatorios.
     */
    public static hasRequiredContext(input: RequiredContext): boolean {
        return !!(input.idCompany && input.idWorkspace && input.timeZoneWorkspace && input.timeZoneClient);
    }

    /**
     * Comprueba que exista al menos un servicio solicitado.
     */
    public static hasAttendees(attendees: unknown): boolean {
        return Array.isArray(attendees) && attendees.length > 0;
    }

    /**
     * Comprueba que el cliente tenga identificadores válidos para operar en el workspace.
     */
    public static hasCustomerIdentifiers(customer: CustomerIdentity): boolean {
        return !!(customer?.id && customer?.idClientWorkspace);
    }
}
