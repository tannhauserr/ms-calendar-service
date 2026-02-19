import type moment from "moment";
import type { OnlineBookingConfig } from "../../../../services/@redis/cache/interfaces/models/booking-config";
import type { AvailabilityDepsSpecial } from "../../../../services/@database/event/availability-special.service";
import type { AssignmentSegment, ServiceById } from "../../domain";

export type AddFromWebInput = {
    idCompany: string;
    idWorkspace: string;
    timeZoneClient: string;
    startLocalISO: string;
    attendees: Array<{
        serviceId: string;
        durationMin: number;
        staffId?: string | null;
        categoryId?: string | null;
    }>;
    excludeEventId?: string;
    note?: string;
    isCommentRead?: boolean;
    customer: {
        id: string;
        idClient?: string;
        idClientWorkspace?: string;
        name?: string;
        email?: string;
        phone?: string;
    };
    eventSourceType: "PLATFORM" | "WEB" | "WIDGET" | "GOOGLE" | "BOT";
};

export type UpdateFromWebInput = AddFromWebInput & {
    idEvent: string;
    deletedEventIds?: string[];
};

export type AddFromWebDeps = {
    timeZoneWorkspace: string;
    autoConfirmClientBookings?: boolean;
    businessHoursService: {
        getBusinessHoursFromRedis(idCompany: string, idWorkspace: string): Promise<any>;
    };
    workerHoursService: {
        getWorkerHoursFromRedis(userIds: string[], idWorkspace: string): Promise<any>;
    };
    temporaryHoursService: {
        getTemporaryHoursFromRedis(
            userIds: string[],
            idWorkspace: string,
            range?: { date?: string; start?: string; end?: string }
        ): Promise<any>;
    };
    bookingConfig: OnlineBookingConfig;
    cache?: AvailabilityDepsSpecial["cache"];
};

export type MomentRange = {
    start: moment.Moment;
    end: moment.Moment;
};

export type StartContextResult =
    | {
          ok: true;
          startWS: moment.Moment;
          dateWS: string;
          isToday: boolean;
          roundedNow: moment.Moment;
      }
    | {
          ok: false;
      };

export type AvailabilityContext = {
    userIdsByService: Map<string, string[]>;
    freeWindowsByUser: Record<string, MomentRange[]>;
    serviceById: ServiceById;
    weightsMap: Record<string, number>;
};

export type ResolveAssignmentResult =
    | {
          ok: true;
          assignment: AssignmentSegment[];
          sharedGroupId?: string;
      }
    | {
          ok: false;
      };
