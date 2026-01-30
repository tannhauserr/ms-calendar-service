/*
  Warnings:

  - You are about to alter the column `title` on the `events` table. The data in that column could be lost. The data in that column will be cast from `VarChar(256)` to `VarChar(120)`.

*/
-- AlterTable
ALTER TABLE "events" ALTER COLUMN "title" SET DATA TYPE VARCHAR(120);

-- AlterTable
ALTER TABLE "groupEvents" ALTER COLUMN "title" SET DATA TYPE VARCHAR(120);

-- AlterTable
ALTER TABLE "temporaryBusinessHours" ADD COLUMN     "description" VARCHAR(256),
ADD COLUMN     "title" VARCHAR(120);

-- AlterTable
ALTER TABLE "workerAbsences" ALTER COLUMN "title" SET DATA TYPE VARCHAR(120);
