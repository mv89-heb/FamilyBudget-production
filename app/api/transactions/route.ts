import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { transactionSchema, monthSchema } from "@/lib/validation";
import { TransactionType } from "@prisma/client";

function monthRange(month: string) {
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const monthParam = new URL(req.url).searchParams.get("month");
    const month = monthParam || new Date().toISOString().slice(0, 7);

    if (month === "all") {
      const rows = await prisma.transaction.findMany({
        where: { userId: user.id },
        include: { category: true, paymentMethod: true },
        orderBy: { transactionDate: "desc" },
        take: 500,
      });
      return NextResponse.json(rows);
    }

    const validMonth = monthSchema.parse(month);
    const { start, end } = monthRange(validMonth);
    const rows = await prisma.transaction.findMany({
      where: { userId: user.id, transactionDate: { gte: start, lt: end } },
      include: { category: true, paymentMethod: true },
      orderBy: { transactionDate: "desc" },
      take: 500,
    });
    return NextResponse.json(rows);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    return NextResponse.json({ error: "לא ניתן לטעון תנועות" }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const input = transactionSchema.parse(await req.json());
    const category = await prisma.category.findFirst({ where: { id: input.categoryId, userId: user.id, type: input.type as TransactionType } });
    if (!category) return NextResponse.json({ error: "קטגוריה לא תקינה" }, { status: 400 });

    if (input.paymentMethodId) {
      const method = await prisma.paymentMethod.findFirst({ where: { id: input.paymentMethodId, userId: user.id } });
      if (!method) return NextResponse.json({ error: "אמצעי תשלום לא תקין" }, { status: 400 });
    }

    const row = await prisma.transaction.create({
      data: {
        userId: user.id,
        type: input.type,
        amount: input.amount,
        transactionDate: new Date(`${input.transactionDate}T00:00:00.000Z`),
        categoryId: input.categoryId,
        paymentMethodId: input.paymentMethodId || null,
        note: input.note || null,
      },
      include: { category: true, paymentMethod: true },
    });
    return NextResponse.json(row, { status: 201 });
  } catch {
    return NextResponse.json({ error: "לא ניתן ליצור תנועה" }, { status: 400 });
  }
}
