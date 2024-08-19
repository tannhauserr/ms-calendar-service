
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
