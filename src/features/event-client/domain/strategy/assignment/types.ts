import type moment from "moment";

export type AttendeeRequest = {
    serviceId: string;
    durationMin: number;
    staffId?: string | null;
    categoryId?: string | null;
};

export type ServiceSnapshot = {
    id: string;
    duration?: number | null;
    maxParticipants?: number | null;
};

export type ServiceById = Record<string, ServiceSnapshot>;

export type FreeWindow = {
    start: moment.Moment;
    end: moment.Moment;
};

export type AssignmentSegment = {
    serviceId: string;
    userId: string;
    start: moment.Moment;
    end: moment.Moment;
};

export type AssignmentMode = "single-group" | "single-individual" | "multi-individual";

export type AssignmentFailureReason =
    | "INVALID_INPUT"
    | "NO_STAFF"
    | "NO_WINDOW"
    | "NO_AVAILABILITY";

export type AssignmentResult =
    | { ok: true; assignment: AssignmentSegment[] }
    | { ok: false; reason: AssignmentFailureReason };

export type AssignmentStrategyInput = {
    idWorkspace: string;
    startWS: moment.Moment;
    attendees: AttendeeRequest[];
    serviceById: ServiceById;
    userIdsByService: Map<string, string[]>;
    freeWindowsByUser: Record<string, FreeWindow[]>;
    weightsMap: Record<string, number>;
    chooseStaffWithRR: (
        idWorkspace: string,
        idBookingPage: string | undefined,
        idService: string,
        start: Date,
        end: Date,
        eligibles: string[],
        weightsMap: Record<string, number>
    ) => Promise<string | null>;
    assignSequentially: (params: {
        idx: number;
        start: moment.Moment;
        attendees: AttendeeRequest[];
        eligibleUsersByService: Record<string, string[]>;
        freeWindowsByUser: Record<string, FreeWindow[]>;
        usedByUserAt: Array<{ userId: string; start: moment.Moment; end: moment.Moment }>;
        assignment: AssignmentSegment[];
    }) => boolean;
};
