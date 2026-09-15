import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { calculateNetWorth } from "@/lib/financial-control";

const assetSchema = z.object({ name: z.string().trim().min(1).max(120), type: z.enum(["BANK_ACCOUNT","CASH","SAVINGS","DEPOSIT","INVESTMENT","PENSION","TRAINING_FUND","VEHICLE","PROPERTY","OTHER"]), currentValue: z.number().finite().nonnegative() });
const liabilitySchema = z.object({ name: z.string().trim().min(1).max(120), type: z.enum(["MORTGAGE","LOAN","CREDIT_CARD","OTHER"]), currentBalance: z.number().finite().nonnegative(), interestRate: z.number().finite().nonnegative().optional(), monthlyPayment: z.number().finite().nonnegative().optional(), loanId: z.string().optional() });

export async function GET() {
  try {
    const user = await requireUser();
    const [assets, liabilities, snapshots] = await Promise.all([
      prisma.asset.findMany({ where: { userId: user.id, active: true }, orderBy: { name: "asc" } }),
      prisma.liability.findMany({ where: { userId: user.id, active: true }, orderBy: { name: "asc" } }),
      prisma.netWorthSnapshot.findMany({ where: { userId: user.id }, orderBy: { snapshotDate: "desc" }, take: 12 }),
    ]);
    const summary = calculateNetWorth(assets.map((row) => Number(row.currentValue)), liabilities.map((row) => Number(row.currentBalance)));
    return NextResponse.json({ assets, liabilities, snapshots, summary });
  } catch { return NextResponse.json({ error: "לא מורשה" }, { status: 401 }); }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json();
    if (body?.kind === "asset") {
      const input = assetSchema.parse(body);
      return NextResponse.json(await prisma.asset.create({ data: { ...input, userId: user.id } }), { status: 201 });
    }
    if (body?.kind === "liability") {
      const input = liabilitySchema.parse(body);
      return NextResponse.json(await prisma.liability.create({ data: { ...input, userId: user.id } }), { status: 201 });
    }
    if (body?.kind === "snapshot") {
      const rows = await Promise.all([
        prisma.asset.findMany({ where: { userId: user.id, active: true }, select: { currentValue: true } }),
        prisma.liability.findMany({ where: { userId: user.id, active: true }, select: { currentBalance: true } }),
      ]);
      const summary = calculateNetWorth(rows[0].map((r) => Number(r.currentValue)), rows[1].map((r) => Number(r.currentBalance)));
      const date = body.snapshotDate ? new Date(body.snapshotDate) : new Date();
      const snapshot = await prisma.netWorthSnapshot.upsert({ where: { userId_snapshotDate: { userId: user.id, snapshotDate: date } }, create: { userId: user.id, snapshotDate: date, ...summary }, update: summary });
      return NextResponse.json(snapshot, { status: 201 });
    }
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  } catch (error) { return NextResponse.json({ error: error instanceof z.ZodError ? "נתונים לא תקינים" : "לא ניתן לשמור" }, { status: 400 }); }
}
