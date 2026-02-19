type MscalErrorCode = `MSCAL${number}`;
type BookingErrorCode = `BOOKING_${string}`;

export type AppErrorCode = MscalErrorCode | BookingErrorCode;

export type AppErrorDefinition = {
    code: AppErrorCode;
    message: string;
    httpStatus?: number;
};

export const ErrorCatalogByDomain = {
    middleware: {
        auth: {
            AUTH_CACHE_ROLE_MISMATCH: {
                code: "MSCAL1",
                message: "You are not allowed to perform this action.",
            },
            AUTH_ACCESS_AUTHORIZED_FAILURE: {
                code: "MSCAL2",
                message: "Failed to validate token or role.",
            },
            AUTH_ADMIN_REQUIRED: {
                code: "MSCAL3",
                message: "Admin role is required for this action.",
            },
            AUTH_ADMIN_OR_MANAGER_REQUIRED: {
                code: "MSCAL4",
                message: "Admin or manager role is required for this action.",
            },
            AUTH_MANAGER_OR_OWNER_OR_SELF_REQUIRED: {
                code: "MSCAL5",
                message: "You are not allowed to perform this action.",
            },
            AUTH_MANAGER_OR_OWNER_REQUIRED: {
                code: "MSCAL6",
                message: "Admin, owner or manager role is required for this action.",
            },
            AUTH_ADMIN_OR_SELF_REQUIRED: {
                code: "MSCAL7",
                message: "You can only operate on your own resource.",
            },
            AUTH_ROLE_NOT_ALLOWED: {
                code: "MSCAL8",
                message: "Role is not allowed for this action.",
            },
            AUTH_MY_ID_REQUIRED: {
                code: "MSCAL9",
                message: "Field 'myId' is required.",
            },
            AUTH_MY_ID_MISMATCH: {
                code: "MSCAL10",
                message: "You cannot operate on a different user id.",
            },
            AUTH_TOKEN_VALIDATION_FAILED: {
                code: "MSCAL11",
                message: "Token validation failed.",
            },
        },
        bookingGuards: {
            BOOKING_GUARDS_BASE_VALIDATION: {
                code: "MSCAL100",
                message: "Invalid booking payload.",
            },
            BOOKING_GUARDS_RESOLVE_WORKSPACE: {
                code: "MSCAL110",
                message: "Failed to resolve workspace.",
            },
            BOOKING_GUARDS_RESOLVE_BOOKING_PAGE: {
                code: "MSCAL120",
                message: "Failed to resolve booking page.",
            },
            BOOKING_GUARDS_RESOLVE_CLIENT_WORKSPACE: {
                code: "MSCAL130",
                message: "Failed to resolve client workspace.",
            },
            BOOKING_GUARDS_ENFORCE_TIME_RULES: {
                code: "MSCAL140",
                message: "Booking is not allowed for the requested time.",
            },
            BOOKING_GUARDS_ENFORCE_USER_LIMITS: {
                code: "MSCAL150",
                message: "Booking limit reached.",
            },
            BOOKING_GUARDS_FEATURE_FLAGS: {
                code: "MSCAL160",
                message: "Feature validation failed.",
            },
            BOOKING_GUARDS_BASE_CONTEXT: {
                code: "MSCAL170",
                message: "Invalid booking context payload.",
            },
            BOOKING_GUARDS_UNKNOWN: {
                code: "MSCAL199",
                message: "Booking guard validation failed.",
            },
        },
        workerAbsence: {
            WORKER_ABSENCE_ID_USER_REQUIRED: {
                code: "MSCAL201",
                message: "Field 'idUserFk' is required.",
            },
            WORKER_ABSENCE_START_DATE_REQUIRED: {
                code: "MSCAL202",
                message: "Field 'startDate' is required.",
            },
            WORKER_ABSENCE_END_DATE_REQUIRED: {
                code: "MSCAL203",
                message: "Field 'endDate' is required.",
            },
            WORKER_ABSENCE_INTERNAL_ERROR: {
                code: "MSCAL204",
                message: "Failed to process worker absence cleanup.",
            },
        },
        businessHour: {
            BUSINESS_HOUR_INVALID_TIME_FORMAT: {
                code: "MSCAL301",
                message: "Invalid time format. Use 'HH:mm'.",
            },
            BUSINESS_HOUR_DELETE_CLOSED_ERROR: {
                code: "MSCAL302",
                message: "Failed to remove closed records.",
            },
            BUSINESS_HOUR_OVERLAPPING_SLOT: {
                code: "MSCAL303",
                message: "Schedule overlaps with an existing record.",
            },
            BUSINESS_HOUR_OVERLAPPING_VALIDATION_ERROR: {
                code: "MSCAL304",
                message: "Failed to validate overlapping schedule.",
            },
        },
        common: {
            INTERNAL_SERVER_ERROR: {
                code: "MSCAL999",
                message: "Internal server error.",
            },
        },
    },
    controller: {
        validation: {
            VALIDATION_REQUIRED_FIELD: {
                code: "MSCAL401",
                message: "Required field is missing.",
            },
            VALIDATION_INVALID_PAYLOAD: {
                code: "MSCAL402",
                message: "Invalid request payload.",
            },
        },
        resource: {
            RESOURCE_NOT_FOUND: {
                code: "MSCAL404",
                message: "Resource not found.",
            },
        },
        business: {
            BUSINESS_RULE_NOT_ALLOWED: {
                code: "MSCAL409",
                message: "Operation is not allowed.",
            },
            FEATURE_DISABLED: {
                code: "MSCAL410",
                message: "Feature is disabled.",
            },
        },
        common: {
            INTERNAL_SERVER_ERROR: {
                code: "MSCAL999",
                message: "Internal server error.",
            },
        },
    },
    booking: {
        validation: {
            BOOKING_ERR_DAY_IN_PAST: {
                code: "BOOKING_ERR_DAY_IN_PAST",
                message: "Booking day is in the past.",
                httpStatus: 400,
            },
            BOOKING_ERR_TIME_PASSED: {
                code: "BOOKING_ERR_TIME_PASSED",
                message: "Booking time has already passed.",
                httpStatus: 400,
            },
            BOOKING_ERR_LEAD_TIME: {
                code: "BOOKING_ERR_LEAD_TIME",
                message: "Booking does not satisfy lead time requirements.",
                httpStatus: 400,
            },
            BOOKING_ERR_VALIDATION_INPUT: {
                code: "BOOKING_ERR_VALIDATION_INPUT",
                message: "Invalid booking input.",
                httpStatus: 422,
            },
            BOOKING_ERR_MAX_SERVICES: {
                code: "BOOKING_ERR_MAX_SERVICES",
                message: "Maximum number of services exceeded.",
                httpStatus: 422,
            },
        },
        authorization: {
            BOOKING_ERR_NOT_OWNER: {
                code: "BOOKING_ERR_NOT_OWNER",
                message: "You are not allowed to modify this booking.",
                httpStatus: 403,
            },
        },
        availability: {
            BOOKING_ERR_NO_ELIGIBLE_STAFF: {
                code: "BOOKING_ERR_NO_ELIGIBLE_STAFF",
                message: "No eligible staff found.",
                httpStatus: 409,
            },
            BOOKING_ERR_NO_AVAILABLE_WINDOW: {
                code: "BOOKING_ERR_NO_AVAILABLE_WINDOW",
                message: "No available time window found.",
                httpStatus: 409,
            },
            BOOKING_ERR_RR_NO_CANDIDATE: {
                code: "BOOKING_ERR_RR_NO_CANDIDATE",
                message: "Round-robin did not find a valid candidate.",
                httpStatus: 409,
            },
            BOOKING_ERR_MULTI_SEGMENT_DOES_NOT_FIT: {
                code: "BOOKING_ERR_MULTI_SEGMENT_DOES_NOT_FIT",
                message: "Multi-segment booking does not fit in available windows.",
                httpStatus: 409,
            },
            BOOKING_ERR_MULTI_RR_NO_CANDIDATE: {
                code: "BOOKING_ERR_MULTI_RR_NO_CANDIDATE",
                message: "Round-robin did not find a valid candidate for multi-segment booking.",
                httpStatus: 409,
            },
            BOOKING_ERR_OVERLAP_CONFLICT: {
                code: "BOOKING_ERR_OVERLAP_CONFLICT",
                message: "Booking conflicts with an existing event.",
                httpStatus: 409,
            },
        },
        feature: {
            BOOKING_ERR_GROUP_UNSUPPORTED: {
                code: "BOOKING_ERR_GROUP_UNSUPPORTED",
                message: "Group booking is not supported yet.",
                httpStatus: 501,
            },
        },
        common: {
            BOOKING_ERR_GENERIC: {
                code: "BOOKING_ERR_GENERIC",
                message: "Booking request failed.",
                httpStatus: 400,
            },
            BOOKING_ERR_UNEXPECTED: {
                code: "BOOKING_ERR_UNEXPECTED",
                message: "Unexpected booking error.",
                httpStatus: 500,
            },
        },
        info: {
            BOOKING_INFO_EVENT_REBUILT: {
                code: "BOOKING_INFO_EVENT_REBUILT",
                message: "Booking was rebuilt to preserve consistency.",
                httpStatus: 200,
            },
        },
    },
} as const;

