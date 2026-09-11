import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

const schema = z.object({ householdSize: z.coerce.number().int().min(1).max(20) });

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json({ householdSize: user.householdSize });
  } catch {
    return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    const input = schema.parse(await req.json());
    const updated = await prisma.user.update({ where: { id: user.id }, data: { householdSize: input.householdSize }, select: { householdSize: true } });
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    return NextResponse.json({ error: "מספר נפשות לא תקין" }, { status: 400 });
  }
}
