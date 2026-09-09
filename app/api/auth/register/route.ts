import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSession, hashPassword } from "@/lib/auth";
import { TransactionType } from "@prisma/client";

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(10).max(200),
});

const expenseCategories = ["דיור", "מזון", "תחבורה", "חשבונות", "בריאות", "חינוך", "בילויים", "אחר"];
const incomeCategories = ["משכורת", "הכנסה נוספת", "אחר"];

export async function POST(req: Request) {
  try {
    const input = schema.parse(await req.json());
    const email = input.email.toLowerCase();
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return NextResponse.json({ error: "כתובת האימייל כבר רשומה" }, { status: 409 });

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { name: input.name, email, passwordHash: await hashPassword(input.password) },
      });
      await tx.category.createMany({
        data: [
          ...expenseCategories.map(name => ({ userId: created.id, name, type: TransactionType.EXPENSE })),
          ...incomeCategories.map(name => ({ userId: created.id, name, type: TransactionType.INCOME })),
        ],
      });
      return created;
    });

    await createSession(user.id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "לא ניתן ליצור חשבון" }, { status: 400 });
  }
}
