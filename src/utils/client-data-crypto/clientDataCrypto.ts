import crypto from "crypto";

const ENCRYPTED_PREFIX = "enc:v";
const ENCRYPTED_REGEX = /^enc:v(\d+):([^:]+):([^:]+):(.+)$/;
const ALGORITHM = "aes-256-gcm";
const IV_SIZE_BYTES = 12;

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
    const parsed = Number.parseInt(value ?? "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const getCurrentClientKeyVersion = (): number =>
    parsePositiveInt(process.env.DESCRYPT_KEY_VERSION, 1);

const resolveMainKey = (): string => {
    const key = process.env.DESCRYPT_KEY?.trim();
    if (!key) {
        throw new Error("DESCRYPT_KEY no está definido en las variables de entorno");
    }
    return key;
};

const buildKeyForVersion = (version: number): Buffer => {
    const material = `${resolveMainKey()}::v${version}`;
    return crypto.createHash("sha256").update(material).digest();
};

export const isEncryptedClientValue = (value: unknown): value is string =>
    typeof value === "string" && ENCRYPTED_REGEX.test(value);

export const encryptClientValue = (
    plainText: string,
    version: number = getCurrentClientKeyVersion()
): string => {
    if (isEncryptedClientValue(plainText)) return plainText;

    const iv = crypto.randomBytes(IV_SIZE_BYTES);
    const cipher = crypto.createCipheriv(ALGORITHM, buildKeyForVersion(version), iv);

    const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return `${ENCRYPTED_PREFIX}${version}:${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
};

export const decryptClientValue = (value: string): string => {
    const match = ENCRYPTED_REGEX.exec(value);
    if (!match) return value;

    const [, versionRaw, ivB64, tagB64, encryptedB64] = match;
    const version = parsePositiveInt(versionRaw, 1);
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(tagB64, "base64");
    const encrypted = Buffer.from(encryptedB64, "base64");

    const decipher = crypto.createDecipheriv(ALGORITHM, buildKeyForVersion(version), iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
};

const normalizeForHash = (value: string): string => value.trim().toLowerCase();

export const hashClientValue = (
    value: string | null | undefined
): string | null | undefined => {
    if (value === undefined) return undefined;
    if (value === null) return null;

    const normalized = normalizeForHash(value);
    if (!normalized) return null;

    return crypto
        .createHmac("sha256", resolveMainKey())
        .update(normalized)
        .digest("hex");
};
