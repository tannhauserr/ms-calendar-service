import type { AttendeeRequest, AssignmentMode, ServiceById } from "./types";

/**
 * Resuelve el modo de asignación a partir de los servicios solicitados.
 */
export const getAssignmentMode = (
    attendees: AttendeeRequest[],
    serviceById: ServiceById
): AssignmentMode => {
    if (attendees.length === 1) {
        const singleService = serviceById[attendees[0].serviceId];
        const maxParticipants = Math.max(1, singleService?.maxParticipants ?? 1);
        return maxParticipants > 1 ? "single-group" : "single-individual";
    }

    return "multi-individual";
};
