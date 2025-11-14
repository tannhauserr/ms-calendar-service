-- DropIndex
DROP INDEX "notificationPlans_status_eventStartDate_idx";

-- CreateIndex
CREATE INDEX "notificationPlans_idEventFk_status_idx" ON "notificationPlans"("idEventFk", "status");
