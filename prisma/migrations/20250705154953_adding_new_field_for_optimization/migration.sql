-- AlterTable
ALTER TABLE "eventParticipants" ADD COLUMN     "idRecurrenceRuleFk" TEXT;

-- AddForeignKey
ALTER TABLE "eventParticipants" ADD CONSTRAINT "eventParticipants_idRecurrenceRuleFk_fkey" FOREIGN KEY ("idRecurrenceRuleFk") REFERENCES "recurrenceRules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
