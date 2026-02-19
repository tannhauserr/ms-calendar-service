import { BookingErrorCatalog } from "../../models/error-codes";

// Helper para deducir un status a partir de un code
export function pickHttpStatus(code?: string, ok?: boolean) {
    if (ok) return 200;
    if (!code) return 400;
    return CODE_HTTP_MAP[code] ?? 400;
}


const CODE_HTTP_MAP: Record<string, number> = Object.values(BookingErrorCatalog).reduce<Record<string, number>>(
    (acc, errorDefinition) => {
        if (typeof errorDefinition.httpStatus === "number") {
            acc[errorDefinition.code] = errorDefinition.httpStatus;
        }
        return acc;
    },
    {}
);
