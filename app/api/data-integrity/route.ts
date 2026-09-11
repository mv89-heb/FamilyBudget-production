import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

function currentJerusalemMonth() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return year && month ? `${year}-${month}` : new Date().toISOString().slice(0, 7);
}

function monthRange(month: string) {
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
}

type DuplicateFingerprint = { fingerprint: string; count: number };
type LiabilityMismatch = { id: string; amount: Prisma.Decimal; category: string; note: string | null };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const month = currentJerusalemMonth();
    const { start, end } = monthRange(month);

    const [orphans, duplicateFingerprints, nullFingerprints, liabilityMismatches, flow] = await Promise.all([
      prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM "Transaction" t
        LEFT JOIN "Category" c ON c.id = t."categoryId"
        WHERE t."userId" = ${user.id} AND c.id IS NULL
      `),
      prisma.$queryRaw<DuplicateFingerprint[]>(Prisma.sql`
        SELECT "fingerprint", COUNT(*)::int AS count
        FROM "Transaction"
        WHERE "userId" = ${user.id} AND "fingerprint" IS NOT NULL
        GROUP BY "fingerprint"
        HAVING COUNT(*) > 1
      `),
      prisma.transaction.count({ where: { userId: user.id, fingerprint: null } }),
      prisma.$queryRaw<LiabilityMismatch[]>(Prisma.sql`
        SELECT t.id, t.amount, c."name" AS category, t.note
        FROM "Transaction" t
        JOIN "Category" c ON c.id = t."categoryId"
        WHERE t."userId" = ${user.id}
          AND t.kind = 'STANDARD'
          AND (
            c."name" ILIKE '%הלווא%'
            OR c."name" ILIKE '%משכנתא%'
            OR c."name" ILIKE '%חובות%'
            OR t.note ILIKE '%יהב-אשראי%'
            OR t.note ILIKE '%מימון ישיר%'
          )
        LIMIT 100
      `),
      prisma.transaction.groupBy({
        by: ["type", "kind"],
        where: { userId: user.id, transactionDate: { gte: start, lt: end } },
        _sum: { amount: true },
      }),
    ]);

    const income = flow.filter((row) => row.type === "INCOME" && !["TRANSFER", "LOAN_RECEIVED"].includes(row.kind)).reduce((sum, row) => sum + Number(row._sum.amount || 0), 0);
    const expenses = flow.filter((row) => row.type === "EXPENSE" && ["STANDARD", "LOAN_INTEREST"].includes(row.kind)).reduce((sum, row) => sum + Number(row._sum.amount || 0), 0);
    const loans = flow.filter((row) => row.kind === "LOAN_PRINCIPAL").reduce((sum, row) => sum + Number(row._sum.amount || 0), 0);
    const savingsAndTransfers = flow.filter((row) => ["TRANSFER", "CASH_WITHDRAWAL"].includes(row.kind)).reduce((sum, row) => sum + Number(row._sum.amount || 0), 0);

    return NextResponse.json({
      month,
      integrity: {
        orphanTransactions: Number(orphans[0]?.count ?? 0),
        duplicateFingerprints: duplicateFingerprints.map((row) => ({ fingerprint: row.fingerprint, count: Number(row.count) })),
        legacyTransactionsWithoutFingerprint: nullFingerprints,
        liabilityClassificationMismatches: liabilityMismatches.map((row) => ({ id: row.id, amount: Number(row.amount), category: row.category, note: row.note })),
      },
      monthlyFlow: {
        income,
        expenses,
        loans,
        savingsAndTransfers,
        netFlow: income - expenses - loans - savingsAndTransfers,
        closingBalanceCheck: "UNAVAILABLE_WITHOUT_ACCOUNT_BALANCE_SOURCE",
      },
      healthy: Number(orphans[0]?.count ?? 0) === 0 && duplicateFingerprints.length === 0 && liabilityMismatches.length === 0,
    });
  } catch {
    return NextResponse.json({ error: "לא ניתן לבצע בדיקת שלמות נתונים" }, { status: 400 });
  }
}
