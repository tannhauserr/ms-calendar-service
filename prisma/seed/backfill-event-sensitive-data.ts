import { PrismaClient } from "@prisma/client";
import {
    decryptClientValue,
    encryptClientValue,
    getCurrentClientKeyVersion,
    hashClientValue,
    isEncryptedClientValue,
} from "../../src/utils/client-data-crypto/clientDataCrypto";

const prisma = new PrismaClient();
const BATCH_SIZE = Math.max(1, Number.parseInt(process.env.BACKFILL_BATCH_SIZE ?? "300", 10));

const toEncryptedAndHash = (value: string | null) => {
    if (value == null) {
        return { encrypted: null as string | null, hash: null as string | null };
    }

    const wasEncrypted = isEncryptedClientValue(value);
    let plain = value;
    let hasValidEncryptedPayload = false;

    if (wasEncrypted) {
        try {
            plain = decryptClientValue(value);
            hasValidEncryptedPayload = true;
        } catch {
            plain = value;
        }
    }

    return {
        encrypted: hasValidEncryptedPayload ? value : encryptClientValue(plain),
        hash: hashClientValue(plain) ?? null,
    };
};

const backfillEvents = async (keyVersion: number) => {
    let cursorId: string | undefined;
    let updatedRows = 0;

    while (true) {
        const rows = await prisma.event.findMany({
            where: {
                OR: [
                    { description: { not: null } },
                    { descriptionHash: { not: null } },
                    { encryptionKeyVersion: { not: keyVersion } },
                ],
            },
            select: {
                id: true,
                description: true,
                descriptionHash: true,
                encryptionKeyVersion: true,
            },
            orderBy: { id: "asc" },
            take: BATCH_SIZE,
            ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
        });

        if (!rows.length) break;

        const updates = rows
            .map((row) => {
                const next = toEncryptedAndHash(row.description);
                const needsUpdate =
                    row.description !== next.encrypted ||
                    row.descriptionHash !== next.hash ||
                    row.encryptionKeyVersion !== keyVersion;

                if (!needsUpdate) return null;

                return prisma.event.update({
                    where: { id: row.id },
                    data: {
                        description: next.encrypted,
                        descriptionHash: next.hash,
                        encryptionKeyVersion: keyVersion,
                    },
                });
            })
            .filter(Boolean) as Array<ReturnType<typeof prisma.event.update>>;

        if (updates.length > 0) {
            await prisma.$transaction(updates);
            updatedRows += updates.length;
        }

        cursorId = rows[rows.length - 1].id;
    }

    return updatedRows;
};

const backfillGroupEvents = async (keyVersion: number) => {
    let cursorId: string | undefined;
    let updatedRows = 0;

    while (true) {
        const rows = await prisma.groupEvents.findMany({
            where: {
                OR: [
                    { commentClient: { not: null } },
                    { description: { not: null } },
                    { commentClientHash: { not: null } },
                    { descriptionHash: { not: null } },
                    { encryptionKeyVersion: { not: keyVersion } },
                ],
            },
            select: {
                id: true,
                commentClient: true,
                description: true,
                commentClientHash: true,
                descriptionHash: true,
                encryptionKeyVersion: true,
            },
            orderBy: { id: "asc" },
            take: BATCH_SIZE,
            ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
        });

        if (!rows.length) break;

        const updates = rows
            .map((row) => {
                const comment = toEncryptedAndHash(row.commentClient);
                const description = toEncryptedAndHash(row.description);

                const needsUpdate =
                    row.commentClient !== comment.encrypted ||
                    row.description !== description.encrypted ||
                    row.commentClientHash !== comment.hash ||
                    row.descriptionHash !== description.hash ||
                    row.encryptionKeyVersion !== keyVersion;

                if (!needsUpdate) return null;

                return prisma.groupEvents.update({
                    where: { id: row.id },
                    data: {
                        commentClient: comment.encrypted,
                        description: description.encrypted,
                        commentClientHash: comment.hash,
                        descriptionHash: description.hash,
                        encryptionKeyVersion: keyVersion,
                    },
                });
            })
            .filter(Boolean) as Array<ReturnType<typeof prisma.groupEvents.update>>;

        if (updates.length > 0) {
            await prisma.$transaction(updates);
            updatedRows += updates.length;
        }

        cursorId = rows[rows.length - 1].id;
    }

    return updatedRows;
};

async function main() {
    const keyVersion = getCurrentClientKeyVersion();

    const [eventsUpdated, groupsUpdated] = await Promise.all([
        backfillEvents(keyVersion),
        backfillGroupEvents(keyVersion),
    ]);

    console.log(
        `[backfill-event-sensitive-data] done | keyVersion=${keyVersion} | events=${eventsUpdated} | groupEvents=${groupsUpdated}`
    );
}

main()
    .catch((error) => {
        console.error("[backfill-event-sensitive-data] error:", error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
