/*
  Phase 2. Both required columns below are backfilled in the INSERT … SELECT statements.
  Original warnings:

  - Added the required column `variantKey` to the `CardVariant` table without a default value. This is not possible if the table is not empty.
  - Added the required column `landedTotal` to the `Lot` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "TcgProduct" (
    "productId" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "groupName" TEXT,
    "name" TEXT NOT NULL,
    "finishes" TEXT NOT NULL DEFAULT '',
    "isSingle" BOOLEAN NOT NULL DEFAULT true,
    "number" TEXT,
    "rarity" TEXT,
    "imageUrl" TEXT,
    "url" TEXT,
    "releasedOn" DATETIME,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CardVariant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cardId" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "sourceId" TEXT,
    "variantKey" TEXT NOT NULL,
    "riftboundId" TEXT,
    "tcgplayerId" TEXT,
    "collectorNumber" INTEGER,
    "printName" TEXT NOT NULL,
    "rarity" TEXT,
    "finish" TEXT NOT NULL DEFAULT 'NORMAL',
    "art" TEXT NOT NULL DEFAULT 'STANDARD',
    "language" TEXT NOT NULL DEFAULT 'EN',
    "gradingCompany" TEXT,
    "grade" TEXT,
    "imageUrl" TEXT,
    "artist" TEXT,
    "isUserCreated" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CardVariant_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CardVariant_setId_fkey" FOREIGN KEY ("setId") REFERENCES "Set" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
-- Backfill: variantKey = sourceId|finish|language|gradingCompany|grade (user-created rows without a sourceId key on their id)
INSERT INTO "new_CardVariant" ("art", "artist", "cardId", "collectorNumber", "finish", "grade", "gradingCompany", "id", "imageUrl", "isUserCreated", "language", "printName", "rarity", "riftboundId", "setId", "sourceId", "tcgplayerId", "updatedAt", "variantKey") SELECT "art", "artist", "cardId", "collectorNumber", "finish", "grade", "gradingCompany", "id", "imageUrl", "isUserCreated", "language", "printName", "rarity", "riftboundId", "setId", "sourceId", "tcgplayerId", "updatedAt",
  COALESCE("sourceId", 'user:' || "id") || '|' || "finish" || '|' || "language" || '|' || COALESCE("gradingCompany", '') || '|' || COALESCE("grade", '')
  FROM "CardVariant";
DROP TABLE "CardVariant";
ALTER TABLE "new_CardVariant" RENAME TO "CardVariant";
CREATE UNIQUE INDEX "CardVariant_variantKey_key" ON "CardVariant"("variantKey");
CREATE INDEX "CardVariant_cardId_idx" ON "CardVariant"("cardId");
CREATE INDEX "CardVariant_tcgplayerId_idx" ON "CardVariant"("tcgplayerId");
CREATE INDEX "CardVariant_sourceId_idx" ON "CardVariant"("sourceId");
CREATE TABLE "new_Lot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "orderId" TEXT,
    "packOpeningId" TEXT,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "remainingQuantity" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "landedUnitCost" INTEGER NOT NULL,
    "landedTotal" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "condition" TEXT NOT NULL DEFAULT 'NM',
    "acquiredOn" DATETIME NOT NULL,
    "storageLocationId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Lot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Lot_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Lot_packOpeningId_fkey" FOREIGN KEY ("packOpeningId") REFERENCES "PackOpening" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Lot_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "CardVariant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Lot_storageLocationId_fkey" FOREIGN KEY ("storageLocationId") REFERENCES "StorageLocation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
-- Backfill: landedTotal = landedUnitCost × quantity
INSERT INTO "new_Lot" ("acquiredOn", "condition", "createdAt", "currency", "id", "landedUnitCost", "landedTotal", "notes", "orderId", "packOpeningId", "quantity", "remainingQuantity", "storageLocationId", "unitPrice", "userId", "variantId") SELECT "acquiredOn", "condition", "createdAt", "currency", "id", "landedUnitCost", "landedUnitCost" * "quantity", "notes", "orderId", "packOpeningId", "quantity", "remainingQuantity", "storageLocationId", "unitPrice", "userId", "variantId" FROM "Lot";
DROP TABLE "Lot";
ALTER TABLE "new_Lot" RENAME TO "Lot";
CREATE INDEX "Lot_userId_variantId_idx" ON "Lot"("userId", "variantId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "TcgProduct_groupId_idx" ON "TcgProduct"("groupId");
