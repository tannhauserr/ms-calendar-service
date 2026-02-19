import type { UpdateFlow, UpdateFlowContext, UpdateFlowExecutors } from "./types";

/**
 * Contrato base para resolver y ejecutar el flujo de actualización.
 */
export interface UpdateFlowStrategy {
    readonly flow: UpdateFlow;
    canHandle(context: UpdateFlowContext): boolean;
    execute<T>(executors: UpdateFlowExecutors<T>): Promise<T>;
}
