import type { AssignmentMode, AssignmentResult, AssignmentStrategyInput } from "./types";

/**
 * Contrato base para resolver asignaciones según el modo de reserva.
 */
export interface AssignmentModeStrategy {
    readonly mode: AssignmentMode;
    execute(input: AssignmentStrategyInput): Promise<AssignmentResult>;
}
