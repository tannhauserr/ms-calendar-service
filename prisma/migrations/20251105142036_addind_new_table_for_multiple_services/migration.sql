-- CreateEnum
CREATE TYPE "EventLineItemType" AS ENUM ('SERVICE', 'ADDON');

-- CreateTable
CREATE TABLE "eventLineItems" (
    "id" TEXT NOT NULL,
    "idEventFk" TEXT NOT NULL,
    "idServiceFk" TEXT,
    "idAddonFk" TEXT,
    "idParentLineItemFk" TEXT,
    "lineItemType" "EventLineItemType" NOT NULL DEFAULT 'SERVICE',
    "itemNameSnapshot" VARCHAR(100),
    "itemPriceSnapshot" DOUBLE PRECISION,
    "itemDiscountSnapshot" DOUBLE PRECISION,
    "itemDurationSnapshot" INTEGER DEFAULT 60,
    "idUserFk" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "eventLineItems_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "eventLineItems_idEventFk_idx" ON "eventLineItems"("idEventFk");

-- CreateIndex
CREATE INDEX "eventLineItems_idParentLineItemFk_idx" ON "eventLineItems"("idParentLineItemFk");

-- AddForeignKey
ALTER TABLE "eventLineItems" ADD CONSTRAINT "eventLineItems_idEventFk_fkey" FOREIGN KEY ("idEventFk") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
