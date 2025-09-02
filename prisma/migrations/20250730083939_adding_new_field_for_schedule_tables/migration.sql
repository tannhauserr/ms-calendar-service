/*
  Warnings:

  - Made the column `idWorkspaceFk` on table `workerAbsences` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "temporaryBusinessHours_idCompanyFk_idx";

-- DropIndex
DROP INDEX "workerAbsences_idCompanyFk_idx";

-- DropIndex
DROP INDEX "workerBusinessHours_idCompanyFk_idx";

-- AlterTable
ALTER TABLE "businessHours" ALTER COLUMN "idWorkspaceFk" SET DEFAULT '';

-- AlterTable
ALTER TABLE "temporaryBusinessHours" ADD COLUMN     "idWorkspaceFk" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "workerAbsences" ALTER COLUMN "idWorkspaceFk" SET NOT NULL,
ALTER COLUMN "idWorkspaceFk" SET DEFAULT '';

-- AlterTable
ALTER TABLE "workerBusinessHours" ADD COLUMN     "idWorkspaceFk" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "businessHours_idWorkspaceFk_idx" ON "businessHours"("idWorkspaceFk");

-- CreateIndex
CREATE INDEX "temporaryBusinessHours_idWorkspaceFk_idx" ON "temporaryBusinessHours"("idWorkspaceFk");

-- CreateIndex
CREATE INDEX "temporaryBusinessHours_idUserFk_idWorkspaceFk_idx" ON "temporaryBusinessHours"("idUserFk", "idWorkspaceFk");

-- CreateIndex
CREATE INDEX "workerAbsences_idWorkspaceFk_idx" ON "workerAbsences"("idWorkspaceFk");

-- CreateIndex
CREATE INDEX "workerAbsences_idUserFk_idWorkspaceFk_idx" ON "workerAbsences"("idUserFk", "idWorkspaceFk");

-- CreateIndex
CREATE INDEX "workerBusinessHours_idWorkspaceFk_idx" ON "workerBusinessHours"("idWorkspaceFk");

-- CreateIndex
CREATE INDEX "workerBusinessHours_idUserFk_idWorkspaceFk_idx" ON "workerBusinessHours"("idUserFk", "idWorkspaceFk");
