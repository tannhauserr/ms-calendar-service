import { RedisCacheService } from "../../redis.service";
import { IRedisRoundRobinStrategy } from "./interfaces";

//
// Helpers de claves (scoped por workspace + service)
//
// - state: guarda el estado del algoritmo de Round Robin ponderado
//          ej: rr:<idWorkspace>:<idService>
// - hold:  guarda "bloqueos" temporales (holds) para un rango horario concreto
//          ej: hold:<idWorkspace>:<idService>:<startISO>:<endISO>
//
const RRKeys = {
    state: (ws: string, svc: string) => `rr:${ws}:${svc}`,
    hold: (ws: string, svc: string, s: string, e: string) => `hold:${ws}:${svc}:${s}:${e}`,
};

/**
 * Implementación de la estrategia de Round Robin ponderada usando Redis.
 *
 * Responsabilidades:
 * - Mantener en Redis el estado del algoritmo de Weighted Smooth Round Robin por workspace + servicio.
 * - Ofrecer un método para "pickear" el siguiente profesional (staff) en base a pesos.
 * - Gestionar pequeños "holds" temporales (bloqueos) por tramo horario para evitar colisiones en paralelo.
 * - Permitir reseteos de estado a nivel de servicio y a nivel global de workspace.
 */
export class RoundRobinStrategy implements IRedisRoundRobinStrategy {
    // Cliente compartido de Redis, gestionado por RedisCacheService (singleton).
    private redis = RedisCacheService.instance;

    /**
     * Lee el estado actual de Round Robin para un workspace + servicio.
     *
     * El estado es un objeto en Redis con esta forma:
     * {
     *   "<idStaff>": { weight: number; current: number },
     *   ...
     * }
     *
     * - weight: peso configurado para ese staff (0–100)
     * - current: acumulador interno del algoritmo Weighted Smooth RR
     */
    async getState(
        idWorkspace: string,
        idService: string = "global"
    ): Promise<Record<string, { weight: number; current: number }>> {
        const raw = await this.redis.get(RRKeys.state(idWorkspace, idService));
        if (!raw) return {};
        try {
            return JSON.parse(raw) as Record<string, { weight: number; current: number }>;
        } catch {
            // Si por lo que sea está corrupto, devolvemos estado vacío
            return {};
        }
    }

    /**
     * Resetea el estado de Round Robin SOLO para un servicio concreto
     * dentro de un workspace.
     *
     * Útil si cambias completamente el set de staff, pesos, etc. de ese servicio
     * y quieres que el algoritmo "empiece de cero".
     */
    async resetState(
        idWorkspace: string,
        idService: string = "global"
    ): Promise<void> {
        await this.redis.delete(RRKeys.state(idWorkspace, idService));
    }

    /**
     * Resetea TODO el estado de Round Robin de un workspace:
     * - Todos los states (rr:<workspace>:*)
     * - Todos los holds (hold:<workspace>:*)
     *
     * Útil cuando haces cambios gordos de configuración a nivel de workspace
     * (staff, servicios, pesos, etc.) y quieres limpiar cualquier rastro
     * del historial de reparto.
     */
    async resetWorkspace(idWorkspace: string): Promise<void> {
        const patternState = `rr:${idWorkspace}:*`;
        const patternHold = `hold:${idWorkspace}:*`;

        await this.redis.deleteByPattern(patternState);
        await this.redis.deleteByPattern(patternHold);
    }

