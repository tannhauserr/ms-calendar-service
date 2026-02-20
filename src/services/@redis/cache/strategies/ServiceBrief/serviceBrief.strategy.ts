// // src/services/@cache/strategies/ServiceBrief/serviceBrief.strategy.ts

// import { IRedisServiceBriefStrategy } from "../../interfaces/interfaces";
// import { ServiceBrief } from "../../interfaces/models/service-brief";
// import { RedisCacheService } from "../../redis.service";

// /** ────────────────────────────────────────────────────────────────────────────
//  *  Redis key prefixes (exportados para reuso en otros módulos/tests)
//  *  ──────────────────────────────────────────────────────────────────────────── */
// export const REDIS_SERVICE_PREFIX_BRIEF = "service:brief";           // service:brief:{id}
// export const REDIS_SERVICE_PREFIX_WS2IDS = "service:ws2ids";         // service:ws2ids:{idWorkspace}
// export const REDIS_SERVICE_PREFIX_COMPANY2IDS = "service:company2ids"; // service:company2ids:{idCompany}
// export const REDIS_SERVICE_PREFIX_CAT2IDS = "service:cat2ids";       // service:cat2ids:{idCategory}
// export const REDIS_SERVICE_PREFIX_USER2IDS = "service:user2ids";     // service:user2ids:{idUser}

// /** TTL por defecto (6h) – configurable por env */
// export const DEFAULT_SERVICE_BRIEF_TTL_SEC = 21600; // 6 horas
// /** TTL máximo permitido (1 semana) */
// export const MAX_SERVICE_BRIEF_TTL_SEC = 604800; // 7 días * 24 horas * 60 minutos * 60 segundos

// export class ServiceBriefStrategy implements IRedisServiceBriefStrategy {
//   private redis = RedisCacheService.instance;

//   /** Si no pasas ttl, aplica el default (6h). Si pasas ttl, limita a máximo 1 semana */
//   private resolveTtl(ttl?: number): number {
//     if (typeof ttl !== "number") {
//       return DEFAULT_SERVICE_BRIEF_TTL_SEC;
//     }
//     // Limitar a máximo 1 semana
//     return Math.min(ttl, MAX_SERVICE_BRIEF_TTL_SEC);
//   }

//   private async _readIdList(key: string): Promise<string[]> {
//     const raw = await this.redis.get(key);
//     if (!raw) return [];
//     try { return JSON.parse(raw) as string[]; } catch { return []; }
//   }

//   private async _writeIdList(key: string, ids: string[], ttl?: number) {
//     await this.redis.set(key, JSON.stringify(ids), this.resolveTtl(ttl));
//   }

//   async setService(service: ServiceBrief, ttl?: number): Promise<void> {
//     const ttlSec = this.resolveTtl(ttl);

//     const keyService = `${REDIS_SERVICE_PREFIX_BRIEF}:${service.id}`;
//     const keyWsIdx = `${REDIS_SERVICE_PREFIX_WS2IDS}:${service.idWorkspaceFk}`;
//     const keyCompanyIdx = `${REDIS_SERVICE_PREFIX_COMPANY2IDS}:${service.idCompanyFk}`;

//     // snapshot del servicio
//     await this.redis.set(keyService, JSON.stringify(service), ttlSec);

//     // índice workspace → [ids]
//     const wsList = await this._readIdList(keyWsIdx);
//     if (!wsList.includes(service.id)) {
//       wsList.push(service.id);
//       await this._writeIdList(keyWsIdx, wsList, ttlSec);
//     } else {
//       // refresca TTL del índice también
//       await this._writeIdList(keyWsIdx, wsList, ttlSec);
//     }

//     // índice company → [ids]
//     const companyList = await this._readIdList(keyCompanyIdx);
//     if (!companyList.includes(service.id)) {
//       companyList.push(service.id);
//       await this._writeIdList(keyCompanyIdx, companyList, ttlSec);
//     } else {
//       // refresca TTL del índice también
//       await this._writeIdList(keyCompanyIdx, companyList, ttlSec);
//     }

//     // índices por categoría
//     for (const catService of service.categoryServices) {
//       const keyCatIdx = `${REDIS_SERVICE_PREFIX_CAT2IDS}:${catService.category.id}`;
//       const catList = await this._readIdList(keyCatIdx);
//       if (!catList.includes(service.id)) {
//         catList.push(service.id);
//         await this._writeIdList(keyCatIdx, catList, ttlSec);
//       }
//     }

