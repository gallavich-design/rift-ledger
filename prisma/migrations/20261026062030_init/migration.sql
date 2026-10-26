-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT,
    "name" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "displayCurrency" TEXT NOT NULL DEFAULT 'THB',
    "defaultValuationSource" TEXT NOT NULL DEFAULT 'TCGPLAYER',
    "fxOverrides" TEXT NOT NULL DEFAULT '{}',
    "conditionMultipliers" TEXT NOT NULL DEFAULT '{"NM":100,"LP":85,"MP":70,"HP":50,"DMG":30}',
    CONSTRAINT "Settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Set" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "releaseDate" DATETIME,
    "cardCount" INTEGER NOT NULL DEFAULT 0,
    "tcgplayerId" TEXT,
    "standardLegal" BOOLEAN NOT NULL DEFAULT true,
    "rotatesOn" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'RELEASED',
    "sourceId" TEXT,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Card" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "supertype" TEXT,
    "domains" TEXT NOT NULL DEFAULT '',
    "energy" INTEGER,
    "might" INTEGER,
    "power" INTEGER,
    "rulesText" TEXT NOT NULL DEFAULT '',
    "rulesTextRich" TEXT NOT NULL DEFAULT '',
    "flavourText" TEXT,
    "rarity" TEXT,
    "tags" TEXT NOT NULL DEFAULT '',
    "orientation" TEXT NOT NULL DEFAULT 'portrait',
    "imageUrl" TEXT,
    "searchName" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "collectorNumber" INTEGER,
    "riftboundId" TEXT,
    "tcgplayerId" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Card_setId_fkey" FOREIGN KEY ("setId") REFERENCES "Set" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CardVariant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cardId" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "sourceId" TEXT,
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

-- CreateTable
CREATE TABLE "PriceSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "market" INTEGER,
    "low" INTEGER,
    "mid" INTEGER,
    "currency" TEXT NOT NULL,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PriceSnapshot_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "CardVariant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LocalPriceReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'THB',
    "whereSeen" TEXT NOT NULL,
    "seenOn" DATETIME NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LocalPriceReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LocalPriceReport_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "CardVariant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ManualPrice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "note" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ManualPrice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ManualPrice_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "CardVariant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FxRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "base" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "rateE6" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "StorageLocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'BINDER',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StorageLocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "orderedOn" DATETIME NOT NULL,
    "seller" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "shipping" INTEGER NOT NULL DEFAULT 0,
    "forwardingFee" INTEGER NOT NULL DEFAULT 0,
    "importTax" INTEGER NOT NULL DEFAULT 0,
    "otherFees" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Lot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "orderId" TEXT,
    "packOpeningId" TEXT,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "remainingQuantity" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "landedUnitCost" INTEGER NOT NULL,
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

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "fees" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL,
    "soldOn" DATETIME NOT NULL,
    "buyer" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Sale_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SaleAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "saleId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "costBasis" INTEGER NOT NULL,
    CONSTRAINT "SaleAllocation_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SaleAllocation_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SealedProduct" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SealedProduct_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PackOpening" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sealedProductId" TEXT NOT NULL,
    "openedOn" DATETIME NOT NULL,
    "costBasis" INTEGER NOT NULL,
    "pullsValue" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PackOpening_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PackOpening_sealedProductId_fkey" FOREIGN KEY ("sealedProductId") REFERENCES "SealedProduct" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Deck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'STANDARD',
    "notes" TEXT,
    "shareToken" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Deck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeckCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deckId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "preferredVariantId" TEXT,
    "proxyQuantity" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "DeckCard_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeckCard_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DeckCard_preferredVariantId_fkey" FOREIGN KEY ("preferredVariantId") REFERENCES "CardVariant" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeckVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deckId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" TEXT NOT NULL,
    "diff" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeckVersion_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MatchResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "opponentLegend" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "eventType" TEXT NOT NULL DEFAULT 'CASUAL',
    "playedOn" DATETIME NOT NULL,
    "notes" TEXT,
    CONSTRAINT "MatchResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MatchResult_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MetaDeck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "placement" TEXT,
    "playedOn" DATETIME,
    "format" TEXT NOT NULL DEFAULT 'STANDARD',
    "archetype" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'PASTE',
    "sourceUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MetaDeck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MetaDeckCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "metaDeckId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    CONSTRAINT "MetaDeckCard_metaDeckId_fkey" FOREIGN KEY ("metaDeckId") REFERENCES "MetaDeck" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MetaDeckCard_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RulingEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "effectiveOn" DATETIME NOT NULL,
    "summary" TEXT,
    "oldText" TEXT,
    "newText" TEXT,
    "sourceUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RulingEventCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rulingId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    CONSTRAINT "RulingEventCard_rulingId_fkey" FOREIGN KEY ("rulingId") REFERENCES "RulingEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RulingEventCard_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Alert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WatchItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "targetPrice" INTEGER,
    "targetDir" TEXT,
    "movePct" INTEGER,
    "currency" TEXT,
    "preorderPrice" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WatchItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WatchItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "CardVariant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "detail" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Settings_userId_key" ON "Settings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Set_code_key" ON "Set"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Set_sourceId_key" ON "Set"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Card_key_key" ON "Card"("key");

-- CreateIndex
CREATE INDEX "Card_type_idx" ON "Card"("type");

-- CreateIndex
CREATE INDEX "Card_setId_idx" ON "Card"("setId");

-- CreateIndex
CREATE UNIQUE INDEX "CardVariant_sourceId_key" ON "CardVariant"("sourceId");

-- CreateIndex
CREATE INDEX "CardVariant_cardId_idx" ON "CardVariant"("cardId");

-- CreateIndex
CREATE INDEX "CardVariant_tcgplayerId_idx" ON "CardVariant"("tcgplayerId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceSnapshot_variantId_source_day_key" ON "PriceSnapshot"("variantId", "source", "day");

-- CreateIndex
CREATE INDEX "LocalPriceReport_userId_variantId_idx" ON "LocalPriceReport"("userId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "ManualPrice_userId_variantId_key" ON "ManualPrice"("userId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "FxRate_base_quote_day_key" ON "FxRate"("base", "quote", "day");

-- CreateIndex
CREATE UNIQUE INDEX "StorageLocation_userId_name_key" ON "StorageLocation"("userId", "name");

-- CreateIndex
CREATE INDEX "Lot_userId_variantId_idx" ON "Lot"("userId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "Deck_shareToken_key" ON "Deck"("shareToken");

-- CreateIndex
CREATE UNIQUE INDEX "DeckCard_deckId_cardId_section_key" ON "DeckCard"("deckId", "cardId", "section");

-- CreateIndex
CREATE UNIQUE INDEX "DeckVersion_deckId_version_key" ON "DeckVersion"("deckId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "RulingEventCard_rulingId_cardId_key" ON "RulingEventCard"("rulingId", "cardId");

-- CreateIndex
CREATE INDEX "Alert_userId_read_idx" ON "Alert"("userId", "read");

-- CreateIndex
CREATE UNIQUE INDEX "WatchItem_userId_variantId_key" ON "WatchItem"("userId", "variantId");
