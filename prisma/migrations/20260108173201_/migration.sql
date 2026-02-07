/*
  Warnings:

  - Added the required column `endDate` to the `groupEvents` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startDate` to the `groupEvents` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "groupEvents" ADD COLUMN     "endDate" TIMESTAMPTZ(6) NOT NULL,
ADD COLUMN     "startDate" TIMESTAMPTZ(6) NOT NULL;