    /**
     * Selector principal de Weighted Smooth Round Robin (WSRR).
     *
     * Flujo:
     * 1. Normaliza los pesos de los staff elegibles (0–100, por defecto 100).
     * 2. Carga el estado actual desde Redis (si existe).
     * 3. Inicializa/actualiza el estado para cada staff elegible.
     * 4. Aplica el algoritmo de Weighted Smooth RR:
     *    - Suma el weight a current para cada staff
     *    - Elige el staff con mayor current
     *    - Resta el total de pesos al current del elegido
     * 5. Guarda el nuevo estado en Redis (opcionalmente con TTL).
     *
     * Devuelve:
     * - id del staff elegido (string) o
     * - null si no hay elegibles o todos tienen peso 0.
     */
    async pickWeightedSmoothRR(params: {
        idWorkspace: string;
        idBookingPage: string;               // (no se usa aún, pero queda preparado por si scoping futuro)
        idService: string;                   // usa "global" si haces RR global
        eligibles: string[];                 // staff ya filtrados por skill + disponibilidad
        weights?: Record<string, number>;    // 0–100; default 100
        stateTTLSec?: number;                // TTL opcional del estado RR
    }): Promise<string | null> {
        const { idWorkspace, idService = "global", eligibles, stateTTLSec } = params;
        if (!eligibles?.length) return null;

        // 1) Normaliza pesos 0–100 (default 100 si falta o no es numérico)
        const wmap = params.weights ?? {};
        const normalized: Record<string, number> = {};
        for (const uid of eligibles) {
            const raw = wmap[uid];
            const w = Number.isFinite(raw) ? Math.max(0, Math.min(100, Number(raw))) : 100;
            normalized[uid] = w;
        }

        const key = RRKeys.state(idWorkspace, idService);
        const state = await this.getState(idWorkspace, idService);

        // 2) Inicializa/actualiza pesos en el estado
        for (const uid of eligibles) {
            const weight = normalized[uid] ?? 100;
            if (!state[uid]) {
                state[uid] = { weight, current: 0 };
            } else {
                state[uid].weight = weight;
            }
        }

        // 3) Construye el pool solo con los que tienen weight > 0
        const pool = eligibles.filter(u => (state[u]?.weight ?? 0) > 0);
        if (!pool.length) return null;

        // 4) Weighted Smooth RR
        const total = pool.reduce((acc, u) => acc + state[u].weight, 0);
        if (total <= 0) return null;

        let chosen: string | null = null;
        let maxCur = -Infinity;

        // sort() → desempate determinista (mismo orden de uids siempre)
        for (const u of pool.sort()) {
            state[u].current += state[u].weight;
            if (state[u].current > maxCur) {
                maxCur = state[u].current;
                chosen = u;
            }
        }

        if (!chosen) return null;

        // El elegido "paga" el total de pesos
        state[chosen].current -= total;

        // 5) Persistimos el nuevo estado en Redis (con TTL opcional)
        await this.saveState(key, state, stateTTLSec);
        return chosen;
    }

    /**
     * Crea un "hold" (bloqueo) simple con TTL para un tramo horario concreto.
     *
     * Idea:
     * - Se usa para evitar que, en paralelo, otro proceso reserve el mismo
     *   tramo para el mismo workspace + servicio mientras se está confirmando.
     *
     * Comportamiento:
     * - Si ya existe un hold para esa combinación (key en Redis), devuelve false.
     * - Si no existe, crea la key con TTL y devuelve true.
     */
    async acquireHold(params: {
        idWorkspace: string;
        idBookingPage: string;               // (igual que arriba, preparado por si scoping futuro)
        idService: string;
        startISO: string;
        endISO: string;
        ttlSec?: number;                     // TTL del hold (por defecto 60s)
    }): Promise<boolean> {
        const { idWorkspace, idService, startISO, endISO, ttlSec = 60 } = params;
        const key = RRKeys.hold(idWorkspace, idService, startISO, endISO);

        const existing = await this.redis.get(key);
        if (existing) return false;          // Ya está bloqueado ese tramo

        // Creamos la key del hold con TTL
        await this.redis.set(key, "1", ttlSec);
        return true;
    }

    /**
     * Libera (borra) un hold concreto para un workspace + servicio + tramo horario.
     *
     * Útil cuando el proceso de reserva se cancela o se completa y ya no
     * tiene sentido mantener el bloqueo temporal.
     */
    async releaseHold(params: {
        idWorkspace: string;
        idBookingPage: string;               // idem, por si se usa en el futuro
        idService: string;
        startISO: string;
        endISO: string;
    }): Promise<void> {
        const { idWorkspace, idService, startISO, endISO } = params;
        const key = RRKeys.hold(idWorkspace, idService, startISO, endISO);
        await this.redis.delete(key);
    }

    /**
     * Helper interno para guardar el estado del Round Robin en Redis
     * con un TTL opcional.
     *
     * - key: clave Redis donde se guarda el estado.
     * - state: objeto serializado como JSON.
     * - ttlSec: si viene definido y es > 0, se aplica expiración a la clave.
     */
    private async saveState(
        key: string,
        state: Record<string, { weight: number; current: number }>,
        ttlSec?: number
    ) {
        if (ttlSec && ttlSec > 0) {
            return this.redis.set(key, JSON.stringify(state), ttlSec);
        }
        return this.redis.set(key, JSON.stringify(state));
    }
}
