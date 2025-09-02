-- CreateIndex
CREATE INDEX "idx_events_user_start_end" ON "events"("idUserPlatformFk", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "idx_events_user_end" ON "events"("idUserPlatformFk", "endDate");

-- CreateIndex
CREATE INDEX "idx_events_start_brin" ON "events" USING BRIN ("startDate");
