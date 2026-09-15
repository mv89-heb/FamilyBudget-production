import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { budgetSchema, monthSchema } from "@/lib/validation";
import { getIsraelMonth, monthRange } from "@/lib/financial-engine";
import { calculateBudgetSpending, calculateBudgetStatus } from "@/lib/ledger-engine";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const param = new URL(req.url).searchParams.get("month");
    const month = monthSchema.parse(param || getIsraelMonth());
    const { start, end } = monthRange(month);

    const [budgets, expenses] = await Promise.all([
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
    ]);

    const spending = calculateBudgetSpending(expenses.map((transaction) => ({
      type: transaction.type,
      kind: transaction.kind,
      amount: Number(transaction.amount),
      categoryId: transaction.categoryId,
    })));

    return NextResponse.json(budgets.map((budget) => ({
      id: budget.id,
      categoryId: budget.categoryId,
      categoryName: budget.category.name,
      class: budget.class,
      ...calculateBudgetStatus(budget.limit, spending.get(budget.categoryId) || 0),
    })));
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
