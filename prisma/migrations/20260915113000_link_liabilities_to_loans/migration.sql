ALTER TABLE "Liability"
ADD CONSTRAINT "Liability_loanId_fkey"
FOREIGN KEY ("loanId") REFERENCES "Loan"("id")
ON DELETE SET NULL ON UPDATE CASCADE
NOT VALID;

CREATE INDEX "Liability_loanId_idx" ON "Liability"("loanId");
