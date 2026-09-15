import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { classifyTransactionPresentation } from "@/lib/category-classifier";
import { forecastMonths } from "@/lib/financial-control";

function monthKey(date: Date) { return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`; }
function addMonths(date: Date, count: number) { return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1)); }

export async function GET() {
  try {
    const user = await requireUser();
    const now = new Date();
    const currentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const start = addMonths(currentMonth, -3);
    const transactions = await prisma.transaction.findMany({ where: { userId: user.id, transactionDate: { gte: start } }, select: { type: true, kind: true, amount: true, transactionDate: true, category: { select: { name: true } }, note: true } });
    const expensesByMonth = new Map<string, number>();
    for (const row of transactions) {
      if (row.type !== "EXPENSE" || (row.kind !== "STANDARD" && row.kind !== "LOAN_INTEREST")) continue;
      const presentation = classifyTransactionPresentation(row.category.name, row.note);
      if (presentation.isSavings || presentation.isDebt || presentation.isCreditCardPayment) continue;
      const key = monthKey(row.transactionDate);
      expensesByMonth.set(key, (expensesByMonth.get(key) ?? 0) + Number(row.amount));
    }
    const expenseValues = [...expensesByMonth.values()];
    const averageExpenses = expenseValues.length ? expenseValues.reduce((a, b) => a + b, 0) / expenseValues.length : 0;
    const incomeSources = await prisma.incomeSource.findMany({ where: { userId: user.id, active: true }, select: { monthlyAmount: true } });
    const recurringIncome = incomeSources.reduce((sum, row) => sum + Number(row.monthlyAmount), 0);
    const funds = await prisma.sinkingFund.findMany({ where: { userId: user.id, active: true }, select: { name: true, monthlyContribution: true, dueDate: true, targetAmount: true, currentAmount: true } });
    const baseContributions = funds.reduce((sum, row) => sum + Number(row.monthlyContribution), 0);
    const months = Array.from({ length: 6 }, (_, index) => addMonths(currentMonth, index + 1));
    const rows = forecastMonths(months.map((date) => ({ month: monthKey(date), recurringIncome, recurringExpenses: averageExpenses, sinkingContributions: baseContributions })));
    return NextResponse.json({ rows, assumptions: { recurringIncome, averageExpenses, sinkingContributions: baseContributions }, sinkingFunds: funds });
  } catch { return NextResponse.json({ error: "לא מורשה" }, { status: 401 }); }
}
