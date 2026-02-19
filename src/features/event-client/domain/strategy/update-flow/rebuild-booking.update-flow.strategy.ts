import type { UpdateFlowStrategy } from "./update-flow.strategy";
import type { UpdateFlowContext, UpdateFlowExecutors } from "./types";

/**
 * Estrategia fallback para reconstruir segmentos de la reserva.
 */
export class RebuildBookingUpdateFlowStrategy implements UpdateFlowStrategy {
    public readonly flow = "rebuild-booking" as const;

    /**
     * Es el flujo por defecto cuando no aplica ninguno específico.
     */
    public canHandle(_context: UpdateFlowContext): boolean {
        return true;
    }

    /**
     * Ejecuta el flujo de reconstrucción de reserva.
     */
    public async execute<T>(executors: UpdateFlowExecutors<T>): Promise<T> {
        return executors.runRebuildBooking();
    }
}
