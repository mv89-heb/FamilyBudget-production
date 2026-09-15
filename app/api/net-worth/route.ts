import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getFinancialSourceOfTruth } from "@/lib/financial-source";
import { calculateNetWorth } from "@/lib/financial-control";

const assetSchema = z.object({ name: z.string().trim().min(1).max(120), type: z.enum(["BANK_ACCOUNT","CASH","SAVINGS","DEPOSIT","INVESTMENT","PENSION","TRAINING_FUND","VEHICLE","PROPERTY","OTHER"]), currentValue: z.number().finite().nonnegative() });
const liabilitySchema = z.object({ name: z.string().trim().min(1).max(120), type: z.enum(["MORTGAGE","LOAN","CREDIT_CARD","OTHER"]), currentBalance: z.number().finite().nonnegative(), interestRate: z.number().finite().nonnegative().optional(), monthlyPayment: z.number().finite().nonnegative().optional(), loanId: z.string().optional() });

export async function GET() {
  try {
    const user = await requireUser();
    const [financial, snapshots] = await Promise.all([
      getFinancialSourceOfTruth(user.id),
      prisma.netWorthSnapshot.findMany({ where: { userId: user.id }, orderBy: { snapshotDate: "desc" }, take: 12 }),
    ]);
    return NextResponse.json({ assets: financial.assets, liabilities: financial.liabilities, snapshots, summary: financial.netWorth, debts: financial.debts });
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
      if (input.loanId) {
        const loan = await prisma.loan.findFirst({ where: { id: input.loanId, userId: user.id }, select: { id: true } });
        if (!loan) return NextResponse.json({ error: "הלוואה לא תקינה" }, { status: 400 });
      }
      return NextResponse.json(await prisma.liability.create({ data: { ...input, userId: user.id } }), { status: 201 });
    }
    if (body?.kind === "snapshot") {
      const financial = await getFinancialSourceOfTruth(user.id);
      const date = body.snapshotDate ? new Date(body.snapshotDate) : new Date();
      const snapshot = await prisma.netWorthSnapshot.upsert({ where: { userId_snapshotDate: { userId: user.id, snapshotDate: date } }, create: { userId: user.id, snapshotDate: date, ...financial.netWorth }, update: financial.netWorth });
      return NextResponse.json(snapshot, { status: 201 });
    }
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  } catch (error) { return NextResponse.json({ error: error instanceof z.ZodError ? "נתונים לא תקינים" : "לא ניתן לשמור" }, { status: 400 }); }
}
