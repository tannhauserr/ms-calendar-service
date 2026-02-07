/*
  Warnings:

  - Added the required column `idEventFk` to the `temporaryBusinessHours` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "temporaryBusinessHours" ADD COLUMN     "idEventFk" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "temporaryBusinessHours" ADD CONSTRAINT "temporaryBusinessHours_idEventFk_fkey" FOREIGN KEY ("idEventFk") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
