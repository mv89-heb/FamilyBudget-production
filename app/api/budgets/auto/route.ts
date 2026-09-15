import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getIsraelMonth, monthRange } from "@/lib/financial-engine";
import { calculateAutoBudgets } from "@/lib/ledger-engine";
import { monthSchema } from "@/lib/validation";

function monthBefore(month: string, count: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 - count, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const month = monthSchema.parse(body?.month || getIsraelMonth());
    const targetStart = monthRange(month).start;
    const historyStart = monthRange(monthBefore(month, 3)).start;

    const [categories, transactions, existingBudgets] = await Promise.all([
      prisma.category.findMany({ where: { userId: user.id, type: "EXPENSE" }, select: { id: true, name: true } }),
      prisma.transaction.findMany({
        where: { userId: user.id, transactionDate: { gte: historyStart, lt: targetStart } },
        select: { type: true, kind: true, amount: true, transactionDate: true, categoryId: true, note: true, category: { select: { name: true } } },
      }),
      prisma.budget.findMany({ where: { userId: user.id, month: targetStart }, select: { categoryId: true } }),
    ]);

    const existingIds = new Set(existingBudgets.map((budget) => budget.categoryId));
    const suggestions = calculateAutoBudgets(
      transactions.map((transaction) => ({
        type: transaction.type,
        kind: transaction.kind,
        amount: Number(transaction.amount),
        transactionDate: transaction.transactionDate,
        categoryId: transaction.categoryId,
        categoryName: transaction.category?.name,
        note: transaction.note,
      })),
      categories.map((category) => ({ categoryId: category.id, categoryName: category.name })),
      month,
      { safetyBufferPercent: 5 },
    ).filter((suggestion) => !existingIds.has(suggestion.categoryId));

    if (suggestions.length > 0) {
      await prisma.budget.createMany({
        data: suggestions.map((suggestion) => ({
          userId: user.id,
          categoryId: suggestion.categoryId,
          month: targetStart,
          limit: suggestion.limit,
          class: suggestion.class,
        })),
        skipDuplicates: true,
      });
    }

    return NextResponse.json({
      month,
      created: suggestions.length,
      budgets: suggestions,
      rule: "ממוצע שלושת החודשים הקלנדריים הקודמים + 5% מרווח ביטחון; מסגרות קיימות אינן נדרסות.",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    return NextResponse.json({ error: "לא ניתן ליצור מסגרות אוטומטיות" }, { status: 400 });
  }
}
