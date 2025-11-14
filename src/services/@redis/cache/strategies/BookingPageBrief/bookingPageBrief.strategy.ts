
// import { IRedisBookingPageBriefStrategy } from "../../interfaces/interfaces";
// import { BookingPageBrief } from "../../interfaces/models/booking-brief";
// import { RedisCacheService } from "../../redis.service";

// /** ────────────────────────────────────────────────────────────────────────────
//  *  Redis key prefixes (exportados para reuso en otros módulos/tests)
//  *  ──────────────────────────────────────────────────────────────────────────── */
// export const REDIS_BP_PREFIX_PAGE = "bookingPage:brief";      // bookingPage:brief:{id}
// export const REDIS_BP_PREFIX_WS2IDS = "bookingPage:ws2ids";     // bookingPage:ws2ids:{idWorkspaceFk}
// export const REDIS_BP_PREFIX_SLUG = "bookingPage:slug";       // bookingPage:slug:{idWorkspaceFk}:{slug}

// /** TTL por defecto (6h) – configurable por env */
// export const DEFAULT_BP_BRIEF_TTL_SEC = 21600; // 6 horas
// /** TTL máximo permitido (1 semana) */
// export const MAX_BP_BRIEF_TTL_SEC = 604800; // 7 días * 24 horas * 60 minutos * 60 segundos

// export class BookingPageBriefStrategy implements IRedisBookingPageBriefStrategy {
//   private redis = RedisCacheService.instance;

//   /** Si no pasas ttl, aplica el default (6h). Si pasas ttl, limita a máximo 1 semana */
//   private resolveTtl(ttl?: number): number {
//     if (typeof ttl !== "number") {
//       return DEFAULT_BP_BRIEF_TTL_SEC;
//     }
//     // Limitar a máximo 1 semana
//     return Math.min(ttl, MAX_BP_BRIEF_TTL_SEC);
//   }

//   private async _readIdList(key: string): Promise<string[]> {
//     const raw = await this.redis.get(key);
//     if (!raw) return [];
//     try { return JSON.parse(raw) as string[]; } catch { return []; }
//   }

//   private async _writeIdList(key: string, ids: string[], ttl?: number) {
//     await this.redis.set(key, JSON.stringify(ids), this.resolveTtl(ttl));
//   }

//   async setBookingPage(page: BookingPageBrief, ttl?: number): Promise<void> {
//     const ttlSec = this.resolveTtl(ttl);

//     const keyPage = `${REDIS_BP_PREFIX_PAGE}:${page.id}`;
//     const keyWsIdx = `${REDIS_BP_PREFIX_WS2IDS}:${page.idWorkspaceFk}`;
//     const keySlug = page.slug
//       ? `${REDIS_BP_PREFIX_SLUG}:${page.idWorkspaceFk}:${page.slug.toLowerCase()}`
//       : null;

//     // snapshot
//     await this.redis.set(keyPage, JSON.stringify(page), ttlSec);

//     // índice workspace → [ids] (refresca TTL aunque no cambie la lista)
//     const list = await this._readIdList(keyWsIdx);
//     if (!list.includes(page.id)) list.push(page.id);
//     await this._writeIdList(keyWsIdx, list, ttlSec);

//     // índice slug → id (scoped por workspace) (opcional)
//     if (keySlug) {
//       await this.redis.set(keySlug, page.id, ttlSec);
//     }
//   }

//   async getBookingPageById(idBookingPage: string): Promise<BookingPageBrief | null> {
//     const key = `${REDIS_BP_PREFIX_PAGE}:${idBookingPage}`;
//     const raw = await this.redis.get(key);
//     return raw ? (JSON.parse(raw) as BookingPageBrief) : null;
//   }

//   async getBookingPagesByWorkspace(idWorkspaceFk: string): Promise<BookingPageBrief[]> {
//     const keyWsIdx = `${REDIS_BP_PREFIX_WS2IDS}:${idWorkspaceFk}`;
//     const ids = await this._readIdList(keyWsIdx);
//     if (!ids.length) return [];
//     const pages = await Promise.all(ids.map((id) => this.getBookingPageById(id)));
//     return pages.filter(Boolean) as BookingPageBrief[];
//   }

//   async getBookingPageBySlug(idWorkspaceFk: string, slug: string): Promise<BookingPageBrief | null> {
//     const keySlug = `${REDIS_BP_PREFIX_SLUG}:${idWorkspaceFk}:${slug.toLowerCase()}`;
//     const id = await this.redis.get(keySlug);
//     if (!id) return null;
//     return this.getBookingPageById(id);
//   }

//   async deleteBookingPage(idBookingPage: string, idWorkspaceFk: string, slug?: string): Promise<void> {
//     const keyPage = `${REDIS_BP_PREFIX_PAGE}:${idBookingPage}`;
//     const keyWsIdx = `${REDIS_BP_PREFIX_WS2IDS}:${idWorkspaceFk}`;
//     const keySlug = slug ? `${REDIS_BP_PREFIX_SLUG}:${idWorkspaceFk}:${slug.toLowerCase()}` : null;

//     // borra snapshot
//     await this.redis.delete(keyPage);

//     // quita del índice de workspace
//     const ids = await this._readIdList(keyWsIdx);
//     const next = ids.filter((x) => x !== idBookingPage);
//     await this._writeIdList(keyWsIdx, next);

//     // borra slug index (si procede)
//     if (keySlug) await this.redis.delete(keySlug);
//   }
// }


import { IRedisBookingPageBriefStrategy } from "../../interfaces/interfaces";
import { BookingPageBrief } from "../../interfaces/models/booking-brief";
import { RedisCacheService } from "../../redis.service";

