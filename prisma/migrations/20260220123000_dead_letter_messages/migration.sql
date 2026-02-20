-- CreateEnum
CREATE TYPE "DeadLetterMessageStatus" AS ENUM ('PENDING', 'REPLAYED', 'REPLAY_FAILED');

-- CreateTable
CREATE TABLE "deadLetterMessages" (
    "id" TEXT NOT NULL,
    "queueName" VARCHAR(120) NOT NULL,
    "exchangeName" VARCHAR(120) NOT NULL,
    "routingKey" VARCHAR(180) NOT NULL,
    "sourceRoutingKey" VARCHAR(180),
    "consumerName" VARCHAR(120) NOT NULL,
    "payload" JSONB NOT NULL,
    "headers" JSONB,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" VARCHAR(512),
    "status" "DeadLetterMessageStatus" NOT NULL DEFAULT 'PENDING',
    "replayCount" INTEGER NOT NULL DEFAULT 0,
    "lastReplayDate" TIMESTAMPTZ(3),
    "lastReplayByRole" VARCHAR(64),
    "lastReplayError" VARCHAR(512),
    "createdDate" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedDate" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedDate" TIMESTAMPTZ(3),

    CONSTRAINT "deadLetterMessages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deadLetterMessages_status_createdDate_idx"
ON "deadLetterMessages"("status", "createdDate");

-- CreateIndex
CREATE INDEX "deadLetterMessages_queueName_createdDate_idx"
ON "deadLetterMessages"("queueName", "createdDate");

-- CreateIndex
CREATE INDEX "deadLetterMessages_consumerName_createdDate_idx"
ON "deadLetterMessages"("consumerName", "createdDate");
