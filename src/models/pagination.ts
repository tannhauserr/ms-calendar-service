
/**
 * EJEMPLO DE USO
 * 
 * {
 *  "page": "0",
 *  "itemsPerPage": "5",
 *  "filters": {
 *      "email": {
 *          "value":  {"contains": "user2"}
 *      }
 *   }
 * }
 * 
 * 
 * 
 * Interface para definir la paginación de los resultados
 * @param page: Número de página
 * @param itemsPerPage: Número de elementos por página
 * @param totalItems: Número total de elementos
 * @param totalPages: Número total de páginas
 * @param orderBy: Objeto con el campo por el que ordenar y el orden (asc o desc)
 * @param filters: Objeto con los filtros a aplicar
 * @param startDate: Fecha de inicio para filtrar
 * @param endDate: Fecha de fin para filtrar
 */

export interface Pagination {
  page: number;
  itemsPerPage: number;
  totalItems?: number;
  totalPages?: number;
  orderBy?: {
    field: string;
    order?: 'asc' | 'desc';
    relation?: string;
  };
  filters?: {
    [key: string]: {
      value: any | any[];
      relation?: string;
      // Nuevo campo creado el 26/06/2024
      // Permite buscar de la relación de una relación
      // Por ahora solo funciona con strings y enums tanto cuando es un array como cuando es un valor único
      relation2?: string;
      isEnum?: boolean;
      isJson?: true;
      path?: string[];
      relationType?: "some" | "every" | "is";
    };
  };
  filtersJson?: {
    [key: string]: FilterJson[];
  };

  startDate?: Date;
  endDate?: Date;
}


export interface FilterJson {
  path: string[];
  // value: any | any[]; // Permite que `value` sea un único valor o un array de valores.
  value: any;
  relation?: string;
}

export const PAGINATION_MAX_PAGE = 999;
export const PAGINATION_MAX_ITEMS_DEFAULT = 100;
export const PAGINATION_MAX_ITEMS_CALENDAR = 1000;

type PaginationContext = "default" | "calendar";

export const normalizePaginationInput = (
  pagination: Partial<Pagination> | undefined,
  options?: {
    context?: PaginationContext;
    defaultPage?: number;
    defaultItemsPerPage?: number;
    maxPage?: number;
    maxItemsPerPage?: number;
  }
) => {
  const context = options?.context ?? "default";
  const maxPage = options?.maxPage ?? PAGINATION_MAX_PAGE;
  const maxItemsPerPage =
    options?.maxItemsPerPage ??
    (context === "calendar" ? PAGINATION_MAX_ITEMS_CALENDAR : PAGINATION_MAX_ITEMS_DEFAULT);

  const defaultPage = options?.defaultPage ?? 1;
  const defaultItemsPerPage = options?.defaultItemsPerPage ?? 25;

  const rawPage = Number(pagination?.page ?? defaultPage);
  const rawItemsPerPage = Number(pagination?.itemsPerPage ?? defaultItemsPerPage);

  const page = Number.isFinite(rawPage)
    ? Math.min(Math.max(1, Math.trunc(rawPage)), maxPage)
    : defaultPage;

  const itemsPerPage = Number.isFinite(rawItemsPerPage)
    ? Math.min(Math.max(1, Math.trunc(rawItemsPerPage)), maxItemsPerPage)
    : defaultItemsPerPage;

  return {
    page,
    itemsPerPage,
    maxPage,
    maxItemsPerPage,
  };
};
