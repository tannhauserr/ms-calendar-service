/*
  Warnings:

  - The primary key for the `eventParticipants` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- AlterTable
ALTER TABLE "eventParticipants" DROP CONSTRAINT "eventParticipants_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "eventParticipants_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "eventParticipants_id_seq";