//     // índices por usuario
//     for (const userService of service.userServices) {
//       const keyUserIdx = `${REDIS_SERVICE_PREFIX_USER2IDS}:${userService.idUserFk}`;
//       const userList = await this._readIdList(keyUserIdx);
//       if (!userList.includes(service.id)) {
//         userList.push(service.id);
//         await this._writeIdList(keyUserIdx, userList, ttlSec);
//       }
//     }
//   }

//   async getServiceById(idService: string): Promise<ServiceBrief | null> {
//     const key = `${REDIS_SERVICE_PREFIX_BRIEF}:${idService}`;
//     const raw = await this.redis.get(key);
//     return raw ? (JSON.parse(raw) as ServiceBrief) : null;
//   }

//   async getServicesByWorkspace(idWorkspace: string): Promise<ServiceBrief[]> {
//     const keyWsIdx = `${REDIS_SERVICE_PREFIX_WS2IDS}:${idWorkspace}`;
//     const ids = await this._readIdList(keyWsIdx);
//     if (!ids.length) return [];
//     const services = await Promise.all(ids.map((id) => this.getServiceById(id)));
//     return services.filter(Boolean) as ServiceBrief[];
//   }

//   async getServicesByCompany(idCompany: string): Promise<ServiceBrief[]> {
//     const keyCompanyIdx = `${REDIS_SERVICE_PREFIX_COMPANY2IDS}:${idCompany}`;
//     const ids = await this._readIdList(keyCompanyIdx);
//     if (!ids.length) return [];
//     const services = await Promise.all(ids.map((id) => this.getServiceById(id)));
//     return services.filter(Boolean) as ServiceBrief[];
//   }

//   async getServicesByCategory(idCategory: string): Promise<ServiceBrief[]> {
//     const keyCatIdx = `${REDIS_SERVICE_PREFIX_CAT2IDS}:${idCategory}`;
//     const ids = await this._readIdList(keyCatIdx);
//     if (!ids.length) return [];
//     const services = await Promise.all(ids.map((id) => this.getServiceById(id)));
//     return services.filter(Boolean) as ServiceBrief[];
//   }


//   async getServicesByUsers(userIds: string[]): Promise<ServiceBrief[]> {
//     if (!userIds.length) return [];

//     // Obtener todos los IDs de servicios para todos los usuarios
//     const allServiceIds = new Set<string>();

//     for (const userId of userIds) {
//       const keyUserIdx = `${REDIS_SERVICE_PREFIX_USER2IDS}:${userId}`;
//       const serviceIds = await this._readIdList(keyUserIdx);
//       serviceIds.forEach(id => allServiceIds.add(id));
//     }

//     if (!allServiceIds.size) return [];

//     // Obtener todos los servicios únicos
//     const serviceIdsArray = Array.from(allServiceIds);
//     const services = await Promise.all(serviceIdsArray.map((id) => this.getServiceById(id)));
//     return services.filter(Boolean) as ServiceBrief[];
//   }

//   async deleteService(idService: string, idWorkspace: string, idCompany: string, categoryIds: string[] = [], userIds: string[] = []): Promise<void> {
//     const keyService = `${REDIS_SERVICE_PREFIX_BRIEF}:${idService}`;
//     const keyWsIdx = `${REDIS_SERVICE_PREFIX_WS2IDS}:${idWorkspace}`;
//     const keyCompanyIdx = `${REDIS_SERVICE_PREFIX_COMPANY2IDS}:${idCompany}`;

//     // borra snapshot
//     await this.redis.delete(keyService);

//     // quita del índice de workspace
//     const wsIds = await this._readIdList(keyWsIdx);
//     const nextWsIds = wsIds.filter((x) => x !== idService);
//     await this._writeIdList(keyWsIdx, nextWsIds);

//     // quita del índice de company
//     const companyIds = await this._readIdList(keyCompanyIdx);
//     const nextCompanyIds = companyIds.filter((x) => x !== idService);
//     await this._writeIdList(keyCompanyIdx, nextCompanyIds);

//     // quita de índices de categorías
//     for (const catId of categoryIds) {
//       const keyCatIdx = `${REDIS_SERVICE_PREFIX_CAT2IDS}:${catId}`;
//       const catIds = await this._readIdList(keyCatIdx);
//       const nextCatIds = catIds.filter((x) => x !== idService);
//       await this._writeIdList(keyCatIdx, nextCatIds);
//     }

