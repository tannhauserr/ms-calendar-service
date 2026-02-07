-- CreateTable
CREATE TABLE "waitLists" (
    "id" TEXT NOT NULL,
    "idUserFk" TEXT NOT NULL,
    "idWorkspaceFk" TEXT NOT NULL,
    "startDate" TIMESTAMPTZ(6) NOT NULL,
    "endDate" TIMESTAMPTZ(6) NOT NULL,
    "messageWasSent" BOOLEAN NOT NULL DEFAULT false,
    "messageSentDate" TIMESTAMP(3),
    "vipLevel" INTEGER NOT NULL DEFAULT 0,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedDate" TIMESTAMP(3) NOT NULL,
    "deletedDate" TIMESTAMP(3),

    CONSTRAINT "waitLists_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "waitLists_idWorkspaceFk_idx" ON "waitLists"("idWorkspaceFk");

-- CreateIndex
CREATE INDEX "waitLists_idUserFk_idx" ON "waitLists"("idUserFk");

-- CreateIndex
CREATE INDEX "waitLists_messageWasSent_endDate_idx" ON "waitLists"("messageWasSent", "endDate");

-- CreateIndex
CREATE INDEX "waitLists_vipLevel_createdDate_idx" ON "waitLists"("vipLevel", "createdDate");
