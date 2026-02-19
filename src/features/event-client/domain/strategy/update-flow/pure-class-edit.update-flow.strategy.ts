import type { UpdateFlowStrategy } from "./update-flow.strategy";
import type { UpdateFlowContext, UpdateFlowExecutors } from "./types";

/**
 * Estrategia para el flujo de edición pura de clase.
 */
export class PureClassEditUpdateFlowStrategy implements UpdateFlowStrategy {
    public readonly flow = "pure-class-edit" as const;

    /**
     * Se activa cuando el update solo mueve a un participante en un evento grupal.
     */
    public canHandle(context: UpdateFlowContext): boolean {
        return context.isPureClassEdit;
    }

    /**
     * Ejecuta el flujo de edición de clase.
     */
    public async execute<T>(executors: UpdateFlowExecutors<T>): Promise<T> {
        return executors.runPureClassEdit();
    }
}
