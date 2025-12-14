export interface IRedisBusinessHoursStrategy {
    getBusinessHours(workspaceId: string): Promise<{ [weekday: string]: any[][] } | null>;
    saveBusinessHours(workspaceId: string, businessHours: { [weekday: string]: any[][] }, ttl?: number): Promise<void>;
    deleteBusinessHours(workspaceId: string): Promise<void>;
}