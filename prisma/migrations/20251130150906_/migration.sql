/*
  Warnings:

  - You are about to drop the column `idParentLineItemFk` on the `eventLineItems` table. All the data in the column will be lost.
  - You are about to drop the column `idServiceFk` on the `eventLineItems` table. All the data in the column will be lost.
  - You are about to drop the column `lineItemType` on the `eventLineItems` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "eventLineItems_idParentLineItemFk_idx";

-- AlterTable
ALTER TABLE "eventLineItems" DROP COLUMN "idParentLineItemFk",
DROP COLUMN "idServiceFk",
DROP COLUMN "lineItemType";

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "isCommentRead" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "commentClient" SET DATA TYPE VARCHAR(512);

-- DropEnum
DROP TYPE "ActionSectionType";

-- DropEnum
DROP TYPE "PlanStatus";
