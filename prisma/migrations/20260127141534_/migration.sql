/*
  Warnings:

  - Added the required column `idCompanyFk` to the `events` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "events" ADD COLUMN     "encryptionKeyVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "idCompanyFk" TEXT NOT NULL;
