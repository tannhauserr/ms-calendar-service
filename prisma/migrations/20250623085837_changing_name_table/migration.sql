/*
  Warnings:

  - You are about to drop the column `idGoogleEvent` on the `events` table. All the data in the column will be lost.
  - You are about to drop the column `idRecurrenceRule` on the `events` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "events" DROP CONSTRAINT "events_idRecurrenceRule_fkey";

-- AlterTable
ALTER TABLE "events" DROP COLUMN "idGoogleEvent",
DROP COLUMN "idRecurrenceRule",
ADD COLUMN     "idRecurrenceRuleFk" TEXT;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_idRecurrenceRuleFk_fkey" FOREIGN KEY ("idRecurrenceRuleFk") REFERENCES "recurrenceRules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
