import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { budgetSchema, monthSchema } from "@/lib/validation";

function monthDate(value: string) { return new Date(`${value}-01T00:00:00.000Z`); }
function monthRange(value: string) {
  const start = monthDate(value); const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1); return { start, end };
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const param = new URL(req.url).searchParams.get("month");
    const month = monthSchema.parse(param || new Date().toISOString().slice(0, 7));
    const { start, end } = monthRange(month);
    const [budgets, expenses] = await Promise.all([
      prisma.budget.findMany({ where: { userId: user.id, month: start }, include: { category: true } }),
      prisma.transaction.groupBy({ by: ["categoryId"], where: { userId: user.id, type: "EXPENSE", transactionDate: { gte: start, lt: end } }, _sum: { amount: true } }),
    ]);
    const spent = new Map(expenses.map(x => [x.categoryId, Number(x._sum.amount || 0)]));
    return NextResponse.json(budgets.map(b => {
      const limit = Number(b.limit); const amount = spent.get(b.categoryId) || 0;
      return { id: b.id, categoryId: b.categoryId, categoryName: b.category.name, limit, spent: amount, percent: limit > 0 ? Math.min(100, (amount / limit) * 100) : 0 };
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
    const row = await prisma.budget.upsert({
      where: { userId_categoryId_month: { userId: user.id, categoryId: input.categoryId, month: monthDate(input.month) } },
      update: { limit: input.limit },
      create: { userId: user.id, categoryId: input.categoryId, month: monthDate(input.month), limit: input.limit },
    });
    return NextResponse.json(row);
  } catch { return NextResponse.json({ error: "לא ניתן לשמור תקציב" }, { status: 400 }); }
}
