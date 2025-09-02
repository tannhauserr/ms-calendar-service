/*
  Warnings:

  - You are about to drop the column `endDate` on the `recurrenceRules` table. All the data in the column will be lost.
  - You are about to drop the column `startDate` on the `recurrenceRules` table. All the data in the column will be lost.
  - The `recurrenceStatusType` column on the `recurrenceRules` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `dtstart` to the `recurrenceRules` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "recurrenceRules" DROP COLUMN "endDate",
DROP COLUMN "startDate",
ADD COLUMN     "dtstart" TIMESTAMPTZ(6) NOT NULL,
ADD COLUMN     "until" TIMESTAMPTZ(6),
DROP COLUMN "recurrenceStatusType",
ADD COLUMN     "recurrenceStatusType" "RecurrenceStatusType" NOT NULL DEFAULT 'ACTIVE';
