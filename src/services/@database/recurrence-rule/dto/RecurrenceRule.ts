import { RecurrenceStatusType } from "@prisma/client";

export class RecurrenceRule {
    id: string;
    idCalendarFk: string;
    dtstart: string;
    until?: string;
    rrule: string;
    tzid: string;
    recurrenceStatusType: RecurrenceStatusType;
    idUserFk?: string;

}