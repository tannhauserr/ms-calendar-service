-- CreateEnum
CREATE TYPE "EventSourceType" AS ENUM ('PLATFORM', 'BOT', 'GOOGLE');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('AT_BUSINESS', 'VIRTUAL', 'AT_CLIENT');

-- CreateEnum
CREATE TYPE "EventStatusType" AS ENUM ('PENDING', 'ACCEPTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'CANCELLED_BY_CLIENT', 'CANCELLED_BY_CLIENT_REMOVED', 'PAID');

-- CreateEnum
CREATE TYPE "ModerationStatusType" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EventPurposeType" AS ENUM ('APPOINTMENT', 'VACATION', 'SICK_LEAVE', 'PERSONAL_DAY', 'UNPAID_LEAVE', 'OTHER');

-- CreateEnum
CREATE TYPE "WeekDayType" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateEnum
CREATE TYPE "RecurrenceStatusType" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('planned', 'queued');

-- CreateEnum
CREATE TYPE "ActionSectionType" AS ENUM ('add', 'addFromRecurrence', 'addFromClientWithRequest', 'update', 'cancel', 'rejectRequest', 'acceptRequest', 'markNoShow', 'end');

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(256) NOT NULL,
    "description" VARCHAR(512),
    "startDate" TIMESTAMPTZ(6) NOT NULL,
    "endDate" TIMESTAMPTZ(6) NOT NULL,
    "idCompanyFk" TEXT NOT NULL,
    "idWorkspaceFk" TEXT NOT NULL,
    "idServiceFk" TEXT,
    "idUserPlatformFk" TEXT,
    "commentClient" VARCHAR(300),
    "eventSourceType" "EventSourceType" NOT NULL DEFAULT 'PLATFORM',
    "isEditableByClient" BOOLEAN NOT NULL DEFAULT true,
    "numberUpdates" INTEGER DEFAULT 0,
    "eventStatusType" "EventStatusType" NOT NULL DEFAULT 'PENDING',
    "timeZone" VARCHAR(50) NOT NULL DEFAULT 'Europe/Madrid',
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "serviceNameSnapshot" VARCHAR(100),
    "servicePriceSnapshot" DOUBLE PRECISION,
    "serviceDiscountSnapshot" DOUBLE PRECISION,
    "serviceDurationSnapshot" INTEGER DEFAULT 60,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedDate" TIMESTAMP(3) NOT NULL,
    "deletedDate" TIMESTAMP(3),
    "eventPurposeType" "EventPurposeType" NOT NULL DEFAULT 'APPOINTMENT',
    "idRecurrenceRuleFk" TEXT,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventParticipants" (
    "id" TEXT NOT NULL,
    "idEventFk" TEXT NOT NULL,
    "idClientWorkspaceFk" TEXT,
    "idClientFk" TEXT,
    "eventStatusType" "EventStatusType" NOT NULL DEFAULT 'PENDING',
    "createdDate" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedDate" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedDate" TIMESTAMP(3),

    CONSTRAINT "eventParticipants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificationPlans" (
    "id" TEXT NOT NULL,
    "idEventFk" TEXT NOT NULL,
    "idWorkspaceFk" TEXT NOT NULL,
    "idCompanyFk" TEXT NOT NULL,
    "actionSectionType" "ActionSectionType" NOT NULL,
    "eventStartDate" TIMESTAMPTZ(6) NOT NULL,
    "status" "PlanStatus" NOT NULL DEFAULT 'planned',
    "dedupeKey" TEXT NOT NULL,
    "createdDate" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedDate" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notificationPlans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurrenceRules" (
    "id" TEXT NOT NULL,
    "idWorkspaceFk" TEXT NOT NULL,
    "dtstart" TIMESTAMPTZ(6) NOT NULL,
    "until" TIMESTAMPTZ(6),
    "rrule" VARCHAR(512) NOT NULL,
    "tzid" VARCHAR(100) NOT NULL,
    "rdates" JSON,
    "recurrenceStatusType" "RecurrenceStatusType" NOT NULL DEFAULT 'ACTIVE',
    "idUserFk" TEXT,
    "createdDate" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedDate" TIMESTAMPTZ(3) NOT NULL,
    "deletedDate" TIMESTAMP(3),

    CONSTRAINT "recurrenceRules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "externalCalendarEvents" (
    "id" TEXT NOT NULL,
    "idEventFk" TEXT NOT NULL,
    "googleEventId" VARCHAR(512),
    "microsoftEventId" VARCHAR(512),
    "createdDate" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedDate" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "externalCalendarEvents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "businessHours" (
    "id" TEXT NOT NULL,
    "idCompanyFk" TEXT NOT NULL,
    "idWorkspaceFk" TEXT NOT NULL DEFAULT '',
    "weekDayType" "WeekDayType" NOT NULL,
    "startTime" VARCHAR(5),
    "endTime" VARCHAR(5),
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedDate" TIMESTAMP(3) NOT NULL,
    "deletedDate" TIMESTAMP(3),

    CONSTRAINT "businessHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workerBusinessHours" (
    "id" TEXT NOT NULL,
    "idUserFk" TEXT NOT NULL,
    "idCompanyFk" TEXT NOT NULL,
    "idWorkspaceFk" TEXT NOT NULL DEFAULT '',
    "weekDayType" "WeekDayType" NOT NULL,
    "startTime" VARCHAR(5),
    "endTime" VARCHAR(5),
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedDate" TIMESTAMP(3) NOT NULL,
    "deletedDate" TIMESTAMP(3),

    CONSTRAINT "workerBusinessHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "temporaryBusinessHours" (
    "id" TEXT NOT NULL,
    "idCompanyFk" TEXT NOT NULL,
    "idWorkspaceFk" TEXT NOT NULL DEFAULT '',
    "idUserFk" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" VARCHAR(5),
    "endTime" VARCHAR(5),
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "createdDate" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedDate" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedDate" TIMESTAMP(3),

    CONSTRAINT "temporaryBusinessHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workerAbsences" (
    "id" TEXT NOT NULL,
    "idUserFk" TEXT,
    "idCompanyFk" TEXT NOT NULL,
    "idWorkspaceFk" TEXT NOT NULL DEFAULT '',
    "description" VARCHAR(256),
    "createdDate" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedDate" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedDate" TIMESTAMP(3),
    "idEventFk" TEXT NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "eventPurposeType" "EventPurposeType" NOT NULL DEFAULT 'SICK_LEAVE',
    "startDate" TIMESTAMP(3) NOT NULL,
    "title" VARCHAR(100),

    CONSTRAINT "workerAbsences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_events_user_start_end" ON "events"("idUserPlatformFk", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "idx_events_user_end" ON "events"("idUserPlatformFk", "endDate");

-- CreateIndex
CREATE INDEX "idx_events_start_brin" ON "events" USING BRIN ("startDate");

-- CreateIndex
CREATE INDEX "events_idServiceFk_idx" ON "events"("idServiceFk");

-- CreateIndex
CREATE INDEX "events_idUserPlatformFk_idx" ON "events"("idUserPlatformFk");

-- CreateIndex
CREATE INDEX "events_idWorkspaceFk_idx" ON "events"("idWorkspaceFk");

-- CreateIndex
CREATE INDEX "eventParticipants_idEventFk_idx" ON "eventParticipants"("idEventFk");

-- CreateIndex
CREATE INDEX "eventParticipants_idClientWorkspaceFk_idx" ON "eventParticipants"("idClientWorkspaceFk");

-- CreateIndex
CREATE INDEX "eventParticipants_idClientFk_idx" ON "eventParticipants"("idClientFk");

-- CreateIndex
CREATE INDEX "eventParticipants_idEventFk_eventStatusType_idx" ON "eventParticipants"("idEventFk", "eventStatusType");

-- CreateIndex
CREATE UNIQUE INDEX "notificationPlans_dedupeKey_key" ON "notificationPlans"("dedupeKey");

-- CreateIndex
CREATE INDEX "notificationPlans_status_eventStartDate_idx" ON "notificationPlans"("status", "eventStartDate");

-- CreateIndex
CREATE INDEX "notificationPlans_idEventFk_idx" ON "notificationPlans"("idEventFk");

-- CreateIndex
CREATE INDEX "recurrenceRules_idWorkspaceFk_idx" ON "recurrenceRules"("idWorkspaceFk");

-- CreateIndex
CREATE UNIQUE INDEX "externalCalendarEvents_idEventFk_key" ON "externalCalendarEvents"("idEventFk");

-- CreateIndex
CREATE INDEX "externalCalendarEvents_idEventFk_idx" ON "externalCalendarEvents"("idEventFk");

-- CreateIndex
CREATE INDEX "businessHours_idCompanyFk_idx" ON "businessHours"("idCompanyFk");

-- CreateIndex
CREATE INDEX "businessHours_idWorkspaceFk_idx" ON "businessHours"("idWorkspaceFk");

-- CreateIndex
CREATE INDEX "workerBusinessHours_idWorkspaceFk_idx" ON "workerBusinessHours"("idWorkspaceFk");

-- CreateIndex
CREATE INDEX "workerBusinessHours_idUserFk_idWorkspaceFk_idx" ON "workerBusinessHours"("idUserFk", "idWorkspaceFk");

-- CreateIndex
CREATE INDEX "temporaryBusinessHours_idWorkspaceFk_idx" ON "temporaryBusinessHours"("idWorkspaceFk");

-- CreateIndex
CREATE INDEX "temporaryBusinessHours_idUserFk_idWorkspaceFk_idx" ON "temporaryBusinessHours"("idUserFk", "idWorkspaceFk");

-- CreateIndex
CREATE INDEX "workerAbsences_idWorkspaceFk_idx" ON "workerAbsences"("idWorkspaceFk");

-- CreateIndex
CREATE INDEX "workerAbsences_idUserFk_idWorkspaceFk_idx" ON "workerAbsences"("idUserFk", "idWorkspaceFk");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_idRecurrenceRuleFk_fkey" FOREIGN KEY ("idRecurrenceRuleFk") REFERENCES "recurrenceRules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventParticipants" ADD CONSTRAINT "eventParticipants_idEventFk_fkey" FOREIGN KEY ("idEventFk") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificationPlans" ADD CONSTRAINT "notificationPlans_idEventFk_fkey" FOREIGN KEY ("idEventFk") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "externalCalendarEvents" ADD CONSTRAINT "externalCalendarEvents_idEventFk_fkey" FOREIGN KEY ("idEventFk") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workerAbsences" ADD CONSTRAINT "workerAbsences_idEventFk_fkey" FOREIGN KEY ("idEventFk") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
