import { HoursRangeInput, HoursMap } from "../../../../@database/all-business-services/interfaces";

export interface IRedisTemporaryHoursStrategy {
    getTemporaryHours(workspaceId: string, userId: string, range?: HoursRangeInput): Promise<HoursMap | null>;
    saveTemporaryHours(workspaceId: string, userId: string, temporaryHours: HoursMap, ttl?: number): Promise<void>;
    deleteTemporaryHours(workspaceId: string, userId: string): Promise<void>;
}