//     // quita de índices de usuarios
//     for (const userId of userIds) {
//       const keyUserIdx = `${REDIS_SERVICE_PREFIX_USER2IDS}:${userId}`;
//       const userIdsFromCache = await this._readIdList(keyUserIdx);
//       const nextUserIds = userIdsFromCache.filter((x) => x !== idService);
//       await this._writeIdList(keyUserIdx, nextUserIds);
//     }
//   }

//   async invalidateWorkspaceServices(idWorkspace: string): Promise<void> {
//     const keyWsIdx = `${REDIS_SERVICE_PREFIX_WS2IDS}:${idWorkspace}`;
//     const ids = await this._readIdList(keyWsIdx);

//     // borra todos los servicios individuales
//     for (const id of ids) {
//       const keyService = `${REDIS_SERVICE_PREFIX_BRIEF}:${id}`;
//       await this.redis.delete(keyService);
//     }

//     // borra el índice
//     await this.redis.delete(keyWsIdx);
//   }

//   async invalidateCompanyServices(idCompany: string): Promise<void> {
//     const keyCompanyIdx = `${REDIS_SERVICE_PREFIX_COMPANY2IDS}:${idCompany}`;
//     const ids = await this._readIdList(keyCompanyIdx);

//     // borra todos los servicios individuales
//     for (const id of ids) {
//       const keyService = `${REDIS_SERVICE_PREFIX_BRIEF}:${id}`;
//       await this.redis.delete(keyService);
//     }

//     // borra el índice
//     await this.redis.delete(keyCompanyIdx);
//   }
// }

// src/services/@cache/strategies/ServiceBrief/serviceBrief.strategy.ts

import { IRedisServiceBriefStrategy } from "./interfaces";
import { ServiceBrief } from "../../interfaces/models/service-brief";
import { RedisCacheService } from "../../redis.service";

/** ────────────────────────────────────────────────────────────────────────────
 *  Redis key prefixes (exportados para reuso)
 *  ──────────────────────────────────────────────────────────────────────────── */
// Snapshots e índices (cluster-ready: usan hash tags {…}):
export const REDIS_SERVICE_PREFIX_BRIEF = "service:brief";        // service:brief:{ws:<wsId>}:{serviceId}
export const REDIS_SERVICE_PREFIX_WS2IDS = "service:ws2ids";       // service:ws2ids:{ws:<wsId>}
export const REDIS_SERVICE_PREFIX_COMPANY2IDS = "service:company2ids";  // service:company2ids:{co:<companyId>}
export const REDIS_SERVICE_PREFIX_CAT2IDS = "service:cat2ids";      // service:cat2ids:{cat:<categoryId>}
export const REDIS_SERVICE_PREFIX_USER2IDS = "service:user2ids";     // service:user2ids:{user:<userId>}
// Mapas auxiliares (no necesitan tag compartido, se consultan por id):
export const REDIS_SERVICE_PREFIX_ID2WS = "service:id2ws";        // service:id2ws:{serviceId} -> <wsId>
export const REDIS_SERVICE_PREFIX_ID2CO = "service:id2co";        // service:id2co:{serviceId} -> <companyId>

/** TTL por defecto (6h) y máximo (7d) */
export const DEFAULT_SERVICE_BRIEF_TTL_SEC = Number(process.env.REDIS_TTL_SERVICE_BRIEF_SEC ?? 21600); // 6h
export const MAX_SERVICE_BRIEF_TTL_SEC = 604800; // 7d

/** Helpers de hash tags para colocalizar en Cluster */
const tagWs = (wsId: string) => `{ws:${wsId}}`;
const tagCo = (companyId: string) => `{co:${companyId}}`;
const tagCat = (categoryId: string) => `{cat:${categoryId}}`;
const tagUsr = (userId: string) => `{user:${userId}}`;

