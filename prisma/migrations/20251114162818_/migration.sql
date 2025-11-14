/*
  Warnings:

  - You are about to drop the `notificationPlans` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "notificationPlans" DROP CONSTRAINT "notificationPlans_idEventFk_fkey";

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "serviceMaxParticipantsSnapshot" INTEGER DEFAULT 1;

-- DropTable
DROP TABLE "notificationPlans";
