-- DropForeignKey
ALTER TABLE "eventParticipants" DROP CONSTRAINT "eventParticipants_idEventFk_fkey";

-- DropForeignKey
ALTER TABLE "externalCalendarEvents" DROP CONSTRAINT "externalCalendarEvents_idEventFk_fkey";

-- DropForeignKey
ALTER TABLE "workerAbsences" DROP CONSTRAINT "workerAbsences_idEventFk_fkey";

-- AddForeignKey
ALTER TABLE "eventParticipants" ADD CONSTRAINT "eventParticipants_idEventFk_fkey" FOREIGN KEY ("idEventFk") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "externalCalendarEvents" ADD CONSTRAINT "externalCalendarEvents_idEventFk_fkey" FOREIGN KEY ("idEventFk") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workerAbsences" ADD CONSTRAINT "workerAbsences_idEventFk_fkey" FOREIGN KEY ("idEventFk") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
