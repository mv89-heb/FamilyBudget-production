import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { transactionSchema } from "@/lib/validation";
import { TransactionType } from "@prisma/client";

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const input = transactionSchema.parse(await req.json());

    const existing = await prisma.transaction.findFirst({ where: { id, userId: user.id } });
    if (!existing) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

    const category = await prisma.category.findFirst({
      where: { id: input.categoryId, userId: user.id, type: input.type as TransactionType },
    });
    if (!category) return NextResponse.json({ error: "קטגוריה לא תקינה" }, { status: 400 });

    if (input.paymentMethodId) {
      const method = await prisma.paymentMethod.findFirst({ where: { id: input.paymentMethodId, userId: user.id } });
      if (!method) return NextResponse.json({ error: "אמצעי תשלום לא תקין" }, { status: 400 });
    }

    const row = await prisma.transaction.update({
      where: { id },
      data: {
        type: input.type,
        amount: input.amount,
        transactionDate: new Date(input.transactionDate),
        categoryId: input.categoryId,
        paymentMethodId: input.paymentMethodId || null,
        note: input.note || null,
      },
      include: { category: true, paymentMethod: true },
    });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "לא ניתן לעדכן תנועה" }, { status: 400 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const existing = await prisma.transaction.findFirst({ where: { id, userId: user.id } });
    if (!existing) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
    await prisma.transaction.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "לא ניתן למחוק" }, { status: 400 });
  }
}
