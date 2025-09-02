// src/services/recurrence-rule/strategy/this.strategy.ts
import { PrismaClient } from "@prisma/client";
import { EventForBackend } from "../../event/dto/EventForBackend";
import { RecurrenceStrategy } from "./type";
import { toPrismaEventUpdate, buildNestedUpdates } from "../../event/util/toPrismaEventUpdate";

export class ThisStrategy implements RecurrenceStrategy {
    /**
     * Sólo esta instancia: desconectamos de la regla
     * y aplicamos scalars, service y participantes.
     *
     * Devuelve el oldRuleId para cumplir con la firma Promise<string>.
     */
    async handleImmediate(
        payload: EventForBackend,
        tx: PrismaClient
    ): Promise<string> {
        const { event, eventParticipant, eventParticipantDelete, recurrenceRuleUpdate } = payload;
        if (!event.id) throw new Error("Para THIS necesitas el id del evento");

        // 1) Actualizamos sólo esta instancia
        await tx.event.update({
            where: { id: event.id },
            data: {
                // campos básicos (título, fechas…)
                ...toPrismaEventUpdate(event),

                // desconectar de la regla de recurrencia
                recurrenceRule: { disconnect: true },

                // aplicar service y participantes
                ...buildNestedUpdates(event, eventParticipant, eventParticipantDelete),
            },
        });

        // 2) Devolvemos el id de la regla original (recurrenceRuleUpdate.id)
        //    para que el flujo de updateV2 siga compilando correctamente.
        //    No va a reconectar nada porque luego en updateV2, en el branch "THIS",
        //    deberías omitir la parte de `recurrenceRule: connect: { id: ... }`.
        return recurrenceRuleUpdate?.id ?? "";
    }

    /**
     * Con THIS no hacemos nada en background.
     */
    async handleBackground(
        payload: EventForBackend,
        prisma: PrismaClient
    ): Promise<void> {
        // no-op
        return;
    }
}
