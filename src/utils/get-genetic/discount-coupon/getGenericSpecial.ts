import { Prisma } from "@prisma/client";
import { Pagination } from "../../../models/pagination";
import prisma from "../../../lib/prisma";



type IncludeRelations = {
    [key: string]: boolean | { select: { [key: string]: boolean } };
};

type ModelType = 'promotion' | 'user' | "role" | "product" | "category" | "tag" | "product-image" | "product-tag" | "coupon" | "discount";

async function getGenericSpecial(
    pagination: Pagination,
    modelName: ModelType,
    includeRelations?: any,
    isValid?: boolean,
) {
    const {
        orderBy,
        filters,
        filtersJson,
        startDate,
        endDate,
    } = pagination;
    const page = Math.max(1, +pagination.page);
    const itemsPerPage = Math.max(1, +pagination.itemsPerPage);

    const skip = (page - 1) * itemsPerPage;
    const take = +itemsPerPage;


    console.log(filters)



    if (page < 1) {
        throw new Error('The page value must be greater than or equal to 1.');
    }

    if (itemsPerPage < 1) {
        throw new Error('The itemsPerPage value must be greater than or equal to 1.');
    }

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

    if (isValid !== undefined) {
        const currentDate = new Date();
        // isValid = Promoción dentro de la fecha currentDate
        if (isValid) {

            console.log("entro por que es valido")
            console.log("entro por que es valido")
            console.log("entro por que es valido")
            console.log("entro por que es valido")
            console.log("entro por que es valido")

            // Solo descuentos válidos
            where.validFromDate = { lte: currentDate };
            where.validUntilDate = { gte: currentDate };
        } else {
            // Solo descuentos inválidos
            where.OR = [
                { validFromDate: { gt: currentDate } },
                { validUntilDate: { lt: currentDate } }
            ];
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
        const items = await prisma[modelName as string].findMany({
            where,
            skip,
            take,
            orderBy: orderQuery,
            // include: includeRelations,
            select: includeRelations
        });

        // console.log(items)

        const totalItems = await prisma[modelName as string].count({ where });
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


function processFilters(filters: Record<string, { value: any; relation?: string, relation2?: string, isEnum?: boolean }>) {
    let where: any = {};
    let orConditions: any[] = [];

    Object.entries(filters).forEach(([field, filter]) => {
        const { value, relation, relation2, isEnum } = filter;
        const isEnumField = field.endsWith('Type') || isEnum;

        const isMin = field.startsWith('min_');
        const isMax = field.startsWith('max_');
        const actualField = field.replace(/^(min_|max_)/, '');

        if (!relation) {
            // No relacionado
            if (isMin || isMax) {
                const conditionType = isMin ? 'gte' : 'lte';
                const numericValue = Number(value);
                if (!where[actualField]) where[actualField] = {};
                where[actualField][conditionType] = numericValue;
            } else {
                // Aquí manejamos enums, arrays y strings
                handleCondition(isEnumField, actualField, value, where);
            }
        } else {

            // Relacionado
            if (Array.isArray(value)) {
                console.log("donde voy a entrar 1111111", value)
                // Aquí deberías adaptar para manejar arrays de enums correctamente en relaciones
                value.forEach(val => {
                    // const condition = isEnumField ? { equals: val } : { contains: val, mode: 'insensitive' };
                    const condition = isEnumField ? { equals: value } : (typeof value === 'string' ? { contains: val, mode: 'insensitive' } : { equals: val });

                    // orConditions.push({ [relation]: { some: { [field]: condition } } });

                    // Este de abajo es bueno 26/06/2024. Comentado para hacer uso de la condición
                    // orConditions.push({ [relation]: { [field]: condition } });

                    // Condición para relación de segundo nivel 26/06/2024
                    if (relation2) {
                        console.log("aqui 111111")

                        orConditions.push({ [relation2]: { [relation]: { [actualField]: condition } } });
                    } else {
                        console.log("aqui 222222")

                        orConditions.push({ [relation]: { [field]: condition } });
                    }

                });
            } else {
                console.log("donde voy a entrar 222222", value)

                // Manejar enums y strings en relaciones
                // const condition = isEnumField ? { equals: value } : { contains: value, mode: 'insensitive' };
                const condition = isEnumField ? { equals: value } : (typeof value === 'string' ? { contains: value, mode: 'insensitive' } : { equals: value });
                // where[relation] = { some: { [field]: condition } };

                // Este de abajo es bueno 26/06/2024. Comentado para hacer uso de la condición
                // where[relation] = { [field]: condition };

                // Condición para relación de segundo nivel 26/06/2024
                if (relation2) {
                    console.log("aqui 1")
                    where[relation2] = { [relation]: { [actualField]: condition } };
                } else {
                    console.log("aqui 2")

                    where[relation] = { [field]: condition };
                }
            }
        }
    });

    if (orConditions.length > 0) {
        where.OR = orConditions;
    }

    return where;
}

function handleCondition(isEnumField, field, value, where) {

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
    let where = { AND: [] };
    let conditionsByPath: { [key: string]: any[] } = {};

    // Recolectar condiciones por path
    Object.entries(filtersJson).forEach(([key, filters]: any) => {
        filters.forEach(filter => {
            const { path, value } = filter;
            let conditionValue = Array.isArray(value) ? value : [value]; // Asegurar que siempre sea un array

            let pathKey = path.join('.'); // Convertir el array de path a string para usar como clave

            // Inicializar el arreglo en la clave si no existe
            if (!conditionsByPath[pathKey]) {
                conditionsByPath[pathKey] = [];
            }

            // Añadir la condición al arreglo correspondiente
            conditionValue.forEach(val => {
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
    Object.values(conditionsByPath).forEach(conditions => {
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



// function generateParamsJson(filtersJson) {
//   let paramsJson = {};

//   Object.entries(filtersJson).forEach(([field, filters]: any) => {
//     filters.forEach(filter => {
//       const { path, value } = filter;
//       // Asumimos que 'path' tiene un solo nivel para este ejemplo, es decir, path = ["contact_method"]


//       // Directamente asignamos 'value' a 'equals', manejando tanto arrays como valores únicos
//       paramsJson = { path, equals: value[0] };
//     });
//   });

//   return { paramsJson };
// }

// function handleJsonFilters(filtersJson: Record<string, FilterJson[]>, where: any): void {
//   Object.entries(filtersJson).forEach(([field, filters]) => {
//     filters.forEach(filter => {
//       const { path, value, relation } = filter;

//       // Suponiendo que 'path' es un array que define la ruta al campo dentro de un objeto JSON,
//       // y 'value' es el valor a comparar. La implementación específica dependerá de tu ORM.
//       const jsonCondition = {
//         [path.join('.')]: { equals: value }, // Usando 'path.join('.')' como ejemplo de cómo podrías querer manejar el path.
//       };

//       if (relation) {
//         if (!where[relation]) where[relation] = { some: [] };
//         where[relation].some.push({ ...jsonCondition });
//       } else {
//         // Manejo de condiciones sin relación
//         if (!where[field]) where[field] = [];
//         where[field].push({ ...jsonCondition });
//       }
//     });
//   });
// }



export { getGenericSpecial };
