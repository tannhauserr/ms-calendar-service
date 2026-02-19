import type { AssignmentModeStrategy } from "./assignment.strategy";
import type { AssignmentResult, AssignmentSegment, AssignmentStrategyInput } from "./types";

/**
 * Estrategia para múltiples servicios individuales en secuencia.
 */
export class MultiIndividualAssignmentStrategy implements AssignmentModeStrategy {
    public readonly mode = "multi-individual" as const;

    /**
     * Valida hueco mínimo por servicio y delega el cálculo secuencial.
     */
    public async execute(input: AssignmentStrategyInput): Promise<AssignmentResult> {
        for (const attendee of input.attendees) {
            const eligibleUsers = input.userIdsByService.get(attendee.serviceId) ?? [];
            const hasAnyAvailableWindow = eligibleUsers.some((userId) =>
                (input.freeWindowsByUser[userId] ?? []).some(
                    (window) =>
                        window.end.diff(window.start, "minutes") >= attendee.durationMin
                )
            );

            if (!hasAnyAvailableWindow) {
                return { ok: false, reason: "NO_WINDOW" };
            }
        }

        const eligibleUsersByService: Record<string, string[]> = {};
        for (const attendee of input.attendees) {
            eligibleUsersByService[attendee.serviceId] = input.userIdsByService.get(attendee.serviceId) ?? [];
        }

        const assignmentBuffer: AssignmentSegment[] = [];
        const hasAvailability = input.assignSequentially({
            idx: 0,
            start: input.startWS.clone().seconds(0).milliseconds(0),
            attendees: input.attendees,
            eligibleUsersByService,
            freeWindowsByUser: input.freeWindowsByUser,
            usedByUserAt: [],
            assignment: assignmentBuffer,
        });

        if (!hasAvailability) {
            return { ok: false, reason: "NO_AVAILABILITY" };
        }

        return { ok: true, assignment: assignmentBuffer };
    }
}
