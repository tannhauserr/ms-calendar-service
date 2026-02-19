import { ErrorCatalogByDomain, withCatalogMessage } from "../../../../../models/error-codes";
import type { UpdateFlowContext } from "./types";
import type { UpdateFlowStrategy } from "./update-flow.strategy";

/**
 * Selecciona la primera estrategia de flujo que aplique al contexto.
 */
export const resolveUpdateFlowStrategy = (
    strategies: UpdateFlowStrategy[],
    context: UpdateFlowContext
): UpdateFlowStrategy => {
    const strategy = strategies.find((candidate) => candidate.canHandle(context));
    if (!strategy) {
        throw new Error(
            withCatalogMessage(
                ErrorCatalogByDomain.booking.common.BOOKING_ERR_UNEXPECTED.message,
                "No update flow strategy matched the current context"
            )
        );
    }
    return strategy;
};
