CREATE TYPE "TransactionKind" AS ENUM ('STANDARD', 'TRANSFER', 'CASH_WITHDRAWAL', 'LOAN_RECEIVED', 'LOAN_PRINCIPAL', 'LOAN_INTEREST', 'REFUND');

ALTER TABLE "User" ADD COLUMN "householdSize" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "Loan" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "originalAmount" DECIMAL(12,2) NOT NULL,
  "outstandingAmount" DECIMAL(12,2),
  "interestRate" DECIMAL(7,4),
  "monthlyPayment" DECIMAL(12,2),
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Transaction" ADD COLUMN "kind" "TransactionKind" NOT NULL DEFAULT 'STANDARD';
ALTER TABLE "Transaction" ADD COLUMN "loanId" TEXT;

CREATE INDEX "Loan_userId_idx" ON "Loan"("userId");
CREATE INDEX "Transaction_userId_kind_idx" ON "Transaction"("userId", "kind");
CREATE INDEX "Transaction_userId_loanId_idx" ON "Transaction"("userId", "loanId");

ALTER TABLE "Loan" ADD CONSTRAINT "Loan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
