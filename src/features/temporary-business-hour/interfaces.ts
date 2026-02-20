import moment from "moment";
import { ErrorCatalogByDomain, withCatalogMessage } from "../../models/error-codes";

export type DateISO = string;

export type HoursRangeInput = {
    date?: DateISO;
    start?: DateISO;
    end?: DateISO;
};

/** Normalizes a date range input to a start/end pair in YYYY-MM-DD format. */
export function normalizeRange(
    range?: HoursRangeInput,
    autoDefaultIfMissing: boolean = false
): { start: DateISO; end: DateISO } {
    if (!range) {
        if (!autoDefaultIfMissing) {
            throw new Error(
                withCatalogMessage(
                    ErrorCatalogByDomain.controller.validation.VALIDATION_REQUIRED_FIELD.message,
                    "Range is required"
                )
            );
        }

        return {
            start: moment().subtract(1, "day").format("YYYY-MM-DD"),
            end: moment().add(32, "day").format("YYYY-MM-DD"),
        };
    }

    if (range.date) {
        const date = moment(range.date, "YYYY-MM-DD", true);
        if (!date.isValid()) {
            throw new Error(
                withCatalogMessage(
                    ErrorCatalogByDomain.controller.validation.VALIDATION_INVALID_PAYLOAD.message,
                    "Invalid date format. Expected YYYY-MM-DD"
                )
            );
        }

        const iso = date.format("YYYY-MM-DD");
        return { start: iso, end: iso };
    }

    if (!range.start || !range.end) {
        throw new Error(
            withCatalogMessage(
                ErrorCatalogByDomain.controller.validation.VALIDATION_REQUIRED_FIELD.message,
                "Both start and end are required"
            )
        );
    }

    const start = moment(range.start, "YYYY-MM-DD", true);
    const end = moment(range.end, "YYYY-MM-DD", true);
    if (!start.isValid() || !end.isValid() || end.isBefore(start, "day")) {
        throw new Error(
            withCatalogMessage(
                ErrorCatalogByDomain.controller.validation.VALIDATION_INVALID_PAYLOAD.message,
                "Invalid range"
            )
        );
    }

    return {
        start: start.format("YYYY-MM-DD"),
        end: end.format("YYYY-MM-DD"),
    };
}

/** Lists all days between start and end, both inclusive. */
export function listDaysInclusive(startISO: DateISO, endISO: DateISO): DateISO[] {
    const output: DateISO[] = [];
    let current = moment(startISO, "YYYY-MM-DD");
    const end = moment(endISO, "YYYY-MM-DD");

    while (!current.isAfter(end, "day")) {
        output.push(current.format("YYYY-MM-DD"));
        current = current.add(1, "day");
    }

    return output;
}

/** Checks whether a date string is inside an inclusive range. */
export function isWithin(dateStr: DateISO, startISO: DateISO, endISO: DateISO): boolean {
    const date = moment(dateStr, "YYYY-MM-DD", true);
    return date.isValid() && date.isSameOrAfter(startISO, "day") && date.isSameOrBefore(endISO, "day");
}
