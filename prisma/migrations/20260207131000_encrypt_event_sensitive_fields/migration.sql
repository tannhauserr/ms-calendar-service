-- AlterTable
ALTER TABLE "events"
ADD COLUMN "descriptionHash" TEXT;

-- AlterTable
ALTER TABLE "groupEvents"
ADD COLUMN "commentClientHash" TEXT,
ADD COLUMN "descriptionHash" TEXT,
ADD COLUMN "encryptionKeyVersion" INTEGER NOT NULL DEFAULT 1;

-- Indexes by tenant + hash lookup
CREATE INDEX IF NOT EXISTS "events_idCompanyFk_idx" ON "events"("idCompanyFk");
CREATE INDEX IF NOT EXISTS "events_idCompanyFk_descriptionHash_idx" ON "events"("idCompanyFk", "descriptionHash");

CREATE INDEX IF NOT EXISTS "groupEvents_idCompanyFk_idx" ON "groupEvents"("idCompanyFk");
CREATE INDEX IF NOT EXISTS "groupEvents_idCompanyFk_commentClientHash_idx" ON "groupEvents"("idCompanyFk", "commentClientHash");
CREATE INDEX IF NOT EXISTS "groupEvents_idCompanyFk_descriptionHash_idx" ON "groupEvents"("idCompanyFk", "descriptionHash");
