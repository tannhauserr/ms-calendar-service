import type { UpdateFlowStrategy } from "./update-flow.strategy";
import type { UpdateFlowContext, UpdateFlowExecutors } from "./types";

/**
 * Estrategia para el flujo rápido de un único servicio.
 */
export class FastPathSingleUpdateFlowStrategy implements UpdateFlowStrategy {
    public readonly flow = "fast-path-single" as const;

    /**
     * Se activa cuando es un update simple de un único segmento.
     */
    public canHandle(context: UpdateFlowContext): boolean {
        return context.fastPathSingle;
    }

    /**
     * Ejecuta el flujo rápido para update single.
     */
    public async execute<T>(executors: UpdateFlowExecutors<T>): Promise<T> {
        return executors.runFastPathSingle();
    }
}
