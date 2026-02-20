import { EventStatusType } from "@prisma/client";
import prisma from "../../../lib/prisma";
import { Pagination, normalizePaginationInput } from "../../../models/pagination";
import { hashClientValue } from "../../client-data-crypto/clientDataCrypto";


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

    ;

async function getGenericSpecialEvent2(
    pagination: Pagination,
    modelName: ModelType,
    includeRelations?: any,
    notCancelled?: boolean,
    options?: { maxItemsPerPage?: number; maxPage?: number }
) {
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


    // console.log("Get genetic special, filtos", filters)

    let where: any = {};
    if (filters && Object.keys(filters).length > 0) {
        where = mergeDeep(where, processFilters(filters as any, modelName));
    }

    if (filtersJson && Object.keys(filtersJson).length > 0) {
        where = mergeDeep(where, processFiltersJson(filtersJson));
    }

    let orderQuery: any;
    if (orderBy) {
        if (orderBy.relation) {
            orderQuery = {
                [orderBy.relation]: {
                    [orderBy.field]: orderBy.order,
                }
            };
        } else {
            // Ordenación en la tabla principal
            orderQuery = {
                [orderBy.field]: orderBy.order,
            };
        }
    }

    // if (startDate || endDate) {
    //   where.createdDate = {};
    //   if (startDate) where.createdDate.gte = startDate;
    //   if (endDate) where.createdDate.lte = endDate;
    // }

    // console.log("llego aqui")

    if (startDate || endDate) {
        const dateConditions = [];

        if (startDate && endDate) {
            dateConditions.push({
                AND: [
                    { startDate: { lte: endDate } },  // Comienza antes de que termine el rango
                    { endDate: { gte: startDate } }   // Termina después de que comienza el rango
                ]
            });
        } else if (startDate) {
            dateConditions.push({ endDate: { gte: startDate } });
        } else if (endDate) {
            dateConditions.push({ startDate: { lte: endDate } });
        }
        // Si where ya tiene condiciones, añadimos las condiciones de fecha dentro de una nueva AND
        if (Object.keys(where).length > 0) {
            where = {
                AND: [
                    where, // Mantiene las condiciones previas
                    { OR: dateConditions }, // Añade las nuevas condiciones de fechas como OR
                ]
            };
        } else {
            // Si no hay condiciones previas, solo aplicamos las condiciones de fechas
            where = { OR: dateConditions };
        }
    }

    // console.log("mira where", JSON.stringify(where, null, 2))
    // console.log("mira include", includeRelations)


    if (modelName === "event") {
        const cancelledStatusFilter = {
            notIn: [
                EventStatusType.CANCELLED,
                EventStatusType.CANCELLED_BY_CLIENT_REMOVED,
                EventStatusType.CANCELLED_BY_CLIENT,
            ]
        };

        const existingGroupFilter: any = (where as any).groupEvents;
        const existingIs: any = existingGroupFilter?.is ?? {};

        where = {
            ...where,
            deletedDate: null,
            groupEvents: {
                ...(existingGroupFilter?.isNot ? { isNot: existingGroupFilter.isNot } : {}),
                is: {
                    ...existingIs,
                    deletedDate: null,
                    ...(notCancelled ? { eventStatusType: cancelledStatusFilter } : {}),
                },
            }
        };
    } else {
        where = {
            ...where,
            deletedDate: null,
            ...(notCancelled
                ? {
                    eventStatusType: {
                        notIn: [
                            EventStatusType.CANCELLED,
                            EventStatusType.CANCELLED_BY_CLIENT_REMOVED,
                            EventStatusType.CANCELLED_BY_CLIENT,
                        ]
                    },
                }
                : {}),
        };
    }


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

        console.log("Error en getGenericSpecialEvent2", error)
        throw new Error(`Error in getGeneric for model ${modelName}: ${error.message}`);
    }
}

const resolveEncryptedHashField = (
    modelName: ModelType,
    field: string,
    relation?: string,
    relation2?: string
): string | undefined => {
    if (modelName !== "event") return undefined;

    if (!relation && field === "description") return "descriptionHash";
    if (relation === "groupEvents" && field === "commentClient") return "commentClientHash";
    if (relation === "groupEvents" && field === "description") return "descriptionHash";
    if (relation2 === "groupEvents" && field === "commentClient") return "commentClientHash";
    if (relation2 === "groupEvents" && field === "description") return "descriptionHash";

    return undefined;
};

const hashStringOrNull = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    return hashClientValue(value) ?? null;
};

const buildCondition = (
    modelName: ModelType,
    actualField: string,
    relation: string | undefined,
    relation2: string | undefined,
    isEnumField: boolean,
    value: any
): { targetField: string; condition: any } => {
    const encryptedHashField = resolveEncryptedHashField(
        modelName,
        actualField,
        relation,
        relation2
    );

    if (encryptedHashField) {
        if (Array.isArray(value)) {
            const hashValues = value
                .map((item) => hashStringOrNull(item))
                .filter((item): item is string => typeof item === "string");

            return {
                targetField: encryptedHashField,
                condition: { in: hashValues },
            };
        }

        return {
            targetField: encryptedHashField,
            condition: { equals: hashStringOrNull(value) },
        };
    }

    if (Array.isArray(value)) {
        return {
            targetField: actualField,
            condition: { in: value },
        };
    }

    return {
        targetField: actualField,
        condition: isEnumField
            ? { equals: value }
            : typeof value === "string"
                ? { contains: value }
                : { equals: value },
    };
};

function processFilters(filters: Record<string, {
    value: any;
    relation?: string;
    relation2?: string;
    relationType?: string;
    relationType2?: string;
    isEnum?: boolean;
}>, modelName: ModelType) {
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

        const isEnumField = field.endsWith('Type') || Boolean(isEnum);

        const isMin = field.startsWith('min_');
        const isMax = field.startsWith('max_');
        const actualField = field.replace(/^(min_|max_)/, '');

        const { targetField, condition } = buildCondition(
            modelName,
            actualField,
            relation,
            relation2,
            isEnumField,
            value
        );

        let newFilter: any;

        if (!relation) {
            // No relacionado
            if (isMin || isMax) {
                const conditionType = isMin ? 'gte' : 'lte';
                const numericValue = Number(value);
                if (!where[targetField]) where[targetField] = {};
                where[targetField][conditionType] = numericValue;
            } else {
                newFilter = { [targetField]: condition };
                mergeDeep(where, newFilter);
            }
        } else {
            // Relacionado
            let nestedFilter: any = { [targetField]: condition };

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

export { getGenericSpecialEvent2 };
