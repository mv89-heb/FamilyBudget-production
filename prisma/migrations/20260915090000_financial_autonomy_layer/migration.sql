CREATE TYPE "RuleMatchType" AS ENUM ('CONTAINS', 'EXACT', 'STARTS_WITH');
CREATE TYPE "RuleSource" AS ENUM ('USER', 'SYSTEM', 'GEMINI');
CREATE TYPE "AssetType" AS ENUM ('BANK_ACCOUNT', 'CASH', 'SAVINGS', 'DEPOSIT', 'INVESTMENT', 'PENSION', 'TRAINING_FUND', 'VEHICLE', 'PROPERTY', 'OTHER');
CREATE TYPE "LiabilityType" AS ENUM ('MORTGAGE', 'LOAN', 'CREDIT_CARD', 'OTHER');
CREATE TYPE "ReconciliationStatus" AS ENUM ('OPEN', 'RECONCILED');

CREATE TABLE "LoanAmortizationEntry" (
  "id" TEXT NOT NULL,
  "loanId" TEXT NOT NULL,
  "paymentDate" TIMESTAMP(3) NOT NULL,
  "payment" DECIMAL(12,2) NOT NULL,
  "principal" DECIMAL(12,2) NOT NULL,
  "interest" DECIMAL(12,2) NOT NULL,
  "balanceAfter" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "LoanAmortizationEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LoanAmortizationEntry_loanId_paymentDate_key" ON "LoanAmortizationEntry"("loanId","paymentDate");
CREATE INDEX "LoanAmortizationEntry_loanId_paymentDate_idx" ON "LoanAmortizationEntry"("loanId","paymentDate");
ALTER TABLE "LoanAmortizationEntry" ADD CONSTRAINT "LoanAmortizationEntry_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ClassificationRule" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "pattern" TEXT NOT NULL,
  "matchType" "RuleMatchType" NOT NULL DEFAULT 'CONTAINS',
  "categoryId" TEXT NOT NULL,
  "source" "RuleSource" NOT NULL DEFAULT 'USER',
  "priority" INTEGER NOT NULL DEFAULT 100,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "matchCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClassificationRule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClassificationRule_userId_pattern_matchType_categoryId_key" ON "ClassificationRule"("userId","pattern","matchType","categoryId");
CREATE INDEX "ClassificationRule_userId_active_priority_idx" ON "ClassificationRule"("userId","active","priority");
ALTER TABLE "ClassificationRule" ADD CONSTRAINT "ClassificationRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassificationRule" ADD CONSTRAINT "ClassificationRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Asset" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "AssetType" NOT NULL,
  "currentValue" DECIMAL(12,2) NOT NULL,
  "valuationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Asset_userId_active_idx" ON "Asset"("userId","active");
CREATE INDEX "Asset_userId_valuationDate_idx" ON "Asset"("userId","valuationDate");
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Liability" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "LiabilityType" NOT NULL,
  "currentBalance" DECIMAL(12,2) NOT NULL,
  "interestRate" DECIMAL(7,4),
  "monthlyPayment" DECIMAL(12,2),
  "loanId" TEXT,
  "valuationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Liability_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Liability_userId_active_idx" ON "Liability"("userId","active");
CREATE INDEX "Liability_userId_valuationDate_idx" ON "Liability"("userId","valuationDate");
ALTER TABLE "Liability" ADD CONSTRAINT "Liability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "NetWorthSnapshot" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "snapshotDate" TIMESTAMP(3) NOT NULL,
  "assets" DECIMAL(12,2) NOT NULL,
  "liabilities" DECIMAL(12,2) NOT NULL,
  "netWorth" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "NetWorthSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NetWorthSnapshot_userId_snapshotDate_key" ON "NetWorthSnapshot"("userId","snapshotDate");
CREATE INDEX "NetWorthSnapshot_userId_snapshotDate_idx" ON "NetWorthSnapshot"("userId","snapshotDate");
ALTER TABLE "NetWorthSnapshot" ADD CONSTRAINT "NetWorthSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "BankReconciliation" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "month" TIMESTAMP(3) NOT NULL,
  "ledgerBalance" DECIMAL(12,2) NOT NULL,
  "bankBalance" DECIMAL(12,2) NOT NULL,
  "difference" DECIMAL(12,2) NOT NULL,
  "status" "ReconciliationStatus" NOT NULL DEFAULT 'OPEN',
  "notes" TEXT,
  "reconciledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BankReconciliation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BankReconciliation_userId_month_key" ON "BankReconciliation"("userId","month");
CREATE INDEX "BankReconciliation_userId_month_idx" ON "BankReconciliation"("userId","month");
ALTER TABLE "BankReconciliation" ADD CONSTRAINT "BankReconciliation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
