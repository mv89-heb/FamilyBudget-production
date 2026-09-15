import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();

    const [transactions, creditCards] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId: user.id },
        select: { id: true, type: true, kind: true, amount: true, categoryId: true, category: { select: { id: true, type: true, name: true } }, fingerprint: true },
      }),
      prisma.creditCardTransaction.findMany({
        where: { userId: user.id },
        select: { id: true, type: true, kind: true, amount: true, categoryId: true, category: { select: { id: true, type: true, name: true } }, fingerprint: true },
      }),
    ]);

    const issues: Array<{ code: string; severity: "ERROR" | "WARNING"; count: number; examples: string[] }> = [];
    const addIssue = (code: string, severity: "ERROR" | "WARNING", ids: string[]) => {
      if (ids.length) issues.push({ code, severity, count: ids.length, examples: ids.slice(0, 10) });
    };

    addIssue("TRANSACTION_NON_POSITIVE_AMOUNT", "ERROR", transactions.filter((row) => Number(row.amount) <= 0).map((row) => row.id));
    addIssue("CREDIT_CARD_NON_POSITIVE_AMOUNT", "ERROR", creditCards.filter((row) => Number(row.amount) <= 0).map((row) => row.id));
    addIssue("TRANSACTION_CATEGORY_MISMATCH", "ERROR", transactions.filter((row) => row.category.type !== row.type).map((row) => row.id));
    addIssue("CREDIT_CARD_CATEGORY_MISMATCH", "ERROR", creditCards.filter((row) => row.category && row.category.type !== "EXPENSE").map((row) => row.id));
    addIssue("REFUND_WRONG_TYPE", "ERROR", transactions.filter((row) => row.kind === "REFUND" && row.type !== "INCOME").map((row) => row.id));
    addIssue("LOAN_RECEIVED_WRONG_TYPE", "ERROR", transactions.filter((row) => row.kind === "LOAN_RECEIVED" && row.type !== "INCOME").map((row) => row.id));
    addIssue("LOAN_PRINCIPAL_WRONG_TYPE", "ERROR", transactions.filter((row) => row.kind === "LOAN_PRINCIPAL" && row.type !== "EXPENSE").map((row) => row.id));
    addIssue("LOAN_INTEREST_WRONG_TYPE", "ERROR", transactions.filter((row) => row.kind === "LOAN_INTEREST" && row.type !== "EXPENSE").map((row) => row.id));
    addIssue("UNCATEGORIZED_TRANSACTION", "WARNING", transactions.filter((row) => !row.categoryId || !row.category || !row.category.name.trim() || row.category.name === "לא סווג").map((row) => row.id));
    addIssue("MISSING_TRANSACTION_FINGERPRINT", "WARNING", transactions.filter((row) => !row.fingerprint).map((row) => row.id));

    const fingerprintCounts = new Map<string, string[]>();
    for (const row of transactions) {
      if (!row.fingerprint) continue;
      const ids = fingerprintCounts.get(row.fingerprint) ?? [];
      ids.push(row.id);
      fingerprintCounts.set(row.fingerprint, ids);
    }
    addIssue("DUPLICATE_TRANSACTION_FINGERPRINT", "ERROR", [...fingerprintCounts.values()].filter((ids) => ids.length > 1).flat());

    const cardFingerprintCounts = new Map<string, string[]>();
    for (const row of creditCards) {
      const ids = cardFingerprintCounts.get(row.fingerprint) ?? [];
      ids.push(row.id);
      cardFingerprintCounts.set(row.fingerprint, ids);
    }
    addIssue("DUPLICATE_CREDIT_CARD_FINGERPRINT", "ERROR", [...cardFingerprintCounts.values()].filter((ids) => ids.length > 1).flat());

    const errors = issues.filter((issue) => issue.severity === "ERROR");
    const warnings = issues.filter((issue) => issue.severity === "WARNING");

    return NextResponse.json({
      status: errors.length ? "FAIL" : warnings.length ? "WARN" : "PASS",
      auditedAt: new Date().toISOString(),
      counts: { transactions: transactions.length, creditCardTransactions: creditCards.length, errors: errors.length, warnings: warnings.length },
      issues,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    return NextResponse.json({ error: "לא ניתן לבצע בדיקת שלמות" }, { status: 500 });
  }
}
