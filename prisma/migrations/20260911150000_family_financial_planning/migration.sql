CREATE TYPE "BudgetClass" AS ENUM ('HARD', 'VARIABLE');
CREATE TYPE "IncomeType" AS ENUM ('SALARY', 'BENEFIT', 'ADDITIONAL');

ALTER TABLE "Budget" ADD COLUMN "class" "BudgetClass" NOT NULL DEFAULT 'VARIABLE';
CREATE INDEX "Budget_userId_class_idx" ON "Budget"("userId", "class");

CREATE TABLE "IncomeSource" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "IncomeType" NOT NULL,
  "monthlyAmount" DECIMAL(12,2) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IncomeSource_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "IncomeSource_userId_active_idx" ON "IncomeSource"("userId", "active");
ALTER TABLE "IncomeSource" ADD CONSTRAINT "IncomeSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SinkingFund" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "targetAmount" DECIMAL(12,2) NOT NULL,
  "currentAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "monthlyContribution" DECIMAL(12,2) NOT NULL,
  "dueDate" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SinkingFund_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SinkingFund_userId_active_idx" ON "SinkingFund"("userId", "active");
CREATE INDEX "SinkingFund_userId_dueDate_idx" ON "SinkingFund"("userId", "dueDate");
ALTER TABLE "SinkingFund" ADD CONSTRAINT "SinkingFund_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FinancialPlan" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "monthlySavingsTarget" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "weeklyLeisureBudget" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "emergencyFundAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "emergencyTargetMonths" INTEGER NOT NULL DEFAULT 3,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinancialPlan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FinancialPlan_userId_key" ON "FinancialPlan"("userId");
ALTER TABLE "FinancialPlan" ADD CONSTRAINT "FinancialPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
