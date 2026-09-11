-- CreateEnum
CREATE TYPE "CreditCardTransactionType" AS ENUM ('CHARGE', 'REFUND');

-- CreateEnum
CREATE TYPE "CreditCardTransactionKind" AS ENUM ('PURCHASE', 'INSTALLMENT', 'REFUND', 'FEE', 'OTHER');

-- CreateTable
CREATE TABLE "CreditCardTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "CreditCardTransactionType" NOT NULL,
    "kind" "CreditCardTransactionKind" NOT NULL DEFAULT 'PURCHASE',
    "amount" DECIMAL(12,2) NOT NULL,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "postingDate" TIMESTAMP(3),
    "merchant" TEXT NOT NULL,
    "note" TEXT,
    "categoryId" TEXT,
    "paymentMethodId" TEXT,
    "reference" TEXT,
    "installmentTotal" INTEGER,
    "installmentNumber" INTEGER,
    "fingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditCardTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreditCardTransaction_userId_fingerprint_key" ON "CreditCardTransaction"("userId", "fingerprint");
CREATE INDEX "CreditCardTransaction_userId_purchaseDate_idx" ON "CreditCardTransaction"("userId", "purchaseDate");
CREATE INDEX "CreditCardTransaction_userId_postingDate_idx" ON "CreditCardTransaction"("userId", "postingDate");
CREATE INDEX "CreditCardTransaction_userId_type_idx" ON "CreditCardTransaction"("userId", "type");
CREATE INDEX "CreditCardTransaction_userId_kind_idx" ON "CreditCardTransaction"("userId", "kind");
CREATE INDEX "CreditCardTransaction_userId_categoryId_idx" ON "CreditCardTransaction"("userId", "categoryId");
CREATE INDEX "CreditCardTransaction_userId_paymentMethodId_idx" ON "CreditCardTransaction"("userId", "paymentMethodId");

-- AddForeignKey
ALTER TABLE "CreditCardTransaction" ADD CONSTRAINT "CreditCardTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreditCardTransaction" ADD CONSTRAINT "CreditCardTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CreditCardTransaction" ADD CONSTRAINT "CreditCardTransaction_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
