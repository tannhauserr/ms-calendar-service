-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('AT_BUSINESS', 'VIRTUAL', 'AT_CLIENT');

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "serviceType" "ServiceType" DEFAULT 'AT_BUSINESS';
