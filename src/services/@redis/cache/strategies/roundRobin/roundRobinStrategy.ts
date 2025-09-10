import { IRedisRoundRobinStrategy } from "../../interfaces/interfaces";
import { RedisCacheService } from "../../redis.service";

// Helpers de claves (scoped por workspace + bookingPage + service)
const RRKeys = {
    state: (ws: string, bp: string, svc: string) => `rr:${ws}:${bp}:${svc}`,
    hold: (ws: string, bp: string, svc: string, s: string, e: string) => `hold:${ws}:${bp}:${svc}:${s}:${e}`,
};

export class RoundRobinStrategy implements IRedisRoundRobinStrategy {
    private redis = RedisCacheService.instance;

    /** Lee el estado RR */
    async getState(
        idWorkspace: string,
        idBookingPage: string,
        idService: string = "global"
    ) {
        const raw = await this.redis.get(RRKeys.state(idWorkspace, idBookingPage, idService));
        if (!raw) return {};
        try { return JSON.parse(raw) as Record<string, { weight: number; current: number }>; }
        catch { return {}; }
    }

    /** Resetea el estado RR */
    async resetState(
        idWorkspace: string,
        idBookingPage: string,
        idService: string = "global"
    ): Promise<void> {
        await this.redis.delete(RRKeys.state(idWorkspace, idBookingPage, idService));
    }

    /** Picker Weighted Smooth RR con TTL opcional para el estado */
    async pickWeightedSmoothRR(params: {
        idWorkspace: string;
        idBookingPage: string;
        idService: string;                 // usa "global" si haces RR global
        eligibles: string[];               // ya filtrados por skill + disponibilidad
        weights?: Record<string, number>;  // 0–100; default 100
        stateTTLSec?: number;              // TTL opcional del estado RR
    }): Promise<string | null> {
        const { idWorkspace, idBookingPage, idService = "global", eligibles, stateTTLSec } = params;
        if (!eligibles?.length) return null;

        // Normaliza pesos 0–100 (default 100)
        const wmap = params.weights ?? {};
        const normalized: Record<string, number> = {};
        for (const uid of eligibles) {
            const raw = wmap[uid];
            const w = Number.isFinite(raw) ? Math.max(0, Math.min(100, Number(raw))) : 100;
            normalized[uid] = w;
        }

        const key = RRKeys.state(idWorkspace, idBookingPage, idService);
        const state = await this.getState(idWorkspace, idBookingPage, idService);

        // Inicializa/actualiza pesos
        for (const uid of eligibles) {
            const weight = normalized[uid] ?? 100;
            if (!state[uid]) state[uid] = { weight, current: 0 };
            else state[uid].weight = weight;
        }

        // Pool con peso > 0
        const pool = eligibles.filter(u => (state[u]?.weight ?? 0) > 0);
        if (!pool.length) return null;

        // Weighted Smooth RR (tie-breaker determinista por uid)
        const total = pool.reduce((acc, u) => acc + state[u].weight, 0);
        if (total <= 0) return null;

        let chosen: string | null = null;
        let maxCur = -Infinity;

        for (const u of pool.sort()) { // sort() → desempate estable
            state[u].current += state[u].weight;
            if (state[u].current > maxCur) {
                maxCur = state[u].current;
                chosen = u;
            }
        }
        if (!chosen) return null;

        state[chosen].current -= total;

        await this.saveState(key, state, stateTTLSec); // aplica TTL si viene
        return chosen;
    }

    // Hold simple con TTL (si tu RedisService expone NX, cámbialo allí)
    async acquireHold(params: {
        idWorkspace: string;
        idBookingPage: string;
        idService: string;
        startISO: string;
        endISO: string;
        ttlSec?: number;
    }): Promise<boolean> {
        const { idWorkspace, idBookingPage, idService, startISO, endISO, ttlSec = 60 } = params;
        const key = RRKeys.hold(idWorkspace, idBookingPage, idService, startISO, endISO);

        const existing = await this.redis.get(key);
        if (existing) return false;

        await this.redis.set(key, "1", ttlSec); // set con TTL
        return true;
    }

    async releaseHold(params: {
        idWorkspace: string;
        idBookingPage: string;
        idService: string;
        startISO: string;
        endISO: string;
    }): Promise<void> {
        const { idWorkspace, idBookingPage, idService, startISO, endISO } = params;
        const key = RRKeys.hold(idWorkspace, idBookingPage, idService, startISO, endISO);
        await this.redis.delete(key);
    }

    // Helper para guardar estado con TTL opcional
    private async saveState(
        key: string,
        state: Record<string, { weight: number; current: number }>,
        ttlSec?: number
    ) {
        if (ttlSec && ttlSec > 0) return this.redis.set(key, JSON.stringify(state), ttlSec);
        return this.redis.set(key, JSON.stringify(state));
    }
}
