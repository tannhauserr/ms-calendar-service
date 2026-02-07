// src/services/@cache/strategies/CompanyBriefStrategy.ts


import { CompanyBrief } from "../../interfaces/models/company-brief";
import { RedisCacheService } from "../../redis.service";
import { IRedisCompanyBriefStrategy } from "./interfaces";

/** ────────────────────────────────────────────────────────────────────────────
 *  Prefijos exportados (cluster-ready con hash tags)
 *  ──────────────────────────────────────────────────────────────────────────── */
export const REDIS_USER_PREFIX_BRIEF = "company:brief";     // company:brief:{company:<id>}
export const REDIS_USER_PREFIX_EMAIL2ID = "company:email2id";  // company:email2id:{email:<lowercase>}

/** TTLs */
export const DEFAULT_USER_BRIEF_TTL_SEC = Number(process.env.REDIS_TTL_USER_BRIEF_SEC ?? 21600); // 6h
export const MAX_USER_BRIEF_TTL_SEC = 604800; // 7d

/** Helpers */
const sanitize = (s: string) => s.replace(/[{}]/g, ""); // evitar llaves en IDs/emails
const tagCompany = (id: string) => `{company:${sanitize(id)}}`;

const keyCompany = (id: string) => `${REDIS_USER_PREFIX_BRIEF}:${tagCompany(id)}`;


export class CompanyBriefStrategy implements IRedisCompanyBriefStrategy {
    private redis = RedisCacheService.instance;

    private resolveTtl(ttl?: number): number {
        if (typeof ttl !== "number") return DEFAULT_USER_BRIEF_TTL_SEC;
        return Math.min(ttl, MAX_USER_BRIEF_TTL_SEC);
    }

    async setCompany(company: CompanyBrief, ttl?: number): Promise<void> {
        const ttlSec = this.resolveTtl(ttl);
        const kCompany = keyCompany(company.id);
    
        const json = JSON.stringify(company);

        // Guardamos snapshot y mapping email→id en pipeline
        await this.redis.pipeline()
            .set(kCompany, json, ttlSec)
            .exec();
    }

    async getCompanyById(companyId: string): Promise<CompanyBrief | null> {
        const raw = await this.redis.get(keyCompany(companyId));
        return raw ? (JSON.parse(raw) as CompanyBrief) : null;
    }


    async deleteCompany(companyId: string): Promise<void> {
        const kCompany = keyCompany(companyId);

        await this.redis.pipeline()
            .del(kCompany)
            .exec();
    }
}
