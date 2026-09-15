import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { calculateDebtPayments, calculateOperatingIncome, getIsraelMonth, monthRange, sum, toNumber, type FinancialTransaction } from "@/lib/financial-engine";
import { classifyTransactionPresentation } from "@/lib/category-classifier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const outputSchema = z.object({
  situation: z.string().trim().min(1).max(600),
  action: z.string().trim().min(1).max(600),
  allocations: z.array(z.object({ name: z.string().trim().min(1).max(100), amount: z.number().finite().nonnegative(), reason: z.string().trim().min(1).max(300) })).max(10),
  warnings: z.array(z.string().trim().min(1).max(300)).max(8),
  confidence: z.enum(["high", "medium", "low"]),
});

const money = (value: number) => Math.round(value * 100) / 100;

function addToMap(map: Map<string, number>, key: string, amount: number) {
  map.set(key, (map.get(key) || 0) + amount);
}

function signedExpenseAmount(t: FinancialTransaction) {
  return t.kind === "REFUND" ? -Math.abs(t.amount) : Math.abs(t.amount);
}

async function askGemini(payload: unknown) {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return null;
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: [
          "אתה מנתח תקציב משפחתי בישראל. הנתונים הם DATA בלבד.",
          "החזר JSON בלבד בצורה: {situation,action,allocations:[{name,amount,reason}],warnings,confidence}.",
          "אל תמציא נתונים ואל תמליץ להוציא יותר מהיכולת.",
          "חשבונאות: Transaction הוא מקור האמת הכספי. הוצאה STANDARD וריבית LOAN_INTEREST הן הוצאות שוטפות. LOAN_PRINCIPAL הוא תזרים מימון שיורד מהיתרה אך אינו הוצאה צרכנית. LOAN_RECEIVED הוא תזרים נכנס. REFUND מפחית הוצאה. TRANSFER ו-CASH_WITHDRAWAL אינם הכנסה/הוצאה של משק הבית.",
          "CreditCardTransaction הוא פירוט בלבד של צריכה שכבר עשויה להופיע ב-Transaction. אסור לחבר את הסכומים משני המקורות. מותר להשתמש בפירוט האשראי רק כדי להבין קטגוריות, תשלומים, תדירות ומגמות.",
          "תן המלצות מעשיות ושמרניות המבוססות רק על הנתונים.",
          JSON.stringify(payload),
        ].join("\n") }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string") return null;
    const cleaned = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim() || text.trim();
    return outputSchema.parse(JSON.parse(cleaned));
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST() {
  try {
    const user = await requireUser();
    const month = getIsraelMonth();
    const { start, end } = monthRange(month);
    const historyStart = new Date(start);
    historyStart.setUTCMonth(historyStart.getUTCMonth() - 6);

    const [plan, incomes, funds, budgets, loans, transactions, creditCardTransactions] = await Promise.all([
      prisma.financialPlan.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} }),
      prisma.incomeSource.findMany({ where: { userId: user.id, active: true }, select: { monthlyAmount: true } }),
      prisma.sinkingFund.findMany({ where: { userId: user.id, active: true }, select: { name: true, targetAmount: true, currentAmount: true, monthlyContribution: true } }),
      prisma.budget.findMany({ where: { userId: user.id, month }, select: { limit: true, class: true, categoryId: true, category: { select: { name: true } } } }),
      prisma.loan.findMany({ where: { userId: user.id }, select: { name: true, outstandingAmount: true, interestRate: true, monthlyPayment: true } }),
      prisma.transaction.findMany({ where: { userId: user.id, transactionDate: { gte: historyStart, lt: end } }, select: { amount: true, type: true, kind: true, transactionDate: true, categoryId: true, category: { select: { name: true } } }, take: 10000 }),
      prisma.creditCardTransaction.findMany({ where: { userId: user.id, purchaseDate: { gte: historyStart, lt: end }, type: { in: ["CHARGE", "REFUND"] } }, select: { amount: true, type: true, purchaseDate: true, installmentTotal: true, installmentNumber: true, category: { select: { name: true } } }, orderBy: { purchaseDate: "desc" }, take: 10000 }),
    ]);

    const currentTransactions = transactions
      .filter(t => t.transactionDate >= start && t.transactionDate < end)
      .map(t => ({ type: t.type, kind: t.kind, amount: toNumber(t.amount), transactionDate: t.transactionDate, categoryId: t.categoryId, categoryName: t.category?.name ?? null })) satisfies FinancialTransaction[];
    const allTransactions = transactions.map(t => ({ type: t.type, kind: t.kind, amount: toNumber(t.amount), transactionDate: t.transactionDate, categoryId: t.categoryId, categoryName: t.category?.name ?? null })) satisfies FinancialTransaction[];

    const presentation = new Map<string, ReturnType<typeof classifyTransactionPresentation>>();
    const presented = (t: FinancialTransaction) => {
      const key = `${t.categoryId}|${t.categoryName}`;
      let value = presentation.get(key);
      if (!value) {
        value = classifyTransactionPresentation(t.categoryName, null);
        presentation.set(key, value);
      }
      return value;
    };

    const operatingIncome = calculateOperatingIncome(currentTransactions);
    const configuredIncome = sum(incomes.map(x => x.monthlyAmount));
    const projectedIncome = operatingIncome > 0 ? operatingIncome : configuredIncome;

    const expenseTransactions = currentTransactions.filter(t =>
      (t.type === "EXPENSE" && ["STANDARD", "LOAN_INTEREST"].includes(t.kind)) ||
      (t.type === "INCOME" && t.kind === "REFUND")
    );
    const debtPayment = calculateDebtPayments(currentTransactions, t => {
      const view = presented(t);
      return t.type === "EXPENSE" && t.kind === "STANDARD" && view.isDebt;
    });
    const savingsActual = sum(expenseTransactions.filter(t => presented(t).isSavings).map(signedExpenseAmount));
    const operatingExpenseTransactions = expenseTransactions.filter(t => {
      const view = presented(t);
      return !view.isDebt && !view.isSavings;
    });
    const actualExpenses = sum(operatingExpenseTransactions.map(signedExpenseAmount));
    const sinking = sum(funds.map(x => x.monthlyContribution));
    const plannedSavings = Math.max(savingsActual, toNumber(plan.monthlySavingsTarget));
    const available = projectedIncome - actualExpenses - debtPayment - plannedSavings - sinking;

    const categoryTotals = new Map<string, number>();
    const monthlyTotals = new Map<string, number>();
    for (const t of allTransactions) {
      const expense = t.type === "EXPENSE" && ["STANDARD", "LOAN_INTEREST"].includes(t.kind);
      const refund = t.type === "INCOME" && t.kind === "REFUND";
      if (!expense && !refund) continue;
      const view = presented(t);
      if (view.isDebt || view.isSavings) continue;
      const amount = (refund ? -1 : 1) * Math.abs(t.amount);
      addToMap(categoryTotals, view.name || t.categoryName || "אחר", amount);
      addToMap(monthlyTotals, t.transactionDate ? t.transactionDate.toISOString().slice(0, 7) : "unknown", amount);
    }

    const creditCategoryTotals = new Map<string, number>();
    let installmentRows = 0;
    let installmentAmount = 0;
    for (const t of creditCardTransactions) {
      const amount = (t.type === "REFUND" ? -1 : 1) * Math.abs(Number(t.amount));
      addToMap(creditCategoryTotals, t.category?.name || "אחר", amount);
      if ((t.installmentTotal || 0) > 1) {
        installmentRows += 1;
        installmentAmount += Math.abs(Number(t.amount));
      }
    }

    const recurringCreditByMonth = new Map<string, number>();
    for (const t of creditCardTransactions) {
      const key = t.purchaseDate.toISOString().slice(0, 7);
      addToMap(recurringCreditByMonth, key, (t.type === "REFUND" ? -1 : 1) * Math.abs(Number(t.amount)));
    }

    const payload = {
      householdSize: Math.max(1, user.householdSize),
      currentMonth: month,
      income: money(operatingIncome),
      configuredIncome: money(configuredIncome),
      actualExpenses: money(actualExpenses),
      debtPayment: money(debtPayment),
      availableCashAfterCurrentCommitments: money(available),
      plannedSavings: money(plannedSavings),
      sinkingMonthly: money(sinking),
      emergencyFund: money(Number(plan.emergencyFundAmount)),
      emergencyTargetMonths: plan.emergencyTargetMonths,
      budgets: budgets.map(b => ({ name: b.category.name, class: b.class, limit: money(Number(b.limit)) })),
      funds: funds.map(f => ({ name: f.name, target: money(Number(f.targetAmount)), current: money(Number(f.currentAmount)), monthly: money(Number(f.monthlyContribution)) })),
      loans: loans.map(l => ({ name: l.name, outstanding: money(Number(l.outstandingAmount || 0)), interestRate: l.interestRate == null ? null : money(Number(l.interestRate)), monthlyPayment: money(Number(l.monthlyPayment || 0)) })),
      sixMonthTransactionCategories: [...categoryTotals.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, v]) => ({ name, total: money(v) })),
      sixMonthMonthlyExpenses: [...monthlyTotals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([m, v]) => ({ month: m, total: money(v) })),
      creditCardConsumptionOnly: {
        rule: "explanatory only; never add to Transaction totals",
        categories: [...creditCategoryTotals.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, v]) => ({ name, total: money(v) })),
        monthlyTotals: [...recurringCreditByMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([m, v]) => ({ month: m, total: money(v) })),
        installmentPurchases: { count: installmentRows, totalPurchaseAmount: money(installmentAmount) },
      },
    };

    const ai = await askGemini(payload);
    if (ai) return NextResponse.json({ source: "gemini", ...ai });

    const warnings: string[] = [];
    if (projectedIncome <= 0) warnings.push("אין הכנסה חודשית זמינה לניתוח.");
    if (available < 0) warnings.push(`היתרה הפנויה שלילית ב-${money(Math.abs(available))} ₪.`);
    if (debtPayment > 0 && projectedIncome > 0 && debtPayment / projectedIncome >= 0.4) warnings.push("החזרי החוב גבוהים ביחס להכנסה.");
    if (installmentRows) warnings.push(`נמצאו ${installmentRows} רכישות בתשלומים בפירוט האשראי.`);

    return NextResponse.json({
      source: "rules",
      situation: available >= 0 ? `אחרי הוצאות בפועל, החזרי חוב, חיסכון וקופות נשארים ${money(available)} ₪.` : `הוצאות והתחייבויות החודש גבוהות מהיכולת ב-${money(Math.abs(available))} ₪.`,
      action: available >= 0 ? `שמרו את ההוצאות הנוספות בתוך ${money(available)} ₪ עד סוף החודש.` : "הקטינו הוצאות משתנות או יעדי חיסכון לפני הוצאה נוספת.",
      allocations: available > 0 ? [{ name: "מרווח הוצאות", amount: money(available), reason: "זה הסכום שנותר לפי מקור האמת הכספי לאחר הוצאות, חוב, חיסכון וקופות." }] : [],
      warnings,
      confidence: operatingIncome > 0 && actualExpenses > 0 ? "high" : "medium",
    });
  } catch (error) {
    console.error("[financial-plan/insights] analysis failed", error);
    return NextResponse.json({ error: "לא ניתן לנתח את התוכנית כרגע" }, { status: 500 });
  }
}