/** ────────────────────────────────────────────────────────────────────────────
 *  Redis key prefixes (exportados)
 *  ──────────────────────────────────────────────────────────────────────────── */
export const REDIS_BP_PREFIX_PAGE = "bookingPage:brief";     // bookingPage:brief:{ws:<wsId>}:{pageId}
export const REDIS_BP_PREFIX_WS2IDS = "bookingPage:ws2ids";    // bookingPage:ws2ids:{ws:<wsId>}
export const REDIS_BP_PREFIX_SLUG = "bookingPage:slug";      // bookingPage:slug:{ws:<wsId>}:{slug}
export const REDIS_BP_PREFIX_ID2WS = "bookingPage:id2ws";     // bookingPage:id2ws:{pageId} -> <wsId>

/** TTLs */
export const DEFAULT_BP_BRIEF_TTL_SEC = 21600;   // 6h
export const MAX_BP_BRIEF_TTL_SEC = 604800;  // 7d

/** Helpers de claves con hash tag {ws:<id>} */
const wsTag = (wsId: string) => `{ws:${wsId}}`;
const keyPage = (wsId: string, pageId: string) => `${REDIS_BP_PREFIX_PAGE}:${wsTag(wsId)}:${pageId}`;
const keyWs2Ids = (wsId: string) => `${REDIS_BP_PREFIX_WS2IDS}:${wsTag(wsId)}`;
const keySlug = (wsId: string, slug: string) => `${REDIS_BP_PREFIX_SLUG}:${wsTag(wsId)}:${slug.toLowerCase()}`;
const keyId2Ws = (pageId: string) => `${REDIS_BP_PREFIX_ID2WS}:${pageId}`;

export class BookingPageBriefStrategy implements IRedisBookingPageBriefStrategy {
  private redis = RedisCacheService.instance;

  /** Si no pasas ttl, aplica default; si pasas, cap a 1 semana */
  private resolveTtl(ttl?: number): number {
    if (typeof ttl !== "number") return DEFAULT_BP_BRIEF_TTL_SEC;
    return Math.min(ttl, MAX_BP_BRIEF_TTL_SEC);
  }

  private async _readIdList(key: string): Promise<string[]> {
    const raw = await this.redis.get(key);
    if (!raw) return [];
    try { return JSON.parse(raw) as string[]; } catch { return []; }
  }

  private async _writeIdList(key: string, ids: string[], ttl?: number) {
    await this.redis.set(key, JSON.stringify(ids), this.resolveTtl(ttl));
  }

  async setBookingPage(page: BookingPageBrief, ttl?: number): Promise<void> {
    const ttlSec = this.resolveTtl(ttl);
    const kPage = keyPage(page.idWorkspaceFk, page.id);
    const kWs = keyWs2Ids(page.idWorkspaceFk);
    const kSlug = page.slug ? keySlug(page.idWorkspaceFk, page.slug) : null;
    const kMap = keyId2Ws(page.id);

    // ⚙️ Pipeline a un único nodo (co-located por {ws:<id>})
    const list = await this._readIdList(kWs);
    if (!list.includes(page.id)) list.push(page.id);

    await this.redis.pipeline()
      .set(kPage, JSON.stringify(page), ttlSec)
      .set(kMap, page.idWorkspaceFk, ttlSec)                 // id -> ws (para resolver {ws} en getById)
      .set(kSlug ?? "_", page.id, ttlSec, !!kSlug)         // safe no-op si no hay slug
      .set(kWs, JSON.stringify(list), ttlSec)              // refresca TTL del índice
      .exec();
  }

  async getBookingPageById(idBookingPage: string): Promise<BookingPageBrief | null> {
    // 1) Resolver el workspace con el índice auxiliar
    const wsId = await this.redis.get(keyId2Ws(idBookingPage));
    if (!wsId) return null; // no hay mapping → no existe o caducado

    // 2) Leer el snapshot co-located por {ws:<id>}
    const raw = await this.redis.get(keyPage(wsId, idBookingPage));
    return raw ? (JSON.parse(raw) as BookingPageBrief) : null;
  }

  async getBookingPagesByWorkspace(idWorkspaceFk: string): Promise<BookingPageBrief[]> {
    const kWs = keyWs2Ids(idWorkspaceFk);
    const ids = await this._readIdList(kWs);
    if (!ids.length) return [];
    // Todas las keys caen en el mismo slot {ws:<idWorkspaceFk>}
    const pages = await Promise.all(ids.map((id) => this.getBookingPageById(id)));
    return pages.filter(Boolean) as BookingPageBrief[];
  }

  async getBookingPageBySlug(idWorkspaceFk: string, slug: string): Promise<BookingPageBrief | null> {
    const id = await this.redis.get(keySlug(idWorkspaceFk, slug));
    if (!id) return null;
    return this.getBookingPageById(id);
  }

  async deleteBookingPage(idBookingPage: string, idWorkspaceFk: string, slug?: string): Promise<void> {
    const kPage = keyPage(idWorkspaceFk, idBookingPage);
    const kWs = keyWs2Ids(idWorkspaceFk);
    const kSlug = slug ? keySlug(idWorkspaceFk, slug) : null;
    const kMap = keyId2Ws(idBookingPage);

    const ids = await this._readIdList(kWs);
    const next = ids.filter((x) => x !== idBookingPage);

    await this.redis.pipeline()
      .del(kPage)
      .del(kMap)
      .del(kSlug ?? "_", !!kSlug)            // no-op seguro si no hay slug
      .set(kWs, JSON.stringify(next))        // mantiene el índice consistente (puedes darle TTL si quieres)
      .exec();
  }
}