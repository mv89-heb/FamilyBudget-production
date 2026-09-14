import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { budgetSchema, monthSchema } from "@/lib/validation";
import { getIsraelMonth, monthRange, isOperatingExpense } from "@/lib/financial-engine";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const param = new URL(req.url).searchParams.get("month");
    const month = monthSchema.parse(param || getIsraelMonth());
    const { start, end } = monthRange(month);
    const [budgets, expenses, creditCardExpenses] = await Promise.all([
      prisma.budget.findMany({ where: { userId: user.id, month: start }, include: { category: true } }),
      prisma.transaction.findMany({
        where: {
          userId: user.id,
          transactionDate: { gte: start, lt: end },
          OR: [
            { type: "EXPENSE", kind: { in: ["STANDARD", "LOAN_INTEREST"] } },
            { type: "INCOME", kind: "REFUND" },
          ],
        },
        select: { categoryId: true, type: true, kind: true, amount: true },
      }),
      prisma.creditCardTransaction.findMany({
        where: {
          userId: user.id,
          purchaseDate: { gte: start, lt: end },
          type: { in: ["CHARGE", "REFUND"] },
        },
        select: { categoryId: true, type: true, amount: true },
      }),
    ]);

    const spent = new Map<string, number>();
    for (const transaction of expenses) {
      const amount = Number(transaction.amount);
      const current = spent.get(transaction.categoryId) || 0;
      const normalized = { type: transaction.type, kind: transaction.kind, amount, categoryId: transaction.categoryId };
      if (isOperatingExpense(normalized)) spent.set(transaction.categoryId, current + amount);
      else if (transaction.type === "INCOME" && transaction.kind === "REFUND") spent.set(transaction.categoryId, current - amount);
    }
    for (const transaction of creditCardExpenses) {
      if (!transaction.categoryId) continue;
      const amount = Number(transaction.amount);
      const current = spent.get(transaction.categoryId) || 0;
      spent.set(transaction.categoryId, current + (transaction.type === "REFUND" ? -amount : amount));
    }

    return NextResponse.json(budgets.map((budget) => {
      const limit = Number(budget.limit);
      const amount = spent.get(budget.categoryId) || 0;
      const remaining = limit - amount;
      const percent = limit > 0 ? (amount / limit) * 100 : 0;
      return {
        id: budget.id,
        categoryId: budget.categoryId,
        categoryName: budget.category.name,
        limit,
        class: budget.class,
        spent: amount,
        remaining,
        percent,
        progressPercent: Math.min(100, Math.max(0, percent)),
        overBudget: amount > limit,
      };
    }));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    return NextResponse.json({ error: "חודש לא תקין" }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const input = budgetSchema.parse(await req.json());
    const category = await prisma.category.findFirst({ where: { id: input.categoryId, userId: user.id, type: "EXPENSE" } });
    if (!category) return NextResponse.json({ error: "קטגוריה לא תקינה" }, { status: 400 });
    const month = monthRange(input.month).start;
    const row = await prisma.budget.upsert({
      where: { userId_categoryId_month: { userId: user.id, categoryId: input.categoryId, month } },
      update: { limit: input.limit, class: input.class },
      create: { userId: user.id, categoryId: input.categoryId, month, limit: input.limit, class: input.class },
    });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "לא ניתן לשמור תקציב" }, { status: 400 });
  }
}
