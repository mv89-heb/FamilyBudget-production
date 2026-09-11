import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { monthSchema } from "@/lib/validation";

function monthRange(month: string) { const start = new Date(`${month}-01T00:00:00.000Z`); const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1); return { start, end }; }
function currentJerusalemMonth() { const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit" }).formatToParts(new Date()); const year = parts.find((part) => part.type === "year")?.value; const month = parts.find((part) => part.type === "month")?.value; return year && month ? `${year}-${month}` : new Date().toISOString().slice(0, 7); }
const expenseKinds = ["STANDARD", "LOAN_INTEREST"] as const;
const incomeKinds = ["STANDARD", "REFUND"] as const;

type CategoryRow = { name: string; amount: Prisma.Decimal | number | null };

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const param = new URL(req.url).searchParams.get("month");
    const isAll = param === "all";
    const month = isAll ? "all" : monthSchema.parse(param || currentJerusalemMonth());
    const range = isAll ? null : monthRange(month);
    const dateFilter = range ? { transactionDate: { gte: range.start, lt: range.end } } : {};

    const [rows, totals, categoryRows] = await Promise.all([
      prisma.transaction.findMany({ where: { userId: user.id, ...dateFilter }, select: { id: true, type: true, kind: true, amount: true, transactionDate: true, note: true, category: { select: { name: true } }, paymentMethod: { select: { nickname: true, last4: true } } }, orderBy: { transactionDate: "desc" }, take: 8 }),
      prisma.transaction.groupBy({ by: ["type", "kind"], where: { userId: user.id, ...dateFilter }, _sum: { amount: true } }),
      range
        ? prisma.$queryRaw<CategoryRow[]>(Prisma.sql`
            SELECT COALESCE(c."name", 'אחר') AS name, COALESCE(SUM(t.amount), 0) AS amount
            FROM "Transaction" t
            LEFT JOIN "Category" c ON c.id = t."categoryId"
            WHERE t."userId" = ${user.id}
              AND t.type = 'EXPENSE'
              AND t.kind IN ('STANDARD', 'LOAN_INTEREST')
              AND t."transactionDate" >= ${range.start}
              AND t."transactionDate" < ${range.end}
            GROUP BY COALESCE(c."name", 'אחר')
            ORDER BY amount DESC
          `)
        : prisma.$queryRaw<CategoryRow[]>(Prisma.sql`
            SELECT COALESCE(c."name", 'אחר') AS name, COALESCE(SUM(t.amount), 0) AS amount
            FROM "Transaction" t
            LEFT JOIN "Category" c ON c.id = t."categoryId"
            WHERE t."userId" = ${user.id}
              AND t.type = 'EXPENSE'
              AND t.kind IN ('STANDARD', 'LOAN_INTEREST')
            GROUP BY COALESCE(c."name", 'אחר')
            ORDER BY amount DESC
          `),
    ]);

    const income = totals.filter((row) => row.type === "INCOME" && incomeKinds.includes(row.kind as (typeof incomeKinds)[number])).reduce((sum, row) => sum + Number(row._sum.amount || 0), 0);
    const expense = totals.filter((row) => row.type === "EXPENSE" && expenseKinds.includes(row.kind as (typeof expenseKinds)[number])).reduce((sum, row) => sum + Number(row._sum.amount || 0), 0);
    const financing = totals.filter((row) => ["LOAN_RECEIVED", "LOAN_PRINCIPAL", "TRANSFER", "CASH_WITHDRAWAL"].includes(row.kind)).reduce((sum, row) => sum + Number(row._sum.amount || 0), 0);
    const byCategory = categoryRows.map((row) => ({ name: row.name || "אחר", amount: Number(row.amount || 0) })).sort((a, b) => b.amount - a.amount);

    return NextResponse.json({
      month,
      income,
      expense,
      balance: income - expense,
      financingActivity: financing,
      byCategory,
      recent: rows.map((row) => ({ id: row.id, type: row.type, kind: row.kind, amount: Number(row.amount), date: row.transactionDate.toISOString(), category: row.category?.name || "אחר", paymentMethod: row.paymentMethod ? `${row.paymentMethod.nickname}${row.paymentMethod.last4 ? ` •••• ${row.paymentMethod.last4}` : ""}` : null, note: row.note })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    return NextResponse.json({ error: "חודש לא תקין" }, { status: 400 });
  }
}
