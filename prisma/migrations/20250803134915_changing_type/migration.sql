/*
  Warnings:

  - The `startTime` column on the `temporaryBusinessHours` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `endTime` column on the `temporaryBusinessHours` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "temporaryBusinessHours" DROP COLUMN "startTime",
ADD COLUMN     "startTime" VARCHAR(5),
DROP COLUMN "endTime",
ADD COLUMN     "endTime" VARCHAR(5);
