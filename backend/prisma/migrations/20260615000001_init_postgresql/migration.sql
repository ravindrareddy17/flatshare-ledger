-- CreateTable
CREATE TABLE IF NOT EXISTS "people" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "joinedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "imports" (
    "id" SERIAL NOT NULL,
    "filename" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalRows" INTEGER NOT NULL,
    "expenseCount" INTEGER NOT NULL,
    "settlementCount" INTEGER NOT NULL,
    "skippedCount" INTEGER NOT NULL,
    "anomalyCount" INTEGER NOT NULL,
    CONSTRAINT "imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "expenses" (
    "id" SERIAL NOT NULL,
    "importId" INTEGER,
    "sourceRow" INTEGER,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "notes" TEXT,
    "paidById" INTEGER,
    "amountOriginal" DECIMAL(12,2) NOT NULL,
    "currencyOriginal" TEXT NOT NULL DEFAULT 'INR',
    "amountInInr" DECIMAL(12,2) NOT NULL,
    "exchangeRateUsed" DECIMAL(10,4),
    "splitType" TEXT NOT NULL,
    "isDuplicateOf" INTEGER,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "excludeFromBalances" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "expense_splits" (
    "id" SERIAL NOT NULL,
    "expenseId" INTEGER NOT NULL,
    "personId" INTEGER NOT NULL,
    "shareValue" DECIMAL(12,4),
    "amountOwedInInr" DECIMAL(12,2) NOT NULL,
    CONSTRAINT "expense_splits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "settlements" (
    "id" SERIAL NOT NULL,
    "importId" INTEGER,
    "sourceRow" INTEGER,
    "date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "fromPersonId" INTEGER NOT NULL,
    "toPersonId" INTEGER NOT NULL,
    "amountOriginal" DECIMAL(12,2) NOT NULL,
    "currencyOriginal" TEXT NOT NULL DEFAULT 'INR',
    "amountInInr" DECIMAL(12,2) NOT NULL,
    "exchangeRateUsed" DECIMAL(10,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "anomaly_records" (
    "id" SERIAL NOT NULL,
    "importId" INTEGER NOT NULL,
    "sourceRow" INTEGER NOT NULL,
    "field" TEXT,
    "anomalyType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "rawValue" TEXT,
    "description" TEXT NOT NULL,
    "actionTaken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "anomaly_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "people_name_key" ON "people"("name");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "expense_splits_expenseId_personId_key" ON "expense_splits"("expenseId", "personId");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_importId_fkey" FOREIGN KEY ("importId") REFERENCES "imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_splits" ADD CONSTRAINT "expense_splits_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_splits" ADD CONSTRAINT "expense_splits_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_fromPersonId_fkey" FOREIGN KEY ("fromPersonId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_toPersonId_fkey" FOREIGN KEY ("toPersonId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_importId_fkey" FOREIGN KEY ("importId") REFERENCES "imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly_records" ADD CONSTRAINT "anomaly_records_importId_fkey" FOREIGN KEY ("importId") REFERENCES "imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
