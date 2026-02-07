/*
  Warnings:

  - You are about to drop the column `idUserFk` on the `waitLists` table. All the data in the column will be lost.
  - Added the required column `idClientFk` to the `waitLists` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "waitLists_idUserFk_idx";

-- AlterTable
ALTER TABLE "waitLists" DROP COLUMN "idUserFk",
ADD COLUMN     "idClientFk" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "waitLists_idClientFk_idx" ON "waitLists"("idClientFk");
