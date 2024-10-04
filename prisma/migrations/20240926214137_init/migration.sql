-- CreateEnum
CREATE TYPE "EventSourceType" AS ENUM ('PLATFORM', 'BOT', 'GOOGLE');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('APPOINTMENT', 'VACATION', 'HOLIDAY', 'LEAVE', 'OTHER');

-- CreateEnum
CREATE TYPE "EventStatusType" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WeekDayType" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailGoogle" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT DEFAULT '',
    "image" TEXT,
    "companyRoleJson" JSONB DEFAULT '[]',
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedDate" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendars" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Main Calendar',
    "idGoogleCalendar" TEXT,
    "idCompanyFk" TEXT NOT NULL,
    "ownerEmailGoogle" TEXT,
    "channelConfig" JSONB DEFAULT '{}',
    "syncToken" TEXT DEFAULT '',
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedDate" TIMESTAMP(3) NOT NULL,
    "deletedDate" TIMESTAMP(3),

    CONSTRAINT "calendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "userCalendars" (
    "id" SERIAL NOT NULL,
    "idUserFk" TEXT NOT NULL,
    "emailGoogle" TEXT,
    "idCalendarFk" INTEGER NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedDate" TIMESTAMP(3) NOT NULL,
    "deletedDate" TIMESTAMP(3),

    CONSTRAINT "userCalendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "userColors" (
    "id" SERIAL NOT NULL,
    "idUserFk" TEXT NOT NULL,
    "idEventColorGoogleFk" INTEGER,
    "colorHex" TEXT,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedDate" TIMESTAMP(3) NOT NULL,
    "deletedDate" TIMESTAMP(3),

    CONSTRAINT "userColors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "businessHours" (
    "id" SERIAL NOT NULL,
    "idCompanyFk" TEXT NOT NULL,
    "weekDayType" "WeekDayType" NOT NULL,
    "startTime" TIME,
    "endTime" TIME,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedDate" TIMESTAMP(3) NOT NULL,
    "deletedDate" TIMESTAMP(3),

    CONSTRAINT "businessHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workerBusinessHours" (
    "id" SERIAL NOT NULL,
    "idUserFk" TEXT NOT NULL,
    "idCompanyFk" TEXT NOT NULL,
    "weekDayType" "WeekDayType" NOT NULL,
    "startTime" TIME,
    "endTime" TIME,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedDate" TIMESTAMP(3) NOT NULL,
    "deletedDate" TIMESTAMP(3),

    CONSTRAINT "workerBusinessHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "temporaryBusinessHours" (
    "id" SERIAL NOT NULL,
    "idCompanyFk" TEXT NOT NULL,
    "idUserFk" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TIME,
    "endTime" TIME,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "createdDate" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedDate" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedDate" TIMESTAMP(3),

    CONSTRAINT "temporaryBusinessHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventColorGoogle" (
    "id" SERIAL NOT NULL,
    "idColorGoogle" TEXT NOT NULL,
    "colorHex" TEXT NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedDate" TIMESTAMP(3) NOT NULL,
    "deletedDate" TIMESTAMP(3),

    CONSTRAINT "eventColorGoogle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "idServiceFk" INTEGER,
    "idUserBotFk" INTEGER,
    "idUserPlatformFk" TEXT,
    "idGoogleEvent" TEXT,
    "eventSourceType" "EventSourceType" NOT NULL DEFAULT 'PLATFORM',
    "idCalendarFk" INTEGER NOT NULL,
    "eventType" "EventType" NOT NULL DEFAULT 'APPOINTMENT',
    "eventStatus" "EventStatusType" NOT NULL DEFAULT 'PENDING',
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedDate" TIMESTAMP(3) NOT NULL,
    "deletedDate" TIMESTAMP(3),

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" SERIAL NOT NULL,
    "idCompanyFk" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(512) NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 60,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "idCategoryFk" INTEGER,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedDate" TIMESTAMP(3) NOT NULL,
    "deletedDate" TIMESTAMP(3),

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" SERIAL NOT NULL,
    "idCompanyFk" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(512),
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedDate" TIMESTAMP(3) NOT NULL,
    "deletedDate" TIMESTAMP(3),

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "userServices" (
    "id" SERIAL NOT NULL,
    "idUserFk" TEXT NOT NULL,
    "idServiceFk" INTEGER NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedDate" TIMESTAMP(3) NOT NULL,
    "deletedDate" TIMESTAMP(3),

    CONSTRAINT "userServices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "calendars_idCompanyFk_idx" ON "calendars"("idCompanyFk");

-- CreateIndex
CREATE UNIQUE INDEX "userCalendars_idUserFk_idCalendarFk_key" ON "userCalendars"("idUserFk", "idCalendarFk");

-- CreateIndex
CREATE UNIQUE INDEX "userColors_idUserFk_key" ON "userColors"("idUserFk");

-- CreateIndex
CREATE INDEX "businessHours_idCompanyFk_idx" ON "businessHours"("idCompanyFk");

-- CreateIndex
CREATE INDEX "workerBusinessHours_idCompanyFk_idx" ON "workerBusinessHours"("idCompanyFk");

-- CreateIndex
CREATE INDEX "temporaryBusinessHours_idCompanyFk_idx" ON "temporaryBusinessHours"("idCompanyFk");

-- CreateIndex
CREATE UNIQUE INDEX "eventColorGoogle_idColorGoogle_key" ON "eventColorGoogle"("idColorGoogle");

-- CreateIndex
CREATE INDEX "events_idUserBotFk_idx" ON "events"("idUserBotFk");

-- CreateIndex
CREATE INDEX "events_idUserPlatformFk_idx" ON "events"("idUserPlatformFk");

-- CreateIndex
CREATE INDEX "services_idCategoryFk_idx" ON "services"("idCategoryFk");

-- CreateIndex
CREATE INDEX "categories_idCompanyFk_idx" ON "categories"("idCompanyFk");

-- CreateIndex
CREATE INDEX "userServices_idUserFk_idx" ON "userServices"("idUserFk");

-- CreateIndex
CREATE INDEX "userServices_idServiceFk_idx" ON "userServices"("idServiceFk");

-- AddForeignKey
ALTER TABLE "userCalendars" ADD CONSTRAINT "userCalendars_idUserFk_fkey" FOREIGN KEY ("idUserFk") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "userCalendars" ADD CONSTRAINT "userCalendars_idCalendarFk_fkey" FOREIGN KEY ("idCalendarFk") REFERENCES "calendars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "userColors" ADD CONSTRAINT "userColors_idUserFk_fkey" FOREIGN KEY ("idUserFk") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "userColors" ADD CONSTRAINT "userColors_idEventColorGoogleFk_fkey" FOREIGN KEY ("idEventColorGoogleFk") REFERENCES "eventColorGoogle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workerBusinessHours" ADD CONSTRAINT "workerBusinessHours_idUserFk_fkey" FOREIGN KEY ("idUserFk") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "temporaryBusinessHours" ADD CONSTRAINT "temporaryBusinessHours_idUserFk_fkey" FOREIGN KEY ("idUserFk") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_idCalendarFk_fkey" FOREIGN KEY ("idCalendarFk") REFERENCES "calendars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_idServiceFk_fkey" FOREIGN KEY ("idServiceFk") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_idCategoryFk_fkey" FOREIGN KEY ("idCategoryFk") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "userServices" ADD CONSTRAINT "userServices_idUserFk_fkey" FOREIGN KEY ("idUserFk") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "userServices" ADD CONSTRAINT "userServices_idServiceFk_fkey" FOREIGN KEY ("idServiceFk") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
