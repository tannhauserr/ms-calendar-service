import type moment from "moment";

type Window = {
    start: moment.Moment;
    end: moment.Moment;
};

type HasAnyAvailableWindowInput = {
    eligibleUserIds: string[];
    freeWindowsByUser: Record<string, Window[]>;
    requiredDurationMin: number;
};

/**
 * Regla para comprobar si existe hueco suficiente para un servicio.
 */
export class ServiceWindowAvailabilityPolicy {
    /**
     * Devuelve true cuando al menos un profesional elegible tiene una ventana libre suficiente.
     */
    public static hasAnyAvailableWindow(input: HasAnyAvailableWindowInput): boolean {
        return input.eligibleUserIds.some((userId) =>
            (input.freeWindowsByUser[userId] ?? []).some(
                (window) => window.end.diff(window.start, "minutes") >= input.requiredDurationMin
            )
        );
    }
}
