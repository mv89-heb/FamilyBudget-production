import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

const schema = z.object({ kind: z.enum(["asset", "liability"]), name: z.string().trim().min(1).max(120), value: z.number().finite().nonnegative(), active: z.boolean().optional() });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const input = schema.parse(await req.json());
    if (input.kind === "asset") {
      const row = await prisma.asset.updateMany({ where: { id, userId: user.id }, data: { name: input.name, currentValue: input.value, ...(input.active === undefined ? {} : { active: input.active }) } });
      if (!row.count) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
    } else {
      const row = await prisma.liability.updateMany({ where: { id, userId: user.id }, data: { name: input.name, currentBalance: input.value, ...(input.active === undefined ? {} : { active: input.active }) } });
      if (!row.count) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "לא ניתן לעדכן" }, { status: 400 }); }
}
