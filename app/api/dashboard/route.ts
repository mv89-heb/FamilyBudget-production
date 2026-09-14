import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { monthSchema } from "@/lib/validation";
import {
  calculateFinancingActivity,
  calculateNetExpense,
  calculateOperatingIncome,
  getIsraelMonth,
  monthRange,
  type FinancialTransaction,
} from "@/lib/financial-engine";

type CategoryRow = { name: string; amount: Prisma.Decimal | number | null };

type UnifiedRecent = {
  id: string;
  source: "transaction" | "credit-card";
  type: "INCOME" | "EXPENSE";
  amount: number;
  date: string;
  category: string;
  paymentMethod: string | null;
  note: string | null;
};

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const param = new URL(req.url).searchParams.get("month");
    const isAll = param === "all";
    const month = isAll ? "all" : monthSchema.parse(param || getIsraelMonth());
    const range = isAll ? null : monthRange(month);
    const transactionDateFilter = range ? { transactionDate: { gte: range.start, lt: range.end } } : {};
    const creditDateFilter = range ? { purchaseDate: { gte: range.start, lt: range.end } } : {};

    const [rows, transactions, creditRows, categoryRows, creditCategoryRows] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId: user.id, ...transactionDateFilter },
        select: {
          id: true,
          type: true,
          kind: true,
          amount: true,
          transactionDate: true,
          note: true,
          category: { select: { name: true } },
          paymentMethod: { select: { nickname: true, last4: true } },
        },
        orderBy: { transactionDate: "desc" },
        take: 8,
      }),
      prisma.transaction.findMany({
        where: { userId: user.id, ...transactionDateFilter },
        select: { type: true, kind: true, amount: true },
      }),
      prisma.creditCardTransaction.findMany({
        where: { userId: user.id, ...creditDateFilter },
        select: {
          id: true,
          type: true,
          kind: true,
          amount: true,
          purchaseDate: true,
          merchant: true,
          note: true,
          category: { select: { name: true } },
          paymentMethod: { select: { nickname: true, last4: true } },
        },
        orderBy: { purchaseDate: "desc" },
        take: 8,
      }),
      range
        ? prisma.$queryRaw<CategoryRow[]>(Prisma.sql`
            SELECT COALESCE(c."name", 'אחר') AS name,
                   COALESCE(SUM(CASE WHEN t.type = 'INCOME' AND t.kind = 'REFUND' THEN -t.amount ELSE t.amount END), 0) AS amount
            FROM "Transaction" t
            LEFT JOIN "Category" c ON c.id = t."categoryId"
            WHERE t."userId" = ${user.id}
              AND ((t.type = 'EXPENSE' AND t.kind IN ('STANDARD', 'LOAN_INTEREST'))
                OR (t.type = 'INCOME' AND t.kind = 'REFUND'))
              AND t."transactionDate" >= ${range.start}
              AND t."transactionDate" < ${range.end}
            GROUP BY COALESCE(c."name", 'אחר')
            HAVING COALESCE(SUM(CASE WHEN t.type = 'INCOME' AND t.kind = 'REFUND' THEN -t.amount ELSE t.amount END), 0) <> 0
          `)
        : prisma.$queryRaw<CategoryRow[]>(Prisma.sql`
            SELECT COALESCE(c."name", 'אחר') AS name,
                   COALESCE(SUM(CASE WHEN t.type = 'INCOME' AND t.kind = 'REFUND' THEN -t.amount ELSE t.amount END), 0) AS amount
            FROM "Transaction" t
            LEFT JOIN "Category" c ON c.id = t."categoryId"
            WHERE t."userId" = ${user.id}
              AND ((t.type = 'EXPENSE' AND t.kind IN ('STANDARD', 'LOAN_INTEREST'))
                OR (t.type = 'INCOME' AND t.kind = 'REFUND'))
            GROUP BY COALESCE(c."name", 'אחר')
            HAVING COALESCE(SUM(CASE WHEN t.type = 'INCOME' AND t.kind = 'REFUND' THEN -t.amount ELSE t.amount END), 0) <> 0
          `),
      range
        ? prisma.$queryRaw<CategoryRow[]>(Prisma.sql`
            SELECT COALESCE(c."name", 'אחר') AS name,
                   COALESCE(SUM(CASE WHEN ct.type = 'REFUND' THEN -ct.amount ELSE ct.amount END), 0) AS amount
            FROM "CreditCardTransaction" ct
            LEFT JOIN "Category" c ON c.id = ct."categoryId"
            WHERE ct."userId" = ${user.id}
              AND ct."purchaseDate" >= ${range.start}
              AND ct."purchaseDate" < ${range.end}
              AND ct.type IN ('CHARGE', 'REFUND')
            GROUP BY COALESCE(c."name", 'אחר')
            HAVING COALESCE(SUM(CASE WHEN ct.type = 'REFUND' THEN -ct.amount ELSE ct.amount END), 0) <> 0
          `)
        : prisma.$queryRaw<CategoryRow[]>(Prisma.sql`
            SELECT COALESCE(c."name", 'אחר') AS name,
                   COALESCE(SUM(CASE WHEN ct.type = 'REFUND' THEN -ct.amount ELSE ct.amount END), 0) AS amount
            FROM "CreditCardTransaction" ct
            LEFT JOIN "Category" c ON c.id = ct."categoryId"
            WHERE ct."userId" = ${user.id}
              AND ct.type IN ('CHARGE', 'REFUND')
            GROUP BY COALESCE(c."name", 'אחר')
            HAVING COALESCE(SUM(CASE WHEN ct.type = 'REFUND' THEN -ct.amount ELSE ct.amount END), 0) <> 0
          `),
    ]);

    const normalized: FinancialTransaction[] = [
      ...transactions.map((transaction) => ({ type: transaction.type, kind: transaction.kind, amount: Number(transaction.amount) })),
      ...creditRows.map((transaction) => ({
        type: transaction.type === "REFUND" ? "INCOME" as const : "EXPENSE" as const,
        kind: transaction.type === "REFUND" ? "REFUND" as const : "STANDARD" as const,
        amount: Number(transaction.amount),
      })),
    ];

    const income = calculateOperatingIncome(normalized);
    const expense = calculateNetExpense(normalized);
    const financing = calculateFinancingActivity(normalized);
    const byCategoryMap = new Map<string, number>();
    for (const row of [...categoryRows, ...creditCategoryRows]) {
      const name = row.name || "אחר";
      byCategoryMap.set(name, (byCategoryMap.get(name) || 0) + Number(row.amount || 0));
    }
    const byCategory = [...byCategoryMap.entries()]
      .map(([name, amount]) => ({ name, amount }))
      .filter((row) => row.amount !== 0)
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

    const recent: UnifiedRecent[] = [
      ...rows.map((row) => ({
        id: row.id,
        source: "transaction" as const,
        type: row.type,
        amount: Number(row.amount),
        date: row.transactionDate.toISOString(),
        category: row.category?.name || "אחר",
        paymentMethod: row.paymentMethod ? `${row.paymentMethod.nickname}${row.paymentMethod.last4 ? ` •••• ${row.paymentMethod.last4}` : ""}` : null,
        note: row.note,
      })),
      ...creditRows.map((row) => ({
        id: row.id,
        source: "credit-card" as const,
        type: row.type === "REFUND" ? "INCOME" as const : "EXPENSE" as const,
        amount: Number(row.amount),
        date: row.purchaseDate.toISOString(),
        category: row.category?.name || "אחר",
        paymentMethod: row.paymentMethod ? `${row.paymentMethod.nickname}${row.paymentMethod.last4 ? ` •••• ${row.paymentMethod.last4}` : ""}` : null,
        note: row.note || row.merchant,
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 8);

    return NextResponse.json({
      month,
      income,
      expense,
      balance: income - expense,
      financingActivity: financing,
      byCategory,
      recent,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    return NextResponse.json({ error: "חודש לא תקין" }, { status: 400 });
  }
}
