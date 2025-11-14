-- CreateIndex
CREATE INDEX "idx_events_availability_ws_user_start" ON "events"("idWorkspaceFk", "idUserPlatformFk", "startDate");
