-- AlterTable
ALTER TABLE "events" ADD COLUMN     "serviceDiscountSnapshot" DOUBLE PRECISION,
ADD COLUMN     "serviceNameSnapshot" VARCHAR(100),
ADD COLUMN     "servicePriceSnapshot" DOUBLE PRECISION;
