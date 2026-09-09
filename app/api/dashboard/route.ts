import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const month = new URL(req.url).searchParams.get("month") || new Date().toISOString().slice(0, 7);
    if (!/^\\d{4}-\\d{2}$/.test(month)) return NextResponse.json({ error: "חודש לא תקין" }, { status: 400 });

    const start = new Date(`${month}-01T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);

    const rows = await prisma.transaction.findMany({
      where: { userId: user.id, transactionDate: { gte: start, lt: end } },
      include: { category: true, paymentMethod: true },
      orderBy: { transactionDate: "desc" },
      take: 20,
    });

    const totals = await prisma.transaction.groupBy({
      by: ["type"],
      where: { userId: user.id, transactionDate: { gte: start, lt: end } },
      _sum: { amount: true },
    });

    const categoryRows = await prisma.transaction.groupBy({
      by: ["categoryId"],
      where: { userId: user.id, type: "EXPENSE", transactionDate: { gte: start, lt: end } },
      _sum: { amount: true },
    });

    const categories = await prisma.category.findMany({
      where: { userId: user.id, type: "EXPENSE" },
      select: { id: true, name: true },
    });
    const names = new Map(categories.map(c => [c.id, c.name]));
    const byCategory = categoryRows.map(x => ({ name: names.get(x.categoryId) || "אחר", amount: Number(x._sum.amount || 0) }))
      .sort((a,b) => b.amount - a.amount);

    const income = Number(totals.find(x => x.type === "INCOME")?._sum.amount || 0);
    const expense = Number(totals.find(x => x.type === "EXPENSE")?._sum.amount || 0);

    return NextResponse.json({
      month, income, expense, balance: income - expense,
      byCategory,
      recent: rows.map(r => ({
        id: r.id, type: r.type, amount: Number(r.amount), date: r.transactionDate.toISOString(),
        category: r.category.name, paymentMethod: r.paymentMethod ? `${r.paymentMethod.nickname}${r.paymentMethod.last4 ? ` •••• ${r.paymentMethod.last4}` : ""}` : null,
        note: r.note,
      })),
    });
  } catch {
    return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
  }
}
