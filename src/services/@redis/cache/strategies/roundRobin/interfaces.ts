export interface IRedisRoundRobinStrategy {
    pickWeightedSmoothRR(params: {
        idWorkspace: string;
        idService?: string;
        eligibles: string[];                 // staff ya filtrados por skill + disponibilidad
        weights?: Record<string, number>;    // 0–100 (default 100 si falta)
        stateTTLSec?: number;                // TTL opcional para el estado RR
    }): Promise<string | null>;

    getState(idWorkspace: string, idService: string):
        Promise<Record<string, { weight: number; current: number }>>;
    resetState(idWorkspace: string, idService: string): Promise<void>;

    resetWorkspace(idWorkspace: string): Promise<void>;


    acquireHold(params: {
        idWorkspace: string;
        idService: string;
        startISO: string;
        endISO: string;
        ttlSec?: number;                     // default 60s
    }): Promise<boolean>;
    releaseHold(params: {
        idWorkspace: string;
        idService: string;
        startISO: string;
        endISO: string;
    }): Promise<void>;
}