/** Helpers de claves */
const keyServiceBrief = (wsId: string, serviceId: string) => `${REDIS_SERVICE_PREFIX_BRIEF}:${tagWs(wsId)}:${serviceId}`;
const keyWs2Ids = (wsId: string) => `${REDIS_SERVICE_PREFIX_WS2IDS}:${tagWs(wsId)}`;
const keyCompany2Ids = (companyId: string) => `${REDIS_SERVICE_PREFIX_COMPANY2IDS}:${tagCo(companyId)}`;
const keyCat2Ids = (categoryId: string) => `${REDIS_SERVICE_PREFIX_CAT2IDS}:${tagCat(categoryId)}`;
const keyUser2Ids = (userId: string) => `${REDIS_SERVICE_PREFIX_USER2IDS}:${tagUsr(userId)}`;
const keyId2Ws = (serviceId: string) => `${REDIS_SERVICE_PREFIX_ID2WS}:${serviceId}`;
const keyId2Co = (serviceId: string) => `${REDIS_SERVICE_PREFIX_ID2CO}:${serviceId}`;

export class ServiceBriefStrategy implements IRedisServiceBriefStrategy {
  private redis = RedisCacheService.instance;

  /** Si no pasas ttl, aplica el default (6h). Si pasas ttl, limita a máximo 1 semana */
  private resolveTtl(ttl?: number): number {
    if (typeof ttl !== "number") return DEFAULT_SERVICE_BRIEF_TTL_SEC;
    return Math.min(ttl, MAX_SERVICE_BRIEF_TTL_SEC);
  }

  private async _readIdList(key: string): Promise<string[]> {
    const raw = await this.redis.get(key);
    if (!raw) return [];
    try { return JSON.parse(raw) as string[]; } catch { return []; }
  }

  private async _writeIdList(key: string, ids: string[], ttl?: number) {
    await this.redis.set(key, JSON.stringify(ids), this.resolveTtl(ttl));
  }

  async setService(service: ServiceBrief, ttl?: number): Promise<void> {
    const ttlSec = this.resolveTtl(ttl);

    const kBrief = keyServiceBrief(service.idWorkspaceFk, service.id);
    const kWsIdx = keyWs2Ids(service.idWorkspaceFk);
    const kCompany = keyCompany2Ids(service.idCompanyFk);
    const kId2Ws = keyId2Ws(service.id);
    const kId2Co = keyId2Co(service.id);

    // Índice principal por workspace (co-localizado con snapshot)
    const wsList = await this._readIdList(kWsIdx);
    if (!wsList.includes(service.id)) wsList.push(service.id);

    // Snapshot + índices principales en pipeline (mismo slot {ws:<id>})
    await this.redis.pipeline()
      .set(kBrief, JSON.stringify(service), ttlSec)
      .set(kWsIdx, JSON.stringify(wsList), ttlSec)
      .set(kId2Ws, service.idWorkspaceFk, ttlSec)
      .set(kId2Co, service.idCompanyFk, ttlSec)
      .exec();

    // Índice por company (slot {co:<companyId>})
    const companyList = await this._readIdList(kCompany);
    if (!companyList.includes(service.id)) companyList.push(service.id);
    await this._writeIdList(kCompany, companyList, ttlSec);

    // Índices por categoría (cada uno con su tag {cat:<id>})
    for (const catService of service.categoryServices) {
      const kCat = keyCat2Ids(catService.category.id);
      const catList = await this._readIdList(kCat);
      if (!catList.includes(service.id)) {
        catList.push(service.id);
        await this._writeIdList(kCat, catList, ttlSec);
      } else {
        await this._writeIdList(kCat, catList, ttlSec);
      }
    }

    // Índices por usuario (cada uno con su tag {user:<id>})
    for (const userService of service.userServices) {
      const kUser = keyUser2Ids(userService.idUserFk);
      const userList = await this._readIdList(kUser);
      if (!userList.includes(service.id)) {
        userList.push(service.id);
        await this._writeIdList(kUser, userList, ttlSec);
      } else {
        await this._writeIdList(kUser, userList, ttlSec);
      }
    }
  }

  async getServiceById(idService: string): Promise<ServiceBrief | null> {
    // Resuelve el workspace del servicio (para construir la clave con tag {ws:<id>})
    const wsId = await this.redis.get(keyId2Ws(idService));
    if (!wsId) return null;
    const raw = await this.redis.get(keyServiceBrief(wsId, idService));
    return raw ? (JSON.parse(raw) as ServiceBrief) : null;
  }

  async getServicesByWorkspace(idWorkspace: string): Promise<ServiceBrief[]> {
    const ids = await this._readIdList(keyWs2Ids(idWorkspace));
    if (!ids.length) return [];
    // Todas estas lecturas caen en el mismo slot {ws:<id>}
    const services = await Promise.all(ids.map((id) => this.getServiceById(id)));
    return services.filter(Boolean) as ServiceBrief[];
  }

