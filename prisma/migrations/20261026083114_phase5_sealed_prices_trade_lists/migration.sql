-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "tradeShareToken" TEXT;

-- CreateTable
CREATE TABLE "SealedPriceSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tcgplayerId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "market" INTEGER,
    "low" INTEGER,
    "mid" INTEGER,
    "currency" TEXT NOT NULL,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TradeListItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TradeListItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TradeListItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "CardVariant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SealedProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "setId" TEXT,
    "tcgplayerId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "remaining" INTEGER NOT NULL DEFAULT 1,
    "landedUnitCost" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "acquiredOn" DATETIME NOT NULL,
    "notes" TEXT,
    "manualPrice" INTEGER,
    "manualCurrency" TEXT,
    "imageUrl" TEXT,
    "storageLocationId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SealedProduct_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SealedProduct_storageLocationId_fkey" FOREIGN KEY ("storageLocationId") REFERENCES "StorageLocation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_SealedProduct" ("acquiredOn", "createdAt", "currency", "id", "kind", "landedUnitCost", "name", "notes", "quantity", "remaining", "setId", "tcgplayerId", "userId") SELECT "acquiredOn", "createdAt", "currency", "id", "kind", "landedUnitCost", "name", "notes", "quantity", "remaining", "setId", "tcgplayerId", "userId" FROM "SealedProduct";
DROP TABLE "SealedProduct";
ALTER TABLE "new_SealedProduct" RENAME TO "SealedProduct";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "SealedPriceSnapshot_tcgplayerId_source_day_key" ON "SealedPriceSnapshot"("tcgplayerId", "source", "day");

-- CreateIndex
CREATE UNIQUE INDEX "TradeListItem_userId_kind_variantId_key" ON "TradeListItem"("userId", "kind", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "Settings_tradeShareToken_key" ON "Settings"("tradeShareToken");

