import { ServiceBrief } from "../../interfaces/models/service-brief";

export interface IRedisServiceBriefStrategy {
    setService(service: ServiceBrief, ttl?: number): Promise<void>;
    getServiceById(idService: string): Promise<ServiceBrief | null>;
    getServicesByWorkspace(idWorkspace: string): Promise<ServiceBrief[]>;
    getServicesByCompany(idCompany: string): Promise<ServiceBrief[]>;
    getServicesByCategory(idCategory: string): Promise<ServiceBrief[]>;
    getServicesByUsers(userIds: string[]): Promise<ServiceBrief[]>;
    deleteService(
        idService: string,
        idWorkspace: string,
        idCompany: string,
        categoryIds?: string[],
        userIds?: string[]
    ): Promise<void>;
    invalidateWorkspaceServices(idWorkspace: string): Promise<void>;
    invalidateCompanyServices(idCompany: string): Promise<void>;
}
