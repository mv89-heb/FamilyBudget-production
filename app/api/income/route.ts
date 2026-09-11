import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(["SALARY", "BENEFIT", "ADDITIONAL"]),
  monthlyAmount: z.coerce.number().positive().max(999999999),
});

export async function GET() { try { const user = await requireUser(); return NextResponse.json(await prisma.incomeSource.findMany({ where: { userId: user.id }, orderBy: [{ active: "desc" }, { name: "asc" }] })); } catch { return NextResponse.json({ error: "לא ניתן לטעון הכנסות" }, { status: 400 }); } }
export async function POST(req: Request) { try { const user = await requireUser(); const input = schema.parse(await req.json()); return NextResponse.json(await prisma.incomeSource.create({ data: { userId: user.id, ...input } }), { status: 201 }); } catch { return NextResponse.json({ error: "נתוני ההכנסה אינם תקינים" }, { status: 400 }); } }
export async function PATCH(req: Request) { try { const user = await requireUser(); const body = await req.json(); const id = z.string().cuid().parse(body.id); const input = schema.partial().extend({ active: z.boolean().optional() }).parse(body); delete (input as Record<string, unknown>).id; return NextResponse.json(await prisma.incomeSource.updateMany({ where: { id, userId: user.id }, data: input })); } catch { return NextResponse.json({ error: "לא ניתן לעדכן הכנסה" }, { status: 400 }); } }
export async function DELETE(req: Request) { try { const user = await requireUser(); const id = z.string().cuid().parse(new URL(req.url).searchParams.get("id")); await prisma.incomeSource.deleteMany({ where: { id, userId: user.id } }); return NextResponse.json({ ok: true }); } catch { return NextResponse.json({ error: "לא ניתן למחוק הכנסה" }, { status: 400 }); } }
