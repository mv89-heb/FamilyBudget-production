import { transactionFingerprint } from "@/lib/import/transaction-identity";

export type ReconciliationRow = {
  id: string;
  date: string;
  type: "INCOME" | "EXPENSE";
  amount: number;
  note?: string | null;
  paymentMethodName?: string | null;
  fingerprint?: string | null;
};

export type ReconciliationCandidate = {
  id: string;
  fingerprint: string;
  status: "SAFE_BACKFILL" | "COLLISION" | "ALREADY_MATCHED";
  collisionIds: string[];
};

export function analyzeTransactionFingerprints(
  rows: readonly ReconciliationRow[],
  source: "BANK" | "CREDIT_CARD",
): ReconciliationCandidate[] {
  const groups = new Map<string, ReconciliationRow[]>();

  for (const row of rows) {
    const fingerprint = transactionFingerprint({
      source,
      date: row.date,
      type: row.type,
      amount: row.amount,
      note: row.note,
      paymentMethodName: row.paymentMethodName,
    });
    const group = groups.get(fingerprint) ?? [];
    group.push(row);
    groups.set(fingerprint, group);
  }

  const result: ReconciliationCandidate[] = [];
  for (const [fingerprint, group] of groups) {
    const collisionIds = group.map((row) => row.id);
    const hasStoredFingerprint = group.some((row) => row.fingerprint === fingerprint);

    for (const row of group) {
      result.push({
        id: row.id,
        fingerprint,
        status: row.fingerprint === fingerprint
          ? "ALREADY_MATCHED"
          : group.length === 1 && !hasStoredFingerprint
            ? "SAFE_BACKFILL"
            : "COLLISION",
        collisionIds,
      });
    }
  }

  return result.sort((a, b) => a.id.localeCompare(b.id));
}
