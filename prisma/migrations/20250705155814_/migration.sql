/*
  Warnings:

  - You are about to drop the column `idRecurrenceRuleFk` on the `eventParticipants` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "eventParticipants" DROP CONSTRAINT "eventParticipants_idRecurrenceRuleFk_fkey";

-- AlterTable
ALTER TABLE "eventParticipants" DROP COLUMN "idRecurrenceRuleFk";
