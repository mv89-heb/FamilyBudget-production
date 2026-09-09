import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { budgetSchema } from "@/lib/validation";

function monthDate(value: string) {
  return new Date(`${value}-01T00:00:00.000Z`);
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const month = new URL(req.url).searchParams.get("month") || new Date().toISOString().slice(0, 7);
    const start = monthDate(month);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);

    const budgets = await prisma.budget.findMany({ where: { userId: user.id, month: start }, include: { category: true } });
    const expenses = await prisma.transaction.groupBy({
      by: ["categoryId"],
      where: { userId: user.id, type: "EXPENSE", transactionDate: { gte: start, lt: end } },
      _sum: { amount: true },
    });
    const spent = new Map(expenses.map(x => [x.categoryId, Number(x._sum.amount || 0)]));
    return NextResponse.json(budgets.map(b => ({
      id: b.id, categoryId: b.categoryId, categoryName: b.category.name,
      limit: Number(b.limit), spent: spent.get(b.categoryId) || 0,
      percent: b.limit.toNumber() ? Math.min(100, ((spent.get(b.categoryId) || 0) / b.limit.toNumber()) * 100) : 0,
    })));
  } catch {
    return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const input = budgetSchema.parse(await req.json());
    const category = await prisma.category.findFirst({ where: { id: input.categoryId, userId: user.id, type: "EXPENSE" } });
    if (!category) return NextResponse.json({ error: "קטגוריה לא תקינה" }, { status: 400 });

    const row = await prisma.budget.upsert({
      where: { userId_categoryId_month: { userId: user.id, categoryId: input.categoryId, month: monthDate(input.month) } },
      update: { limit: input.limit },
      create: { userId: user.id, categoryId: input.categoryId, month: monthDate(input.month), limit: input.limit },
    });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "לא ניתן לשמור תקציב" }, { status: 400 });
  }
}
