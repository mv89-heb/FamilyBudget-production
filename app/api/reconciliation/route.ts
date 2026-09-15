import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { calculateLedgerSummary, roundMoney } from "@/lib/ledger-engine";
import { calculateReconciliationDifference } from "@/lib/financial-control";

const schema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), openingBalance: z.number().finite(), bankBalance: z.number().finite(), notes: z.string().max(1000).optional() });

function range(month: string) {
  const [year, m] = month.split("-").map(Number);
  return { start: new Date(Date.UTC(year, m - 1, 1)), end: new Date(Date.UTC(year, m, 1)) };
}

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json(await prisma.bankReconciliation.findMany({ where: { userId: user.id }, orderBy: { month: "desc" }, take: 12 }));
  } catch { return NextResponse.json({ error: "לא מורשה" }, { status: 401 }); }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const input = schema.parse(await req.json());
    const { start, end } = range(input.month);
    const transactions = await prisma.transaction.findMany({ where: { userId: user.id, transactionDate: { gte: start, lt: end } }, select: { type: true, kind: true, amount: true, transactionDate: true, categoryId: true, category: { select: { name: true } } } });
    const summary = calculateLedgerSummary(transactions.map((row) => ({ ...row, amount: Number(row.amount), categoryName: row.category.name })));
    const ledgerBalance = roundMoney(input.openingBalance + summary.netCashFlow);
    const difference = calculateReconciliationDifference(ledgerBalance, input.bankBalance);
    const status = Math.abs(difference) < 0.01 ? "RECONCILED" : "OPEN";
    const month = start;
    const row = await prisma.bankReconciliation.upsert({ where: { userId_month: { userId: user.id, month } }, create: { userId: user.id, month, ledgerBalance, bankBalance: input.bankBalance, difference, status, notes: input.notes, reconciledAt: status === "RECONCILED" ? new Date() : null }, update: { ledgerBalance, bankBalance: input.bankBalance, difference, status, notes: input.notes, reconciledAt: status === "RECONCILED" ? new Date() : null } });
    return NextResponse.json({ reconciliation: row, summary, transactionCount: transactions.length });
  } catch (error) { return NextResponse.json({ error: error instanceof z.ZodError ? "נתוני התאמה לא תקינים" : "לא ניתן לבצע התאמה" }, { status: 400 }); }
}
