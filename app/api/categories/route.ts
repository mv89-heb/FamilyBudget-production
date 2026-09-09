import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { categorySchema } from "@/lib/validation";
import { TransactionType } from "@prisma/client";

export async function GET() {
  try {
    const user = await requireUser();
    const rows = await prisma.category.findMany({ where: { userId: user.id }, orderBy: [{ type: "asc" }, { name: "asc" }] });
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const input = categorySchema.parse(await req.json());
    const row = await prisma.category.create({
      data: { userId: user.id, name: input.name, type: input.type as TransactionType },
    });
    return NextResponse.json(row, { status: 201 });
  } catch {
    return NextResponse.json({ error: "לא ניתן ליצור קטגוריה" }, { status: 400 });
  }
}
