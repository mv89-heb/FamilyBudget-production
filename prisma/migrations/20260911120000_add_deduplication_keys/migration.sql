ALTER TABLE "Transaction" ADD COLUMN "fingerprint" TEXT;
ALTER TABLE "ImportJob" ADD COLUMN "fileHash" TEXT;

CREATE INDEX "Transaction_userId_fingerprint_idx" ON "Transaction"("userId", "fingerprint");
CREATE UNIQUE INDEX "Transaction_userId_fingerprint_key" ON "Transaction"("userId", "fingerprint");
CREATE UNIQUE INDEX "ImportJob_userId_fileHash_key" ON "ImportJob"("userId", "fileHash");
