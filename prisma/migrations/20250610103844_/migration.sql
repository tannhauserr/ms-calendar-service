/*
  Warnings:

  - You are about to drop the column `detetedDate` on the `recurrenceRules` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "recurrenceRules" DROP COLUMN "detetedDate",
ADD COLUMN     "deletedDate" TIMESTAMP(3);
