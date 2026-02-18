import type { AssignmentModeStrategy } from "./assignment.strategy";
import type { AssignmentResult, AssignmentStrategyInput } from "./types";

/**
 * Estrategia para una sola petición de servicio grupal.
 */
export class SingleGroupAssignmentStrategy implements AssignmentModeStrategy {
    public readonly mode = "single-group" as const;

    /**
     * Intenta asignar un profesional para un único servicio grupal al inicio elegido.
     */
    public async execute(input: AssignmentStrategyInput): Promise<AssignmentResult> {
        if (input.attendees.length !== 1) {
            return { ok: false, reason: "INVALID_INPUT" };
        }

        const attendee = input.attendees[0];
        const snapshot = input.serviceById[attendee.serviceId];
        const durationMin = attendee.durationMin ?? (snapshot?.duration ?? 0);
        const endWS = input.startWS.clone().add(durationMin, "minutes");

        const eligibleAvailable = (input.userIdsByService.get(attendee.serviceId) ?? []).filter((userId) =>
            (input.freeWindowsByUser[userId] ?? []).some(
                (window) =>
                    input.startWS.isSameOrAfter(window.start) &&
                    endWS.isSameOrBefore(window.end)
            )
        );

        const selectedStaff = await input.chooseStaffWithRR(
            input.idWorkspace,
            undefined,
            attendee.serviceId,
            input.startWS.toDate(),
            endWS.toDate(),
            eligibleAvailable,
            input.weightsMap
        );

        if (!selectedStaff) {
            return { ok: false, reason: "NO_STAFF" };
        }

        return {
            ok: true,
            assignment: [
                {
                    serviceId: attendee.serviceId,
                    userId: selectedStaff,
                    start: input.startWS.clone().seconds(0).milliseconds(0),
                    end: endWS.clone().seconds(0).milliseconds(0),
                },
            ],
        };
    }
}
