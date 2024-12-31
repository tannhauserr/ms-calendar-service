-- CreateEnum
CREATE TYPE "EventSourceType" AS ENUM ('PLATFORM', 'BOT', 'GOOGLE');

-- CreateEnum
CREATE TYPE "EventStatusType" AS ENUM ('PENDING', 'ACEPTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'PAID');

-- CreateEnum
CREATE TYPE "eventPurposeType" AS ENUM ('APPOINTMENT', 'VACATION', 'SICK_LEAVE', 'PERSONAL_DAY', 'UNPAID_LEAVE', 'OTHER');

-- CreateEnum
CREATE TYPE "WeekDayType" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateTable
CREATE TABLE "userColors" (
    "id" SERIAL NOT NULL,
    "idUserFk" TEXT NOT NULL,
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
    "idEstablishmentFk" TEXT NOT NULL,
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
CREATE TABLE "workerAbsences" (
    "id" SERIAL NOT NULL,
    "idUserFk" TEXT,
    "idCompanyFk" TEXT NOT NULL,
    "idEstablishmentFk" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "createdDate" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedDate" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedDate" TIMESTAMP(3),

    CONSTRAINT "workerAbsences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendars" (
    "id" TEXT NOT NULL,
    "idCompanyFk" TEXT NOT NULL,
    "idEstablishmentFk" TEXT NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedDate" TIMESTAMP(3) NOT NULL,
    "deletedDate" TIMESTAMP(3),

    CONSTRAINT "calendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "idCalendarFk" TEXT NOT NULL,
    "idServiceFk" INTEGER,
    "idUserPlatformFk" TEXT,
    "commentClient" VARCHAR(300),
    "idGoogleEvent" TEXT,
    "eventPurposeType" "eventPurposeType" NOT NULL DEFAULT 'APPOINTMENT',
    "eventSourceType" "EventSourceType" NOT NULL DEFAULT 'PLATFORM',
    "isEditableByClient" BOOLEAN NOT NULL DEFAULT true,
    "numberUpdates" INTEGER DEFAULT 0,
    "eventStatusType" "EventStatusType" NOT NULL DEFAULT 'PENDING',
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedDate" TIMESTAMP(3) NOT NULL,
    "deletedDate" TIMESTAMP(3),

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventParticipants" (
    "id" SERIAL NOT NULL,
    "idEventFk" INTEGER NOT NULL,
    "idClientFk" TEXT NOT NULL,
    "eventStatusType" "EventStatusType" NOT NULL DEFAULT 'PENDING',
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedDate" TIMESTAMP(3),

    CONSTRAINT "eventParticipants_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "userServices" (
    "id" SERIAL NOT NULL,
    "idCompanyFk" TEXT NOT NULL,
    "idUserFk" TEXT NOT NULL,
    "idServiceFk" INTEGER NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedDate" TIMESTAMP(3) NOT NULL,
    "deletedDate" TIMESTAMP(3),

    CONSTRAINT "userServices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" SERIAL NOT NULL,
    "idCompanyFk" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(512),
    "color" VARCHAR(10) NOT NULL DEFAULT '#4d5fd6',
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedDate" TIMESTAMP(3) NOT NULL,
    "deletedDate" TIMESTAMP(3),

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categoryEstablishments" (
    "id" SERIAL NOT NULL,
    "idCategoryFk" INTEGER NOT NULL,
    "idEstablishmentFk" TEXT NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedDate" TIMESTAMP(3),

    CONSTRAINT "categoryEstablishments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "userColors_idUserFk_key" ON "userColors"("idUserFk");

-- CreateIndex
CREATE INDEX "businessHours_idCompanyFk_idx" ON "businessHours"("idCompanyFk");

-- CreateIndex
CREATE INDEX "workerBusinessHours_idCompanyFk_idx" ON "workerBusinessHours"("idCompanyFk");

-- CreateIndex
CREATE INDEX "temporaryBusinessHours_idCompanyFk_idx" ON "temporaryBusinessHours"("idCompanyFk");

-- CreateIndex
CREATE INDEX "workerAbsences_idCompanyFk_idx" ON "workerAbsences"("idCompanyFk");

-- CreateIndex
CREATE INDEX "calendars_idCompanyFk_idx" ON "calendars"("idCompanyFk");

-- CreateIndex
CREATE INDEX "calendars_idEstablishmentFk_idx" ON "calendars"("idEstablishmentFk");

-- CreateIndex
CREATE UNIQUE INDEX "calendars_idCompanyFk_idEstablishmentFk_key" ON "calendars"("idCompanyFk", "idEstablishmentFk");

-- CreateIndex
CREATE INDEX "events_idCalendarFk_idx" ON "events"("idCalendarFk");

-- CreateIndex
CREATE INDEX "events_idUserPlatformFk_idx" ON "events"("idUserPlatformFk");

-- CreateIndex
CREATE INDEX "eventParticipants_idEventFk_idx" ON "eventParticipants"("idEventFk");

-- CreateIndex
CREATE INDEX "eventParticipants_idClientFk_idx" ON "eventParticipants"("idClientFk");

-- CreateIndex
CREATE UNIQUE INDEX "eventParticipants_idEventFk_idClientFk_key" ON "eventParticipants"("idEventFk", "idClientFk");

-- CreateIndex
CREATE INDEX "services_idCategoryFk_idx" ON "services"("idCategoryFk");

-- CreateIndex
CREATE INDEX "userServices_idCompanyFk_idx" ON "userServices"("idCompanyFk");

-- CreateIndex
CREATE INDEX "userServices_idUserFk_idx" ON "userServices"("idUserFk");

-- CreateIndex
CREATE INDEX "userServices_idServiceFk_idx" ON "userServices"("idServiceFk");

-- CreateIndex
CREATE UNIQUE INDEX "userServices_idCompanyFk_idUserFk_idServiceFk_key" ON "userServices"("idCompanyFk", "idUserFk", "idServiceFk");

-- CreateIndex
CREATE INDEX "categories_idCompanyFk_idx" ON "categories"("idCompanyFk");

-- CreateIndex
CREATE INDEX "categoryEstablishments_idEstablishmentFk_idx" ON "categoryEstablishments"("idEstablishmentFk");

-- CreateIndex
CREATE UNIQUE INDEX "categoryEstablishments_idCategoryFk_idEstablishmentFk_key" ON "categoryEstablishments"("idCategoryFk", "idEstablishmentFk");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_idServiceFk_fkey" FOREIGN KEY ("idServiceFk") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_idCalendarFk_fkey" FOREIGN KEY ("idCalendarFk") REFERENCES "calendars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventParticipants" ADD CONSTRAINT "eventParticipants_idEventFk_fkey" FOREIGN KEY ("idEventFk") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_idCategoryFk_fkey" FOREIGN KEY ("idCategoryFk") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "userServices" ADD CONSTRAINT "userServices_idServiceFk_fkey" FOREIGN KEY ("idServiceFk") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categoryEstablishments" ADD CONSTRAINT "categoryEstablishments_idCategoryFk_fkey" FOREIGN KEY ("idCategoryFk") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
