import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { paymentMethodSchema } from "@/lib/validation";
import { PaymentMethodType } from "@prisma/client";

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const input = paymentMethodSchema.parse(await req.json());
    const existing = await prisma.paymentMethod.findFirst({ where: { id, userId: user.id } });
    if (!existing) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

    const row = await prisma.paymentMethod.update({
      where: { id },
      data: {
        type: input.type as PaymentMethodType,
        nickname: input.nickname,
        institution: input.institution || null,
        last4: input.last4 || null,
      },
    });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "לא ניתן לעדכן" }, { status: 400 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const existing = await prisma.paymentMethod.findFirst({ where: { id, userId: user.id } });
    if (!existing) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
    await prisma.paymentMethod.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "לא ניתן למחוק" }, { status: 400 });
  }
}
