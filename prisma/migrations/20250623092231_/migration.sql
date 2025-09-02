/*
  Warnings:

  - You are about to drop the column `eventStatusType` on the `events` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "eventParticipants" ADD COLUMN     "eventStatusType" "EventStatusType" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "events" DROP COLUMN "eventStatusType";
