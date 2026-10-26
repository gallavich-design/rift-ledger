-- AlterTable
ALTER TABLE "SealedProduct" ADD COLUMN "manualPriceAt" DATETIME;

UPDATE "SealedProduct" SET "manualPriceAt" = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE "manualPrice" IS NOT NULL;
