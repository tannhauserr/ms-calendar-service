import prisma from "../../lib/prisma";
import { Pagination, normalizePaginationInput } from "../../models/pagination";


type IncludeRelations = {
  [key: string]: boolean | { select: { [key: string]: boolean } };
};

type ModelType =
  | 'calendar'
  | 'service'
  | 'category'
  | 'categoryWorkspace'
  | 'userService'
  | 'event'
  | 'userColor'
  | 'businessHour'
  | 'workerBusinessHour'
  | 'temporaryBusinessHour'
  | 'workerAbsence'
  | 'recurrenceRule'
  | 'waitList'

  ;

	  async function getGeneric(
    pagination: Pagination,
    modelName: ModelType,
    includeRelations?: any,
    options?: { maxItemsPerPage?: number; maxPage?: number }) {
    const {
      orderBy,
      filters,
      filtersJson,
      startDate,
      endDate,
    } = pagination;
    const { page, itemsPerPage } = normalizePaginationInput(pagination, {
      context: "default",
      defaultItemsPerPage: 25,
      maxItemsPerPage: options?.maxItemsPerPage,
      maxPage: options?.maxPage,
    });
  
    const skip = (page - 1) * itemsPerPage;
    const take = +itemsPerPage;
  
  
    // console.log("Get genetic, filtos", filters)
  
  
  
  
  
    // Procesar filtros
    let where: any = {};
    // if (filters) {
    //   where = processFilters(filters);
    // }
    if (filters) {
      where = { ...where, ...processFilters(filters) };
    }
  
    if (filtersJson) {
      where = { ...where, ...processFiltersJson(filtersJson) };
    }
  
    // console.log(JSON.stringify(where, null, 2))
    // console.log("\n\n\n\n\n")
  
    let orderQuery: any = {};
    if (orderBy) {
      if (orderBy.relation) {
        // Ordenación en una tabla relacionada
        orderQuery = {
          [orderBy.relation]: {
            [orderBy.field]: orderBy.order,
          },
        };
      } else {
        // Ordenación en la tabla principal
        orderQuery = {
          [orderBy.field]: orderBy.order,
        };
      }
    }
  
    if (startDate || endDate) {
      where.createdDate = {};
      if (startDate) where.createdDate.gte = startDate;
      if (endDate) where.createdDate.lte = endDate;
    }
  
    // console.log("mira where", JSON.stringify(where, null, 2))
    // console.log("mira include", includeRelations)
  
    where = { ...where, deletedDate: null };
  
  
	    try {
	      const prismaClient = prisma as any;
	      const items = await prismaClient[modelName as string].findMany({
	        where,
	        skip,
	        take,
        orderBy: orderQuery,
        // include: includeRelations,
        select: includeRelations
      });
  
      // console.log(items)
  
	      const totalItems = await prismaClient[modelName as string].count({ where });
      const totalPages = Math.ceil(totalItems / itemsPerPage);
  
      return {
        rows: items,
        pagination: {
          ...pagination,
          page,
          itemsPerPage,
          totalItems,
          totalPages,
        },
      };
    } catch (error: any) {
      throw new Error(`Error in getGeneric for model ${modelName}: ${error.message}`);
    }
  }
  
  function processFilters(filters: Record<string, {
    value: any;
    relation?: string;
    relation2?: string;
    relationType?: string;
    relationType2?: string;
    isEnum?: boolean;
  }>) {
    let where: any = {};
  
    Object.entries(filters).forEach(([field, filter]) => {
      const {
        value,
        relation,
        relation2,
        relationType = 'is',
        relationType2 = 'is',
        isEnum,
      } = filter; // Cambiar a 'is' por defecto
  
      const isEnumField = field.endsWith('Type') || isEnum;
  
      const isMin = field.startsWith('min_');
      const isMax = field.startsWith('max_');
      const actualField = field.replace(/^(min_|max_)/, '');
  
      let condition: any;
      if (Array.isArray(value)) {
        condition = {
          in: value,
        };
      } else {
        condition = isEnumField
          ? { equals: value }
          : typeof value === 'string'
            ? { contains: value }
            : { equals: value };
      }
  
      let newFilter: any;
  
      if (!relation) {
        // No relacionado
        if (isMin || isMax) {
          const conditionType = isMin ? 'gte' : 'lte';
          const numericValue = Number(value);
          if (!where[actualField]) where[actualField] = {};
          where[actualField][conditionType] = numericValue;
        } else {
          newFilter = { [actualField]: condition };
          mergeDeep(where, newFilter);
        }
      } else {
        // Relacionado
        let nestedFilter: any = { [actualField]: condition };
  
        if (relation2) {
          nestedFilter = {
            [relation2]: {
              [relationType2]: nestedFilter,
            },
          };
        }
  
        nestedFilter = {
          [relation]: {
            [relationType]: nestedFilter,
          },
        };
  
        mergeDeep(where, nestedFilter);
      }
    });
  
    return where;
  }
  
  function mergeDeep(target: any, source: any): any {
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (
          typeof source[key] === 'object' &&
          source[key] !== null &&
          !Array.isArray(source[key])
        ) {
          if (!target[key]) {
            target[key] = {};
          }
          mergeDeep(target[key], source[key]);
        } else {
          target[key] = source[key];
        }
      }
    }
    return target;
  }
  
  
  
	  function handleCondition(isEnumField: boolean | undefined, field: string, value: any, where: any) {
  
    if (Array.isArray(value)) {
      const conditions = value.map(val => {
        // return isEnumField ? { [field]: { equals: val } } : { [field]: { contains: val, mode: 'insensitive' } };
        if (isEnumField) return { [field]: { equals: val } }
        else return { [field]: { contains: val, mode: 'insensitive' } };
      });
      if (!where.OR) where.OR = [];
      where.OR.push(...conditions);
    } else {
      if (isEnumField) {
        where[field] = { equals: value };
      } else if (typeof value === 'string') {
        // where[field] = { equals: value };
        where[field] = { contains: value, mode: 'insensitive' };
      } else {
        // Asignación directa para otros tipos de valores
        where[field] = value;
      }
    }
  }
  
  
  // JSON
  // JSON
  // JSON
  
	  function processFiltersJson(filtersJson: any) {
	    let where: any = { AND: [] };
	    let conditionsByPath: { [key: string]: any[] } = {};
	  
	    // Recolectar condiciones por path
	    Object.entries(filtersJson).forEach(([key, filters]: [string, any]) => {
	      (filters as any[]).forEach((filter: any) => {
	        const { path, value } = filter;
	        let conditionValue = Array.isArray(value) ? value : [value]; // Asegurar que siempre sea un array
  
        let pathKey = path.join('.'); // Convertir el array de path a string para usar como clave
  
        // Inicializar el arreglo en la clave si no existe
        if (!conditionsByPath[pathKey]) {
          conditionsByPath[pathKey] = [];
        }
  
        // Añadir la condición al arreglo correspondiente
	        conditionValue.forEach((val: any) => {
	          conditionsByPath[pathKey].push({
	            [key]: {
              path: path,
              equals: val,
            }
          });
        });
      });
    });
  
    // Procesar las condiciones agrupadas por path y combinarlas con OR si es necesario
	    Object.values(conditionsByPath).forEach((conditions: any[]) => {
      if (conditions.length === 1) {
        // Si solo hay una condición para este path, añadirla directamente
        where.AND.push(conditions[0]);
      } else {
        // Si hay múltiples condiciones para el mismo path, usar OR
        where.AND.push({
          OR: conditions
        });
      }
    });
  
    return where;
  }
  
  

  export { getGeneric };
