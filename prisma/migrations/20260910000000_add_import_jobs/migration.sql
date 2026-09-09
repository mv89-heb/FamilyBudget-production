CREATE TYPE "ImportStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "ImportJob" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "status" "ImportStatus" NOT NULL DEFAULT 'PROCESSING',
  "rowsDetected" INTEGER NOT NULL DEFAULT 0,
  "rowsAnalyzed" INTEGER NOT NULL DEFAULT 0,
  "rowsImported" INTEGER NOT NULL DEFAULT 0,
  "rowsSkipped" INTEGER NOT NULL DEFAULT 0,
  "categoriesCreated" INTEGER NOT NULL DEFAULT 0,
  "paymentMethodsCreated" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ImportJob_userId_createdAt_idx" ON "ImportJob"("userId", "createdAt");

ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
