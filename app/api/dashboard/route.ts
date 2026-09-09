import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { monthSchema } from "@/lib/validation";

function monthRange(month: string) {
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const param = new URL(req.url).searchParams.get("month");
    const month = monthSchema.parse(param || new Date().toISOString().slice(0, 7));
    const { start, end } = monthRange(month);

    const [rows, totals, categoryRows, categories] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId: user.id, transactionDate: { gte: start, lt: end } },
        include: { category: true, paymentMethod: true },
        orderBy: { transactionDate: "desc" }, take: 20,
      }),
      prisma.transaction.groupBy({
        by: ["type"], where: { userId: user.id, transactionDate: { gte: start, lt: end } }, _sum: { amount: true },
      }),
      prisma.transaction.groupBy({
        by: ["categoryId"], where: { userId: user.id, type: "EXPENSE", transactionDate: { gte: start, lt: end } }, _sum: { amount: true },
      }),
      prisma.category.findMany({ where: { userId: user.id, type: "EXPENSE" }, select: { id: true, name: true } }),
    ]);

    const names = new Map(categories.map(c => [c.id, c.name]));
    const income = Number(totals.find(x => x.type === "INCOME")?._sum.amount || 0);
    const expense = Number(totals.find(x => x.type === "EXPENSE")?._sum.amount || 0);
    const byCategory = categoryRows.map(x => ({ name: names.get(x.categoryId) || "אחר", amount: Number(x._sum.amount || 0) })).sort((a, b) => b.amount - a.amount);

    return NextResponse.json({
      month, income, expense, balance: income - expense, byCategory,
      recent: rows.map(r => ({
        id: r.id, type: r.type, amount: Number(r.amount), date: r.transactionDate.toISOString(),
        category: r.category.name,
        paymentMethod: r.paymentMethod ? `${r.paymentMethod.nickname}${r.paymentMethod.last4 ? ` •••• ${r.paymentMethod.last4}` : ""}` : null,
        note: r.note,
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    return NextResponse.json({ error: "חודש לא תקין" }, { status: 400 });
  }
}
