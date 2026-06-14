-- CreateTable
CREATE TABLE "people" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "joinedAt" DATETIME,
    "leftAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "imports" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "filename" TEXT NOT NULL,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalRows" INTEGER NOT NULL,
    "expenseCount" INTEGER NOT NULL,
    "settlementCount" INTEGER NOT NULL,
    "skippedCount" INTEGER NOT NULL,
    "anomalyCount" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "importId" INTEGER,
    "sourceRow" INTEGER,
    "date" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "notes" TEXT,
    "paidById" INTEGER,
    "amountOriginal" DECIMAL NOT NULL,
    "currencyOriginal" TEXT NOT NULL DEFAULT 'INR',
    "amountInInr" DECIMAL NOT NULL,
    "exchangeRateUsed" DECIMAL,
    "splitType" TEXT NOT NULL,
    "isDuplicateOf" INTEGER,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "excludeFromBalances" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "expenses_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "people" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "expenses_importId_fkey" FOREIGN KEY ("importId") REFERENCES "imports" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "expense_splits" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "expenseId" INTEGER NOT NULL,
    "personId" INTEGER NOT NULL,
    "shareValue" DECIMAL,
    "amountOwedInInr" DECIMAL NOT NULL,
    CONSTRAINT "expense_splits_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expenses" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "expense_splits_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "settlements" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "importId" INTEGER,
    "sourceRow" INTEGER,
    "date" DATETIME NOT NULL,
    "notes" TEXT,
    "fromPersonId" INTEGER NOT NULL,
    "toPersonId" INTEGER NOT NULL,
    "amountOriginal" DECIMAL NOT NULL,
    "currencyOriginal" TEXT NOT NULL DEFAULT 'INR',
    "amountInInr" DECIMAL NOT NULL,
    "exchangeRateUsed" DECIMAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "settlements_fromPersonId_fkey" FOREIGN KEY ("fromPersonId") REFERENCES "people" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "settlements_toPersonId_fkey" FOREIGN KEY ("toPersonId") REFERENCES "people" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "settlements_importId_fkey" FOREIGN KEY ("importId") REFERENCES "imports" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "anomaly_records" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "importId" INTEGER NOT NULL,
    "sourceRow" INTEGER NOT NULL,
    "field" TEXT,
    "anomalyType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "rawValue" TEXT,
    "description" TEXT NOT NULL,
    "actionTaken" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "anomaly_records_importId_fkey" FOREIGN KEY ("importId") REFERENCES "imports" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "people_name_key" ON "people"("name");

-- CreateIndex
CREATE UNIQUE INDEX "expense_splits_expenseId_personId_key" ON "expense_splits"("expenseId", "personId");
