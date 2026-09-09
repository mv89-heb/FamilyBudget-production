import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { transactionSchema } from "@/lib/validation";
import { TransactionType } from "@prisma/client";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month");
    const where: any = { userId: user.id };
    if (month && /^\\d{4}-\\d{2}$/.test(month)) {
      const start = new Date(`${month}-01T00:00:00.000Z`);
      const end = new Date(start);
      end.setUTCMonth(end.getUTCMonth() + 1);
      where.transactionDate = { gte: start, lt: end };
    }
    const rows = await prisma.transaction.findMany({
      where,
      include: { category: true, paymentMethod: true },
      orderBy: { transactionDate: "desc" },
      take: 500,
    });
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const input = transactionSchema.parse(await req.json());

    const category = await prisma.category.findFirst({
      where: { id: input.categoryId, userId: user.id, type: input.type as TransactionType },
    });
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
        transactionDate: new Date(input.transactionDate),
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
