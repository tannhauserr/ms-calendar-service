-- CreateEnum
CREATE TYPE "EventSourceType" AS ENUM ('PLATFORM', 'BOT', 'GOOGLE');

-- CreateEnum
CREATE TYPE "EventStatusType" AS ENUM ('PENDING', 'ACCEPTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'CANCELLED_BY_CLIENT', 'CANCELLED_BY_CLIENT_REMOVED', 'PAID');

-- CreateEnum
CREATE TYPE "ModerationStatusType" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EventPurposeType" AS ENUM ('APPOINTMENT', 'VACATION', 'SICK_LEAVE', 'PERSONAL_DAY', 'UNPAID_LEAVE', 'OTHER');

-- CreateEnum
CREATE TYPE "WeekDayType" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateTable
CREATE TABLE "calendars" (
    "id" TEXT NOT NULL,
    "idCompanyFk" TEXT NOT NULL,
    "idWorkspaceFk" TEXT NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedDate" TIMESTAMP(3) NOT NULL,
    "deletedDate" TIMESTAMP(3),

    CONSTRAINT "calendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "description" VARCHAR(512),
    "startDate" TIMESTAMPTZ(6) NOT NULL,
    "endDate" TIMESTAMPTZ(6) NOT NULL,
    "idCalendarFk" TEXT NOT NULL,
    "idServiceFk" TEXT,
    "idUserPlatformFk" TEXT,
    "commentClient" VARCHAR(300),
    "idGoogleEvent" TEXT,
    "eventSourceType" "EventSourceType" NOT NULL DEFAULT 'PLATFORM',
    "isEditableByClient" BOOLEAN NOT NULL DEFAULT true,
    "numberUpdates" INTEGER DEFAULT 0,
    "eventStatusType" "EventStatusType" NOT NULL DEFAULT 'PENDING',
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedDate" TIMESTAMP(3) NOT NULL,
    "deletedDate" TIMESTAMP(3),
    "eventPurposeType" "EventPurposeType" NOT NULL DEFAULT 'APPOINTMENT',

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventParticipants" (
    "id" SERIAL NOT NULL,
    "idEventFk" TEXT NOT NULL,
    "idClientWorkspaceFk" TEXT,
    "idClientFk" TEXT,
    "createdDate" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedDate" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedDate" TIMESTAMP(3),

    CONSTRAINT "eventParticipants_pkey" PRIMARY KEY ("id")
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
    "idWorkspaceFk" TEXT NOT NULL,
    "weekDayType" "WeekDayType" NOT NULL,
    "startTime" TIME(6),
    "endTime" TIME(6),
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
    "weekDayType" "WeekDayType" NOT NULL,
    "startTime" TIME(6),
    "endTime" TIME(6),
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
    "idUserFk" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TIME(6),
    "endTime" TIME(6),
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
    "idWorkspaceFk" TEXT,
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

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "idCompanyFk" TEXT NOT NULL,
    "idWorkspaceFk" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(512),
    "color" VARCHAR(10) NOT NULL DEFAULT '#4d5fd6',
    "position" INTEGER DEFAULT 0,
    "moderationStatusType" "ModerationStatusType" NOT NULL DEFAULT 'PENDING',
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedDate" TIMESTAMP(3),

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "idCompanyFk" TEXT NOT NULL,
    "idWorkspaceFk" TEXT NOT NULL,
    "image" VARCHAR(512),
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(512) NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 60,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "color" VARCHAR(10) NOT NULL DEFAULT '#4d5fd6',
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "maxParticipants" INTEGER DEFAULT 1,
    "moderationStatusType" "ModerationStatusType" NOT NULL DEFAULT 'PENDING',
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedDate" TIMESTAMP(3) NOT NULL,
    "deletedDate" TIMESTAMP(3),

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categoryServiceAssignments" (
    "id" TEXT NOT NULL,
    "idCategoryFk" TEXT NOT NULL,
    "idServiceFk" TEXT NOT NULL,
    "position" INTEGER DEFAULT 0,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedDate" TIMESTAMP(3) NOT NULL,
    "deletedDate" TIMESTAMP(3),

    CONSTRAINT "categoryServiceAssignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "userServices" (
    "id" TEXT NOT NULL,
    "idCompanyFk" TEXT NOT NULL,
    "idUserFk" TEXT NOT NULL,
    "idServiceFk" TEXT NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedDate" TIMESTAMP(3) NOT NULL,
    "deletedDate" TIMESTAMP(3),

    CONSTRAINT "userServices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calendars_idCompanyFk_idx" ON "calendars"("idCompanyFk");

-- CreateIndex
CREATE INDEX "calendars_idWorkspaceFk_idx" ON "calendars"("idWorkspaceFk");

-- CreateIndex
CREATE UNIQUE INDEX "calendars_idCompanyFk_idWorkspaceFk_key" ON "calendars"("idCompanyFk", "idWorkspaceFk");

-- CreateIndex
CREATE INDEX "events_idCalendarFk_idx" ON "events"("idCalendarFk");

-- CreateIndex
CREATE INDEX "events_idUserPlatformFk_idx" ON "events"("idUserPlatformFk");

-- CreateIndex
CREATE INDEX "eventParticipants_idEventFk_idx" ON "eventParticipants"("idEventFk");

-- CreateIndex
CREATE UNIQUE INDEX "externalCalendarEvents_idEventFk_key" ON "externalCalendarEvents"("idEventFk");

-- CreateIndex
CREATE INDEX "externalCalendarEvents_idEventFk_idx" ON "externalCalendarEvents"("idEventFk");

-- CreateIndex
CREATE INDEX "businessHours_idCompanyFk_idx" ON "businessHours"("idCompanyFk");

-- CreateIndex
CREATE INDEX "workerBusinessHours_idCompanyFk_idx" ON "workerBusinessHours"("idCompanyFk");

-- CreateIndex
CREATE INDEX "temporaryBusinessHours_idCompanyFk_idx" ON "temporaryBusinessHours"("idCompanyFk");

-- CreateIndex
CREATE INDEX "workerAbsences_idCompanyFk_idx" ON "workerAbsences"("idCompanyFk");

-- CreateIndex
CREATE INDEX "categories_idWorkspaceFk_idx" ON "categories"("idWorkspaceFk");

-- CreateIndex
CREATE UNIQUE INDEX "categories_idWorkspaceFk_name_key" ON "categories"("idWorkspaceFk", "name");

-- CreateIndex
CREATE INDEX "services_idWorkspaceFk_idx" ON "services"("idWorkspaceFk");

-- CreateIndex
CREATE UNIQUE INDEX "services_idWorkspaceFk_name_key" ON "services"("idWorkspaceFk", "name");

-- CreateIndex
CREATE INDEX "categoryServiceAssignments_idServiceFk_idx" ON "categoryServiceAssignments"("idServiceFk");

-- CreateIndex
CREATE UNIQUE INDEX "categoryServiceAssignments_idCategoryFk_idServiceFk_key" ON "categoryServiceAssignments"("idCategoryFk", "idServiceFk");

-- CreateIndex
CREATE INDEX "userServices_idCompanyFk_idx" ON "userServices"("idCompanyFk");

-- CreateIndex
CREATE INDEX "userServices_idUserFk_idx" ON "userServices"("idUserFk");

-- CreateIndex
CREATE INDEX "userServices_idServiceFk_idx" ON "userServices"("idServiceFk");

-- CreateIndex
CREATE UNIQUE INDEX "userServices_idCompanyFk_idUserFk_idServiceFk_key" ON "userServices"("idCompanyFk", "idUserFk", "idServiceFk");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_idCalendarFk_fkey" FOREIGN KEY ("idCalendarFk") REFERENCES "calendars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_idServiceFk_fkey" FOREIGN KEY ("idServiceFk") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventParticipants" ADD CONSTRAINT "eventParticipants_idEventFk_fkey" FOREIGN KEY ("idEventFk") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "externalCalendarEvents" ADD CONSTRAINT "externalCalendarEvents_idEventFk_fkey" FOREIGN KEY ("idEventFk") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workerAbsences" ADD CONSTRAINT "workerAbsences_idEventFk_fkey" FOREIGN KEY ("idEventFk") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categoryServiceAssignments" ADD CONSTRAINT "categoryServiceAssignments_idCategoryFk_fkey" FOREIGN KEY ("idCategoryFk") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categoryServiceAssignments" ADD CONSTRAINT "categoryServiceAssignments_idServiceFk_fkey" FOREIGN KEY ("idServiceFk") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "userServices" ADD CONSTRAINT "userServices_idServiceFk_fkey" FOREIGN KEY ("idServiceFk") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
