import { Prisma } from "@prisma/client";
import prisma from "../../../../lib/prisma";
import { RabbitPubSubService } from "../facade-pubsub/rabbit-pubsub.service";

export type DeadLetterMessageStatus = "PENDING" | "REPLAYED" | "REPLAY_FAILED";

export interface RegisterDeadLetterMessageInput {
    queueName: string;
    exchangeName: string;
    routingKey: string;
    sourceRoutingKey?: string | null;
    consumerName: string;
    payload: unknown;
    headers?: Record<string, unknown> | null;
    retryCount?: number;
    errorMessage?: string | null;
}

export interface ListDeadLetterMessagesInput {
    page?: number;
    itemsPerPage?: number;
    status?: DeadLetterMessageStatus;
    consumerName?: string;
}

type DeadLetterMessageRow = {
    id: string;
    queueName: string;
    exchangeName: string;
    routingKey: string;
    sourceRoutingKey: string | null;
    consumerName: string;
    payload: unknown;
    headers: unknown;
    retryCount: number;
    errorMessage: string | null;
    status: DeadLetterMessageStatus;
    replayCount: number;
    lastReplayDate: Date | null;
    lastReplayByRole: string | null;
    lastReplayError: string | null;
    createdDate: Date;
    updatedDate: Date;
    deletedDate: Date | null;
};

export class DeadLetterMessageService {
    private static _instance: DeadLetterMessageService;

    public static get instance(): DeadLetterMessageService {
        if (!this._instance) this._instance = new DeadLetterMessageService();
        return this._instance;
    }

    private normalizeJsonValue(value: unknown): unknown {
        if (value === null || value === undefined) return null;
        if (typeof value === "string") {
            try {
                return JSON.parse(value);
            } catch {
                return value;
            }
        }
        return value;
    }

    private sanitizeHeaders(headers: unknown): Record<string, unknown> {
        const source = (this.normalizeJsonValue(headers) ?? {}) as Record<string, unknown>;
        const safe: Record<string, unknown> = { ...source };
        delete safe["x-death"];
        delete safe["x-first-death-exchange"];
        delete safe["x-first-death-queue"];
        delete safe["x-first-death-reason"];
        delete safe["x-retry"];
        return safe;
    }

    private parseCount(value: unknown): number {
        if (typeof value === "number") return value;
        if (typeof value === "bigint") return Number(value);
        if (typeof value === "string") return Number(value);
        return 0;
    }

    public async registerMessage(input: RegisterDeadLetterMessageInput): Promise<string> {
        const payload = this.normalizeJsonValue(input.payload ?? null);
        const headers = this.normalizeJsonValue(input.headers ?? {});

        const created = await prisma.deadLetterMessage.create({
            data: {
                queueName: input.queueName,
                exchangeName: input.exchangeName,
                routingKey: input.routingKey,
                sourceRoutingKey: input.sourceRoutingKey ?? null,
                consumerName: input.consumerName,
                payload: payload === null ? Prisma.JsonNull : (payload as Prisma.InputJsonValue),
                headers: headers === null ? Prisma.JsonNull : (headers as Prisma.InputJsonValue),
                retryCount: input.retryCount ?? 0,
                errorMessage: input.errorMessage ?? null,
                status: "PENDING",
            },
            select: {
                id: true,
            },
        });

        return created.id;
    }

    public async listMessages(input: ListDeadLetterMessagesInput) {
        const page = Math.max(1, Number(input.page ?? 1));
        const itemsPerPage = Math.min(100, Math.max(1, Number(input.itemsPerPage ?? 20)));
        const offset = (page - 1) * itemsPerPage;

        const where = Prisma.sql`
            WHERE "deletedDate" IS NULL
            ${input.status ? Prisma.sql`AND "status" = ${input.status}::"DeadLetterMessageStatus"` : Prisma.empty}
            ${input.consumerName ? Prisma.sql`AND "consumerName" = ${input.consumerName}` : Prisma.empty}
        `;

        const rows = await prisma.$queryRaw<DeadLetterMessageRow[]>(Prisma.sql`
            SELECT
                "id",
                "queueName",
                "exchangeName",
                "routingKey",
                "sourceRoutingKey",
                "consumerName",
                "payload",
                "headers",
                "retryCount",
                "errorMessage",
                "status",
                "replayCount",
                "lastReplayDate",
                "lastReplayByRole",
                "lastReplayError",
                "createdDate",
                "updatedDate",
                "deletedDate"
            FROM "deadLetterMessages"
            ${where}
            ORDER BY "createdDate" DESC
            LIMIT ${itemsPerPage}
            OFFSET ${offset}
        `);

        const countRows = await prisma.$queryRaw<Array<{ count: unknown }>>(Prisma.sql`
            SELECT COUNT(*) AS count
            FROM "deadLetterMessages"
            ${where}
        `);

        const totalItems = this.parseCount(countRows[0]?.count);
        const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

        return {
            rows: rows.map((row) => ({
                ...row,
                payload: this.normalizeJsonValue(row.payload),
                headers: this.normalizeJsonValue(row.headers),
            })),
            pagination: {
                page,
                itemsPerPage,
                totalItems,
                totalPages,
            },
        };
    }

    public async replayMessage(id: string, replayedByRole: string) {
        const rows = await prisma.$queryRaw<DeadLetterMessageRow[]>(Prisma.sql`
            SELECT
                "id",
                "queueName",
                "exchangeName",
                "routingKey",
                "sourceRoutingKey",
                "consumerName",
                "payload",
                "headers",
                "retryCount",
                "errorMessage",
                "status",
                "replayCount",
                "lastReplayDate",
                "lastReplayByRole",
                "lastReplayError",
                "createdDate",
                "updatedDate",
                "deletedDate"
            FROM "deadLetterMessages"
            WHERE "id" = ${id}
              AND "deletedDate" IS NULL
            LIMIT 1
        `);

        const row = rows[0];
        if (!row) return null;

        const payload = this.normalizeJsonValue(row.payload);
        const currentHeaders = this.sanitizeHeaders(row.headers);
        const replayHeaders = {
            ...currentHeaders,
            "x-replay-from-dlq-id": row.id,
            "x-replay-at": new Date().toISOString(),
        };

        try {
            await RabbitPubSubService.instance.publishToExchange<any>(
                row.exchangeName,
                row.routingKey,
                payload as any,
                {
                    persistent: true,
                    headers: replayHeaders,
                }
            );

            await prisma.$executeRaw`
                UPDATE "deadLetterMessages"
                SET
                    "status" = 'REPLAYED'::"DeadLetterMessageStatus",
                    "replayCount" = "replayCount" + 1,
                    "lastReplayDate" = NOW(),
                    "lastReplayByRole" = ${replayedByRole},
                    "lastReplayError" = NULL,
                    "updatedDate" = NOW()
                WHERE "id" = ${row.id}
            `;

            return {
                id: row.id,
                status: "REPLAYED" as DeadLetterMessageStatus,
                replayCount: row.replayCount + 1,
                routingKey: row.routingKey,
                exchangeName: row.exchangeName,
            };
        } catch (error: any) {
            await prisma.$executeRaw`
                UPDATE "deadLetterMessages"
                SET
                    "status" = 'REPLAY_FAILED'::"DeadLetterMessageStatus",
                    "replayCount" = "replayCount" + 1,
                    "lastReplayDate" = NOW(),
                    "lastReplayByRole" = ${replayedByRole},
                    "lastReplayError" = ${error?.message ?? "Replay failed"},
                    "updatedDate" = NOW()
                WHERE "id" = ${row.id}
            `;

            throw error;
        }
    }
}