export const MiddlewareErrorCatalog = {
    ...ErrorCatalogByDomain.middleware.auth,
    ...ErrorCatalogByDomain.middleware.bookingGuards,
    ...ErrorCatalogByDomain.middleware.workerAbsence,
    ...ErrorCatalogByDomain.middleware.businessHour,
    ...ErrorCatalogByDomain.middleware.common,
} as const;

export const ControllerErrorCatalog = {
    ...ErrorCatalogByDomain.controller.validation,
    ...ErrorCatalogByDomain.controller.resource,
    ...ErrorCatalogByDomain.controller.business,
    ...ErrorCatalogByDomain.controller.common,
} as const;

export const BookingErrorCatalog = {
    ...ErrorCatalogByDomain.booking.validation,
    ...ErrorCatalogByDomain.booking.authorization,
    ...ErrorCatalogByDomain.booking.availability,
    ...ErrorCatalogByDomain.booking.feature,
    ...ErrorCatalogByDomain.booking.common,
    ...ErrorCatalogByDomain.booking.info,
} as const;

export type MiddlewareErrorCatalogKey = keyof typeof MiddlewareErrorCatalog;
export type ControllerErrorCatalogKey = keyof typeof ControllerErrorCatalog;
export type BookingErrorCatalogKey = keyof typeof BookingErrorCatalog;
