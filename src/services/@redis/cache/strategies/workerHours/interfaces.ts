export interface IRedisWorkerHoursStrategy {
    getWorkerHours(workspaceId: string, userId: string): Promise<{ [weekday: string]: string[][] | null } | null>;
    saveWorkerHours(
        workspaceId: string,
        userId: string,
        workerHours: { [weekday: string]: string[][] | null },
        ttl?: number
    ): Promise<void>;
    deleteWorkerHours(workspaceId: string, userId: string): Promise<void>;
}
