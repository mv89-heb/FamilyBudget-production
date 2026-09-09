import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { paymentMethodSchema } from "@/lib/validation";
import { PaymentMethodType } from "@prisma/client";

export async function GET() {
  try {
    const user = await requireUser();
    const rows = await prisma.paymentMethod.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const input = paymentMethodSchema.parse(await req.json());

    if ((input.type === "CARD" || input.type === "BANK_ACCOUNT") && !input.last4) {
      return NextResponse.json({ error: "נדרשות 4 ספרות אחרונות" }, { status: 400 });
    }

    const row = await prisma.paymentMethod.create({
      data: {
        userId: user.id,
        type: input.type as PaymentMethodType,
        nickname: input.nickname,
        institution: input.institution || null,
        last4: input.last4 || null,
      },
    });
    return NextResponse.json(row, { status: 201 });
  } catch {
    return NextResponse.json({ error: "לא ניתן ליצור אמצעי תשלום" }, { status: 400 });
  }
}
