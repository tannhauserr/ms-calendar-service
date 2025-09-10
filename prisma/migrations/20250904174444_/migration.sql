-- CreateIndex
CREATE INDEX "eventParticipants_idClientWorkspaceFk_idx" ON "eventParticipants"("idClientWorkspaceFk");

-- CreateIndex
CREATE INDEX "eventParticipants_idClientFk_idx" ON "eventParticipants"("idClientFk");

-- CreateIndex
CREATE INDEX "eventParticipants_idEventFk_eventStatusType_idx" ON "eventParticipants"("idEventFk", "eventStatusType");
