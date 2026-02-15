import { PrismaClient } from "@prisma/client";
import {
    decryptClientValue,
    encryptClientValue,
    getCurrentClientKeyVersion,
    hashClientValue,
    isEncryptedClientValue,
} from "../utils/client-data-crypto/clientDataCrypto";

type SupportedModel = "Event" | "GroupEvents";

type ModelCryptoConfig = {
    encryptedFields: string[];
    hashFieldByEncryptedField: Record<string, string>;
};

const MODEL_CRYPTO_CONFIG: Record<SupportedModel, ModelCryptoConfig> = {
    Event: {
        encryptedFields: ["description"],
        hashFieldByEncryptedField: {
            description: "descriptionHash",
        },
    },
    GroupEvents: {
        encryptedFields: ["commentClient", "description"],
        hashFieldByEncryptedField: {
            commentClient: "commentClientHash",
            description: "descriptionHash",
        },
    },
};

const DECRYPTABLE_FIELDS = new Set<string>([
    ...MODEL_CRYPTO_CONFIG.Event.encryptedFields,
    ...MODEL_CRYPTO_CONFIG.GroupEvents.encryptedFields,
]);

const DEFAULT_COMPANY_ENV_KEYS = ["DEFAULT_ID_COMPANY_FK", "DEFAULT_COMPANY_FK"];

const isSupportedModel = (model: string | undefined): model is SupportedModel =>
    model === "Event" || model === "GroupEvents";

const isPlainObject = (value: unknown): value is Record<string, any> =>
    value !== null && typeof value === "object" && !Array.isArray(value);

const hasOwn = (obj: object, key: string): boolean =>
    Object.prototype.hasOwnProperty.call(obj, key);

const isBlankString = (value: string): boolean => value.trim().length === 0;

const resolveCreateCompanyId = (data: Record<string, any>, model: SupportedModel): string => {
    const direct = typeof data.idCompanyFk === "string" ? data.idCompanyFk.trim() : "";
    if (direct) return direct;

    for (const key of DEFAULT_COMPANY_ENV_KEYS) {
        const candidate = process.env[key]?.trim();
        if (candidate) return candidate;
    }

    throw new Error(
        `${model}.idCompanyFk es obligatorio. Inclúyelo en el create o define DEFAULT_ID_COMPANY_FK`
    );
};

const unwrapFieldValue = (container: Record<string, any>, fieldName: string) => {
    if (!hasOwn(container, fieldName)) {
        return { exists: false, isSetOp: false, value: undefined as any };
    }

    const raw = container[fieldName];
    if (isPlainObject(raw) && hasOwn(raw, "set")) {
        return { exists: true, isSetOp: true, value: raw.set };
    }

    return { exists: true, isSetOp: false, value: raw };
};

const wrapFieldValue = (originalRaw: any, isSetOp: boolean, value: any): any => {
    if (!isSetOp) return value;
    return { ...(isPlainObject(originalRaw) ? originalRaw : {}), set: value };
};

const upsertKeyVersionOnData = (
    data: Record<string, any>,
    action: string,
    shouldUpdate: boolean
) => {
    if (!shouldUpdate) return;

    const keyVersion = getCurrentClientKeyVersion();
    const hasVersion = hasOwn(data, "encryptionKeyVersion");
    const isCreateLike = action === "create" || action === "createMany";

    if (isCreateLike) {
        if (!hasVersion || data.encryptionKeyVersion == null) {
            data.encryptionKeyVersion = keyVersion;
        }
        return;
    }

    data.encryptionKeyVersion = { set: keyVersion };
};

