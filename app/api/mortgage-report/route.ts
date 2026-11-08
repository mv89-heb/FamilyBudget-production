import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getIsraelMonth, monthRange } from "@/lib/financial-engine";
import { getFinancialSourceOfTruth, monthBefore } from "@/lib/financial-source";
import { calculateDebtToIncomeRatio, calculateMortgageMonthlyFlows } from "@/lib/mortgage-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const month = getIsraelMonth();
    const currentRange = monthRange(month);
    const monthKeys = [monthBefore(month, 3), monthBefore(month, 2), monthBefore(month, 1)];
    const historyStart = monthRange(monthKeys[0]).start;

    const [financial, transactions, incomeSources, liabilityRows] = await Promise.all([
      getFinancialSourceOfTruth(user.id, month),
      prisma.transaction.findMany({
        where: { userId: user.id, transactionDate: { gte: historyStart, lt: currentRange.start } },
        select: {
          type: true, kind: true, amount: true, transactionDate: true, note: true,
          category: { select: { name: true } },
        },
        orderBy: { transactionDate: "asc" },
      }),
      prisma.incomeSource.findMany({
        where: { userId: user.id, active: true },
        select: { id: true, name: true, type: true, monthlyAmount: true },
        orderBy: { name: "asc" },
      }),
      prisma.liability.findMany({
        where: { userId: user.id, active: true },
        select: { id: true, name: true, type: true, currentBalance: true, monthlyPayment: true, interestRate: true, loanId: true },
        orderBy: { name: "asc" },
      }),
    ]);

    const cashFlow = calculateMortgageMonthlyFlows(
      transactions.map((row) => ({ ...row, amount: Number(row.amount) })),
      monthKeys,
    );
    const manuallyTrackedLoanIds = new Set(financial.loans.filter((loan) => loan.source === "MANUAL").map((loan) => loan.id));
    const standaloneLiabilities = liabilityRows
      .filter((row) => !row.loanId || !manuallyTrackedLoanIds.has(row.loanId))
      .map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        outstandingAmount: Number(row.currentBalance),
        monthlyPayment: row.monthlyPayment == null ? null : Number(row.monthlyPayment),
        interestRate: row.interestRate == null ? null : Number(row.interestRate),
        source: "LIABILITY" as const,
      }));

    const obligations = [
      ...financial.loans.map((loan) => ({
        id: loan.id,
        name: loan.name,
        type: loan.source === "INFERRED" ? "INFERRED_LOAN" : "LOAN",
        outstandingAmount: loan.outstandingAmount,
        monthlyPayment: loan.monthlyPayment,
        interestRate: loan.interestRate,
        source: loan.source,
        startDate: loan.startDate,
        endDate: loan.endDate,
      })),
      ...standaloneLiabilities,
    ];

    const declaredMonthlyIncome = incomeSources.reduce((sum, row) => sum + Number(row.monthlyAmount), 0);
    const knownMonthlyDebtPayments = obligations
      .filter((row) => row.source !== "INFERRED")
      .reduce((sum, row) => sum + (row.monthlyPayment ?? 0), 0);
    const knownOutstandingDebt = obligations
      .filter((row) => row.source !== "INFERRED" && row.outstandingAmount != null)
      .reduce((sum, row) => sum + (row.outstandingAmount ?? 0), 0);
    const actualDebtToIncome = calculateDebtToIncomeRatio(cashFlow.averages.debtPayments, cashFlow.averages.income);
    const declaredDebtToIncome = calculateDebtToIncomeRatio(knownMonthlyDebtPayments, declaredMonthlyIncome);
    const missing = {
      declaredIncome: incomeSources.length === 0,
      unknownBalances: obligations.filter((row) => row.outstandingAmount == null).length,
      unknownPayments: obligations.filter((row) => row.source !== "INFERRED" && row.monthlyPayment == null).length,
      unknownRates: obligations.filter((row) => row.interestRate == null).length,
      inferredLoans: obligations.filter((row) => row.source === "INFERRED").length,
      assets: financial.assets.length === 0,
    };

    return NextResponse.json({
      asOf: new Date().toISOString(),
      month,
      historyMonths: monthKeys,
      cashFlow,
      incomeSources: incomeSources.map((row) => ({ ...row, monthlyAmount: Number(row.monthlyAmount) })),
      declaredMonthlyIncome,
      obligations,
      assets: financial.assets,
      standaloneLiabilities,
      summary: {
        knownOutstandingDebt: Math.round(knownOutstandingDebt * 100) / 100,
        knownMonthlyDebtPayments: Math.round(knownMonthlyDebtPayments * 100) / 100,
        actualDebtToIncome,
        declaredDebtToIncome,
        totalAssets: financial.netWorth.assets,
        totalLiabilities: financial.netWorth.liabilities,
        netWorth: financial.netWorth.netWorth,
        currentMonthIncome: financial.ledger.income,
        currentMonthOperatingExpenses: financial.ledger.operatingExpense,
        currentMonthDebtPrincipal: financial.ledger.debtPrincipal,
        currentMonthDebtInterest: financial.ledger.debtInterest,
      },
      missing,
      notes: [
        "יתרות חוב ידועות כוללות רק יתרות שהוזנו במפורש; הלוואות שזוהו מתנועות אינן מקבלות יתרת קרן משוערת.",
        "חיוב כרטיס אשראי אינו נספר שוב כהוצאה, כדי למנוע ספירה כפולה של רכישות שכבר מופיעות בפירוט הכרטיס.",
        "יחס החזר להכנסה לפי תנועות מבוסס על ממוצע של שלושת החודשים המלאים האחרונים; היחס לפי נתונים מוצהרים מבוסס על מקורות הכנסה והחזרים שהוזנו.",
      ],
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    }
    console.error("Mortgage advisor report failed", error);
    return NextResponse.json({ error: "לא ניתן להפיק תמונת מצב ליועץ המשכנתאות" }, { status: 500 });
  }
}
