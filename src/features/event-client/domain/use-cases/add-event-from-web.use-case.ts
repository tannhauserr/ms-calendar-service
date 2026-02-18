import { CapacityPolicy } from "../policies/capacity.policy";
import { LeadTimePolicy } from "../policies/lead-time.policy";
import { WorkspaceHoursPolicy } from "../policies/workspace-hours.policy";

type AddEventFromWebInput = {
    startDate: Date;
    endDate: Date;
    now: Date;
    minLeadMinutes: number;
    capacity?: number;
    currentParticipants?: number;
    windows?: Array<{ start: Date; end: Date }>;
};

type AddEventFromWebResult = {
    ok: boolean;
    code: "BOOKING_IN_PAST" | "OUTSIDE_WORKSPACE_HOURS" | "NO_CAPACITY" | "VALID";
};

/**
 * Caso de uso mínimo para validar reglas previas a crear una reserva web.
 */
export class AddEventFromWebUseCase {
    /**
     * Ejecuta validaciones de dominio sin infraestructura.
     */
    public execute(input: AddEventFromWebInput): AddEventFromWebResult {
        if (!LeadTimePolicy.canBook(input.startDate, input.now, input.minLeadMinutes)) {
            return { ok: false, code: "BOOKING_IN_PAST" };
        }

        if (
            Array.isArray(input.windows) &&
            input.windows.length > 0 &&
            !WorkspaceHoursPolicy.isInsideWindows(input.startDate, input.endDate, input.windows)
        ) {
            return { ok: false, code: "OUTSIDE_WORKSPACE_HOURS" };
        }

        if (
            typeof input.capacity === "number" &&
            typeof input.currentParticipants === "number" &&
            !CapacityPolicy.hasSeat(input.capacity, input.currentParticipants)
        ) {
            return { ok: false, code: "NO_CAPACITY" };
        }

        return { ok: true, code: "VALID" };
    }
}
