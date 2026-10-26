-- AlterTable
ALTER TABLE "Alert" ADD COLUMN "dedupeKey" TEXT;

-- AlterTable
ALTER TABLE "RulingEvent" ADD COLUMN "setCode" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MetaDeck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "placement" TEXT,
    "playedOn" DATETIME,
    "format" TEXT NOT NULL DEFAULT 'STANDARD',
    "archetype" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'PASTE',
    "sourceUrl" TEXT,
    "pendingImportLines" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MetaDeck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_MetaDeck" ("archetype", "createdAt", "event", "format", "id", "placement", "playedOn", "source", "sourceUrl", "userId") SELECT "archetype", "createdAt", "event", "format", "id", "placement", "playedOn", "source", "sourceUrl", "userId" FROM "MetaDeck";
DROP TABLE "MetaDeck";
ALTER TABLE "new_MetaDeck" RENAME TO "MetaDeck";
CREATE TABLE "new_WatchItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "targetPrice" INTEGER,
    "targetDir" TEXT,
    "movePct" INTEGER,
    "currency" TEXT,
    "preorderPrice" INTEGER,
    "lastSide" TEXT,
    "lastMoveAlertDay" TEXT,
    "deckId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WatchItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WatchItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "CardVariant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WatchItem_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_WatchItem" ("createdAt", "currency", "id", "movePct", "preorderPrice", "targetDir", "targetPrice", "userId", "variantId") SELECT "createdAt", "currency", "id", "movePct", "preorderPrice", "targetDir", "targetPrice", "userId", "variantId" FROM "WatchItem";
DROP TABLE "WatchItem";
ALTER TABLE "new_WatchItem" RENAME TO "WatchItem";
CREATE UNIQUE INDEX "WatchItem_userId_variantId_key" ON "WatchItem"("userId", "variantId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Alert_userId_dedupeKey_key" ON "Alert"("userId", "dedupeKey");

