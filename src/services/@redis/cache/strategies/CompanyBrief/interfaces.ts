import { CompanyBrief } from "../../interfaces/models/company-brief";

export interface IRedisCompanyBriefStrategy {
    setCompany(company: CompanyBrief, ttl?: number): Promise<void>;
    getCompanyById(companyId: string): Promise<CompanyBrief | null>;
    deleteCompany(companyId: string): Promise<void>;
}