const encryptDataForModel = (
    model: SupportedModel,
    data: unknown,
    action: string
): unknown => {
    if (Array.isArray(data)) {
        return data.map((item) => encryptDataForModel(model, item, action));
    }

    if (!isPlainObject(data)) return data;

    if (action === "create" || action === "createMany") {
        data.idCompanyFk = resolveCreateCompanyId(data, model);
    }

    const cfg = MODEL_CRYPTO_CONFIG[model];
    let touchedEncryptedField = false;

    for (const fieldName of cfg.encryptedFields) {
        const { exists, isSetOp, value } = unwrapFieldValue(data, fieldName);
        if (!exists || value === undefined) continue;

        const originalRaw = data[fieldName];
        const hashFieldName = cfg.hashFieldByEncryptedField[fieldName];

        if (value === null) {
            if (hashFieldName) {
                data[hashFieldName] = wrapFieldValue(data[hashFieldName], isSetOp, null);
            }
            touchedEncryptedField = true;
            continue;
        }

        if (typeof value !== "string") continue;

        const plainValue = isEncryptedClientValue(value)
            ? decryptClientValue(value)
            : value;

        if (isBlankString(plainValue)) {
            if (action === "create" || action === "createMany") {
                data[fieldName] = wrapFieldValue(originalRaw, isSetOp, null);
                if (hashFieldName) {
                    data[hashFieldName] = wrapFieldValue(data[hashFieldName], isSetOp, null);
                }
                touchedEncryptedField = true;
            } else {
                delete data[fieldName];
                if (hashFieldName) {
                    delete data[hashFieldName];
                }
            }
            continue;
        }

        const encryptedValue = isEncryptedClientValue(value)
            ? value
            : encryptClientValue(plainValue);

        data[fieldName] = wrapFieldValue(originalRaw, isSetOp, encryptedValue);

        if (hashFieldName) {
            const hashValue = hashClientValue(plainValue) ?? null;
            data[hashFieldName] = wrapFieldValue(data[hashFieldName], isSetOp, hashValue);
        }

        touchedEncryptedField = true;
    }

    const isCreateLike = action === "create" || action === "createMany";
    upsertKeyVersionOnData(data, action, isCreateLike || touchedEncryptedField);

    return data;
};

const decryptResultRecursive = (result: unknown): unknown => {
    if (Array.isArray(result)) {
        for (const item of result) decryptResultRecursive(item);
        return result;
    }

    if (!isPlainObject(result)) return result;

    for (const [key, value] of Object.entries(result)) {
        if (value == null) continue;

        if (typeof value === "string" && DECRYPTABLE_FIELDS.has(key)) {
            try {
                result[key] = decryptClientValue(value);
            } catch {
                result[key] = value;
            }
            continue;
        }

        if (isPlainObject(value) || Array.isArray(value)) {
            decryptResultRecursive(value);
        }
    }

    return result;
};

const prismaClientSingleton = () => {
    const client = new PrismaClient();

    client.$use(async (params, next) => {
        const model = params.model;
        const action = params.action;

        if (isSupportedModel(model)) {
            const needsData =
                action === "create" ||
                action === "createMany" ||
                action === "update" ||
                action === "updateMany";

            if (needsData && params.args?.data) {
                params.args.data = encryptDataForModel(model, params.args.data, action);
            } else if (action === "upsert") {
                if (params.args?.create) {
                    params.args.create = encryptDataForModel(model, params.args.create, "create");
                }
                if (params.args?.update) {
                    params.args.update = encryptDataForModel(model, params.args.update, "update");
                }
            }
        }

        const result = await next(params);
        return decryptResultRecursive(result);
    });

    return client;
};

type PrismaClientSingleton = ReturnType<typeof prismaClientSingleton>;

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClientSingleton | undefined;
};

const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

export default prisma;

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// import { PrismaClient } from "@prisma/client"

// const prismaClientSingleton = () => {
//     const prisma = new PrismaClient({
//         log: [
//             { level: 'query', emit: 'event' },
//             { level: 'error', emit: 'event' },
//             { level: 'info', emit: 'event' },
//             { level: 'warn', emit: 'event' },
//         ],
//     });

//     prisma.$on('query', (e) => {

//         console.log(JSON.stringify(e, null, 2));

//         console.log('Query: ' + e.query);
//         console.log('Duration: ' + e.duration + 'ms');
//     });

//     return prisma;
// }

// type PrismaClientSingleton = ReturnType<typeof prismaClientSingleton>

// const globalForPrisma = globalThis as unknown as {
//     prisma: PrismaClientSingleton | undefined
// }

// const prisma = globalForPrisma.prisma ?? prismaClientSingleton()

// export default prisma

// if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