  async getServicesByCompany(idCompany: string): Promise<ServiceBrief[]> {
    const ids = await this._readIdList(keyCompany2Ids(idCompany));
    if (!ids.length) return [];
    const services = await Promise.all(ids.map((id) => this.getServiceById(id)));
    return services.filter(Boolean) as ServiceBrief[];
  }

  async getServicesByCategory(idCategory: string): Promise<ServiceBrief[]> {
    const ids = await this._readIdList(keyCat2Ids(idCategory));
    if (!ids.length) return [];
    const services = await Promise.all(ids.map((id) => this.getServiceById(id)));
    return services.filter(Boolean) as ServiceBrief[];
  }

  async getServicesByUsers(userIds: string[]): Promise<ServiceBrief[]> {
    if (!userIds.length) return [];
    const allServiceIds = new Set<string>();
    for (const userId of userIds) {
      const ids = await this._readIdList(keyUser2Ids(userId));
      ids.forEach((id) => allServiceIds.add(id));
    }
    if (!allServiceIds.size) return [];
    const services = await Promise.all(Array.from(allServiceIds).map((id) => this.getServiceById(id)));
    return services.filter(Boolean) as ServiceBrief[];
  }

  async deleteService(
    idService: string,
    idWorkspace: string,
    idCompany: string,
    categoryIds: string[] = [],
    userIds: string[] = []
  ): Promise<void> {
    const kBrief = keyServiceBrief(idWorkspace, idService);
    const kWsIdx = keyWs2Ids(idWorkspace);
    const kCompany = keyCompany2Ids(idCompany);
    const kIdWs = keyId2Ws(idService);
    const kIdCo = keyId2Co(idService);

    // 1) Borrar snapshot + mapping + actualizar índice de workspace (mismo slot {ws:<id>})
    const wsIds = await this._readIdList(kWsIdx);
    const nextWsIds = wsIds.filter((x) => x !== idService);

    await this.redis.pipeline()
      .del(kBrief)
      .del(kIdWs)
      .set(kWsIdx, JSON.stringify(nextWsIds)) // mantener índice consistente
      .exec();

    // 2) Actualizar índice de company (slot {co:<id>})
    const companyIds = await this._readIdList(kCompany);
    const nextCompanyIds = companyIds.filter((x) => x !== idService);
    await this._writeIdList(kCompany, nextCompanyIds);

    // 3) Quitar de índices de categorías (cada uno en su slot {cat:<id>})
    for (const catId of categoryIds) {
      const kCat = keyCat2Ids(catId);
      const catIds = await this._readIdList(kCat);
      const nextCatIds = catIds.filter((x) => x !== idService);
      await this._writeIdList(kCat, nextCatIds);
    }

    // 4) Quitar de índices de usuarios (cada uno en su slot {user:<id>})
    for (const userId of userIds) {
      const kUser = keyUser2Ids(userId);
      const uIds = await this._readIdList(kUser);
      const nextUIds = uIds.filter((x) => x !== idService);
      await this._writeIdList(kUser, nextUIds);
    }

    // 5) Borrar mapping id→company
    await this.redis.delete(kIdCo);
  }

  async invalidateWorkspaceServices(idWorkspace: string): Promise<void> {
    const kWsIdx = keyWs2Ids(idWorkspace);
    const ids = await this._readIdList(kWsIdx);

    // borra todos los servicios individuales del WS (mismo slot {ws:<id>})
    for (const id of ids) {
      await this.redis.delete(keyServiceBrief(idWorkspace, id));
      await this.redis.delete(keyId2Ws(id)); // mapping
      await this.redis.delete(keyId2Co(id)); // mapping company (opcionalmente)
    }
    // borra el índice del WS
    await this.redis.delete(kWsIdx);
  }

  async invalidateCompanyServices(idCompany: string): Promise<void> {
    const kCompanyIdx = keyCompany2Ids(idCompany);
    const ids = await this._readIdList(kCompanyIdx);

    // borra snapshots (requiere resolver wsId por mapping)
    for (const id of ids) {
      const wsId = await this.redis.get(keyId2Ws(id));
      if (wsId) {
        await this.redis.delete(keyServiceBrief(wsId, id));
      }
      await this.redis.delete(keyId2Co(id));
    }
    // borra el índice de company
    await this.redis.delete(kCompanyIdx);
  }
}
