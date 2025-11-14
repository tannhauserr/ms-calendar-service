// Helper para deducir un status a partir de un code
export function pickHttpStatus(code?: string, ok?: boolean) {
    if (ok) return 200;
    if (!code) return 400;
    return CODE_HTTP_MAP[code] ?? 400;
}


const CODE_HTTP_MAP: Record<string, number> = {
    // Validaciones y reglas de negocio
    BOOKING_ERR_DAY_IN_PAST: 400,
    BOOKING_ERR_TIME_PASSED: 400,
    BOOKING_ERR_LEAD_TIME: 400,
    BOOKING_ERR_VALIDATION_INPUT: 422,
    BOOKING_ERR_MAX_SERVICES: 422,

    // Autorización / ownership
    BOOKING_ERR_NOT_OWNER: 403,

    // Disponibilidad / conflictos
    BOOKING_ERR_NO_ELIGIBLE_STAFF: 409,
    BOOKING_ERR_NO_AVAILABLE_WINDOW: 409,
    BOOKING_ERR_RR_NO_CANDIDATE: 409,
    BOOKING_ERR_MULTI_SEGMENT_DOES_NOT_FIT: 409,
    BOOKING_ERR_MULTI_RR_NO_CANDIDATE: 409,
    BOOKING_ERR_OVERLAP_CONFLICT: 409,

    // No implementado todavía
    BOOKING_ERR_GROUP_UNSUPPORTED: 501,

    // Genérico
    BOOKING_ERR_GENERIC: 400,
    BOOKING_ERR_UNEXPECTED: 500,
};

