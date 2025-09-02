-- CreateEnum
CREATE TYPE "RecurrenceStatusType" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED');

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "idRecurrenceRule" TEXT;

-- CreateTable
CREATE TABLE "recurrenceRules" (
    "id" TEXT NOT NULL,
    "idCalendarFk" TEXT NOT NULL,
    "startDate" TIMESTAMPTZ(6) NOT NULL,
    "endDate" TIMESTAMPTZ(6),
    "rrule" VARCHAR(512) NOT NULL,
    "tzid" VARCHAR(100) NOT NULL,
    "recurrenceStatusType" TEXT,
    "idUserFk" TEXT,
    "createdDate" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedDate" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "recurrenceRules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recurrenceRules_idCalendarFk_idx" ON "recurrenceRules"("idCalendarFk");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_idRecurrenceRule_fkey" FOREIGN KEY ("idRecurrenceRule") REFERENCES "recurrenceRules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurrenceRules" ADD CONSTRAINT "recurrenceRules_idCalendarFk_fkey" FOREIGN KEY ("idCalendarFk") REFERENCES "calendars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
