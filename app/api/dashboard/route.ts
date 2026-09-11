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

function currentJerusalemMonth() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return year && month ? `${year}-${month}` : new Date().toISOString().slice(0, 7);
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const param = new URL(req.url).searchParams.get("month");
    const isAll = param === "all";
    const month = isAll ? "all" : monthSchema.parse(param || currentJerusalemMonth());
    const range = isAll ? null : monthRange(month);
    const dateFilter = range ? { transactionDate: { gte: range.start, lt: range.end } } : {};

    const [rows, totals, categoryRows, categories] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId: user.id, ...dateFilter },
        select: {
          id: true,
          type: true,
          amount: true,
          transactionDate: true,
          note: true,
          category: { select: { name: true } },
          paymentMethod: { select: { nickname: true, last4: true } },
        },
        orderBy: { transactionDate: "desc" },
        take: 8,
      }),
      prisma.transaction.groupBy({
        by: ["type"],
        where: { userId: user.id, ...dateFilter },
        _sum: { amount: true },
      }),
      prisma.transaction.groupBy({
        by: ["categoryId"],
        where: { userId: user.id, type: "EXPENSE", ...dateFilter },
        _sum: { amount: true },
      }),
      prisma.category.findMany({
        where: { userId: user.id, type: "EXPENSE" },
        select: { id: true, name: true },
      }),
    ]);

    const names = new Map(categories.map((category) => [category.id, category.name]));
    const income = Number(totals.find((row) => row.type === "INCOME")?._sum.amount || 0);
    const expense = Number(totals.find((row) => row.type === "EXPENSE")?._sum.amount || 0);
    const byCategory = categoryRows
      .map((row) => ({ name: names.get(row.categoryId) || "אחר", amount: Number(row._sum.amount || 0) }))
      .sort((a, b) => b.amount - a.amount);

    return NextResponse.json({
      month,
      income,
      expense,
      balance: income - expense,
      byCategory,
      recent: rows.map((row) => ({
        id: row.id,
        type: row.type,
        amount: Number(row.amount),
        date: row.transactionDate.toISOString(),
        category: row.category.name,
        paymentMethod: row.paymentMethod
          ? `${row.paymentMethod.nickname}${row.paymentMethod.last4 ? ` •••• ${row.paymentMethod.last4}` : ""}`
          : null,
        note: row.note,
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    return NextResponse.json({ error: "חודש לא תקין" }, { status: 400 });
  }
}
