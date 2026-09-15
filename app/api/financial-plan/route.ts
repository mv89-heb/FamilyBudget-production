import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateDebtPayments, calculateOperatingIncome, getIsraelMonth, monthRange, sum, toNumber, type FinancialTransaction } from "@/lib/financial-engine";
import { classifyTransactionPresentation } from "@/lib/category-classifier";

const planSchema = z.object({
  monthlySavingsTarget: z.coerce.number().min(0).max(999999999),
  weeklyLeisureBudget: z.coerce.number().min(0).max(999999999),
  emergencyFundAmount: z.coerce.number().min(0).max(999999999),
  emergencyTargetMonths: z.coerce.number().int().min(3).max(6),
});

const leisurePattern = /(בילוי|פנאי|מסעד|קפה|קולנוע|אטרקציה|בידור|יציאה|נופש|חופשה)/i;

function budgetGroupForCategory(name: string): string {
  if (/(מזון|סופר|מכולת)/i.test(name)) return "מזון";
  if (/(חשבונות|מים|חשמל|גז|ארנונה|שכירות|דיור|תקשורת|אינטרנט|טלפון)/i.test(name)) return "חשבונות";
  if (/(דלק|תחבורה|רכב|מוסך|חניה|כביש)/i.test(name)) return "דלק";
  if (/(ילד|גן|מעון|חינוך|בית ספר|קייטנה|תינוק)/i.test(name)) return "חינוך";
  if (/(בריאות|רופא|תרופ|פארם|בית מרקחת)/i.test(name)) return "בריאות";
  if (/(ביטוח|מיסים|מס|ארנונה)/i.test(name)) return "מיסים";
  if (/(עמל|בנקאות|אחר)/i.test(name)) return "אחר";
  return name;
}

function budgetGroupLabel(group: string): string {
  switch (group) {
    case "מזון": return "מזון";
    case "חשבונות": return "דיור וחשבונות";
    case "דלק": return "תחבורה";
    case "חינוך": return "ילדים וחינוך";
    case "בריאות": return "בריאות";
    case "מיסים": return "ביטוח ומיסים";
    case "אחר": return "שונות";
    default: return group;
  }
}

export async function GET() {
  try {
    const user = await requireUser();
    const now = new Date();
    const monthName = getIsraelMonth(now);
    const { start: month, end: nextMonth } = monthRange(monthName);
    const currentWeek = new Date(now);
    const day = currentWeek.getUTCDay();
    currentWeek.setUTCDate(currentWeek.getUTCDate() - (day === 0 ? 6 : day - 1));
    currentWeek.setUTCHours(0, 0, 0, 0);

    const [plan, incomes, funds, budgets, transactions] = await Promise.all([
      prisma.financialPlan.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} }),
      prisma.incomeSource.findMany({ where: { userId: user.id, active: true }, orderBy: { name: "asc" } }),
      prisma.sinkingFund.findMany({ where: { userId: user.id, active: true }, orderBy: { dueDate: "asc" } }),
      prisma.budget.findMany({ where: { userId: user.id, month }, select: { limit: true, class: true, categoryId: true, category: { select: { name: true } } } }),
      prisma.transaction.findMany({ where: { userId: user.id, transactionDate: { gte: month, lt: nextMonth } }, select: { type: true, kind: true, amount: true, transactionDate: true, categoryId: true, category: { select: { name: true } }, note: true }, orderBy: { transactionDate: "desc" } }),
    ]);

    const normalized = transactions.map(t => ({
      type: t.type,
      kind: t.kind,
      amount: toNumber(t.amount),
      transactionDate: t.transactionDate,
      categoryId: t.categoryId,
      categoryName: t.category?.name ?? null,
      note: t.note,
    })) satisfies FinancialTransaction[];

    const receivedIncome = calculateOperatingIncome(normalized);
    const configuredIncome = sum(incomes.map(i => i.monthlyAmount));
    const projectedIncome = receivedIncome > 0 ? receivedIncome : configuredIncome;
    const expenseTransactions = normalized.filter(t =>
      (t.type === "EXPENSE" && ["STANDARD", "LOAN_INTEREST"].includes(t.kind)) ||
      (t.type === "INCOME" && t.kind === "REFUND")
    );

    const presentation = new Map<string, ReturnType<typeof classifyTransactionPresentation>>();
    const presentedName = (t: FinancialTransaction) => {
      const key = `${t.categoryId}|${t.categoryName}|${t.note}`;
      let value = presentation.get(key);
      if (!value) {
        value = classifyTransactionPresentation(t.categoryName, t.note);
        presentation.set(key, value);
      }
      return value;
    };
    const signedExpenseAmount = (t: FinancialTransaction) =>
      t.kind === "REFUND" ? -Math.abs(t.amount) : Math.abs(t.amount);

    const debtPayment = calculateDebtPayments(normalized, t => {
      const view = presentedName(t);
      return t.kind === "STANDARD" && t.type === "EXPENSE" && view.isDebt;
    });
    const debtPrincipal = sum(normalized.filter(t => t.kind === "LOAN_PRINCIPAL").map(t => Math.abs(t.amount)));
    const savingsActual = sum(expenseTransactions.filter(t => presentedName(t).isSavings).map(signedExpenseAmount));
    const operatingExpenseTransactions = expenseTransactions.filter(t => {
      const view = presentedName(t);
      return !view.isDebt && !view.isSavings;
    });
    const actualExpenses = sum(operatingExpenseTransactions.map(signedExpenseAmount));

    const budgetByGroup = new Map<string, { categoryId: string; name: string; class: "HARD" | "VARIABLE"; limit: number }>();
    for (const budget of budgets) {
      const group = budgetGroupForCategory(budget.category.name);
      budgetByGroup.set(group, {
        categoryId: budget.categoryId,
        name: budget.category.name,
        class: budget.class,
        limit: toNumber(budget.limit),
      });
    }

    const hardBudgetLimit = sum(Array.from(budgetByGroup.values()).filter(b => b.class === "HARD").map(b => b.limit));
    const variableBudgetLimit = sum(Array.from(budgetByGroup.values()).filter(b => b.class === "VARIABLE").map(b => b.limit));
    const groupForTransaction = (t: FinancialTransaction) => budgetGroupForCategory(presentedName(t).name || t.categoryName || "אחר");
    const budgetForTransaction = (t: FinancialTransaction) => budgetByGroup.get(groupForTransaction(t));

    // Budget progress is based only on transactions that actually belong to a budget.
    // Unbudgeted spending is kept separate and never inflates hard/variable progress.
    const hardActual = sum(operatingExpenseTransactions
      .filter(t => budgetForTransaction(t)?.class === "HARD")
      .map(signedExpenseAmount));
    const variableActual = sum(operatingExpenseTransactions
      .filter(t => budgetForTransaction(t)?.class === "VARIABLE")
      .map(signedExpenseAmount));
    const unbudgetedActual = sum(operatingExpenseTransactions
      .filter(t => !budgetForTransaction(t))
      .map(signedExpenseAmount));

    const leisureActualWeek = sum(operatingExpenseTransactions
      .filter(t => t.transactionDate && t.transactionDate >= currentWeek && t.type === "EXPENSE" && leisurePattern.test(presentedName(t).name))
      .map(t => Math.abs(t.amount)));
    const sinkingMonthly = sum(funds.map(f => f.monthlyContribution));
    const savingsTarget = toNumber(plan.monthlySavingsTarget);
    const plannedSavings = Math.max(savingsActual, savingsTarget);
    const availableVariable = projectedIncome - actualExpenses - debtPayment - plannedSavings - sinkingMonthly;
    const monthlyLeisure = toNumber(plan.weeklyLeisureBudget) * 4.33;
    const debtBurden = projectedIncome > 0 ? debtPayment / projectedIncome : 0;
    const elapsedMs = Math.max(86400000, now.getTime() - month.getTime());
    const monthElapsedDays = Math.max(1, Math.ceil(elapsedMs / 86400000));
    const daysInMonth = Math.max(1, Math.round((nextMonth.getTime() - month.getTime()) / 86400000));
    const essentialActual = sum(operatingExpenseTransactions.filter(t => presentedName(t).isEssential).map(signedExpenseAmount));
    const essentialCashCommitments = essentialActual + debtPayment;
    const essentialMonthly = Math.max(essentialCashCommitments, hardBudgetLimit);
    const emergencyMin = essentialMonthly * 3;
    const emergencyMax = essentialMonthly * 6;
    const emergencyProgress = toNumber(plan.emergencyFundAmount);
    const dataCoverage = receivedIncome > 0 || actualExpenses > 0 ? "GOOD" : configuredIncome > 0 ? "PARTIAL" : "LOW";
    const variableRemaining = variableBudgetLimit - variableActual;
    const hasLeisureTarget = toNumber(plan.weeklyLeisureBudget) > 0;

    const recommendation = unbudgetedActual > 0
      ? `יש ${Math.round(unbudgetedActual).toLocaleString("he-IL")} ₪ של הוצאות בלי מסגרת. הסכום עדיין נכלל בהוצאות בפועל; כדאי לפרט את חיובי האשראי או להגדיר מסגרת לסעיף.`
      : availableVariable <= 0
        ? "אין כרגע כסף פנוי אחרי ההוצאות, החוב, החיסכון והקופות. לפני שמגדילים הוצאות כדאי לאזן את התוכנית."
        : debtBurden >= 0.4
          ? "נטל החוב גבוה. שמור על הוצאות חובה וחיסכון בסיסי, והעדף צמצום חוב יקר לפני הגדלת הוצאות פנאי."
          : hasLeisureTarget && leisureActualWeek > toNumber(plan.weeklyLeisureBudget)
            ? `הוצאות הפנאי השבוע כבר מעל היעד ב-${Math.round(leisureActualWeek - toNumber(plan.weeklyLeisureBudget)).toLocaleString("he-IL")} ₪. כדאי לעצור כאן לשאר השבוע.`
            : variableBudgetLimit > 0 && variableActual > variableBudgetLimit
              ? `ההוצאות המשתנות עברו את התקציב החודשי ב-${Math.round(variableActual - variableBudgetLimit).toLocaleString("he-IL")} ₪.`
              : `נשארו ${Math.round(availableVariable).toLocaleString("he-IL")} ₪ בפועל אחרי ההוצאות, החוב, החיסכון והקופות.`;

    const budgetCategoriesMap = new Map<string, { categoryId: string; name: string; class: "HARD" | "VARIABLE"; section: string; limit: number; actual: number; remaining: number; percent: number; status: "NORMAL" | "WARNING" | "OVER" }>();
    for (const budget of budgets) {
      const group = budgetGroupForCategory(budget.category.name);
      const existing = budgetCategoriesMap.get(group);
      const limit = existing ? existing.limit : toNumber(budget.limit);
      const actual = sum(operatingExpenseTransactions.filter(t => groupForTransaction(t) === group).map(signedExpenseAmount));
      const percent = limit > 0 ? (actual / limit) * 100 : 0;
      const status = percent >= 100 ? "OVER" : percent >= 80 ? "WARNING" : "NORMAL";
      budgetCategoriesMap.set(group, {
        categoryId: existing?.categoryId ?? budget.categoryId,
        name: existing?.name ?? budget.category.name,
        class: existing?.class ?? budget.class,
        section: budgetGroupLabel(group),
        limit,
        actual,
        remaining: limit - actual,
        percent,
        status,
      });
    }
    const budgetCategories = Array.from(budgetCategoriesMap.values()).sort((a, b) => a.section.localeCompare(b.section, "he") || b.actual - a.actual);

    const unbudgetedByCategory = new Map<string, { categoryId: string; name: string; actual: number; reason: string | null }>();
    for (const transaction of operatingExpenseTransactions) {
      if (budgetForTransaction(transaction)) continue;
      const view = presentedName(transaction);
      const current = unbudgetedByCategory.get(view.name);
      unbudgetedByCategory.set(view.name, {
        categoryId: view.name,
        name: view.name,
        actual: (current?.actual ?? 0) + signedExpenseAmount(transaction),
        reason: view.reason,
      });
    }
    const unbudgetedCategories = Array.from(unbudgetedByCategory.values())
      .filter(x => x.actual !== 0)
      .sort((a, b) => Math.abs(b.actual) - Math.abs(a.actual) || a.name.localeCompare(b.name, "he"));

    const spendingByCategory = new Map<string, { name: string; actual: number; reason: string | null }>();
    for (const transaction of operatingExpenseTransactions) {
      const view = presentedName(transaction);
      const current = spendingByCategory.get(view.name);
      spendingByCategory.set(view.name, {
        name: view.name,
        actual: (current?.actual ?? 0) + signedExpenseAmount(transaction),
        reason: view.reason,
      });
    }
    const spendingCategories = Array.from(spendingByCategory.values()).filter(x => x.actual !== 0).sort((a, b) => b.actual - a.actual);

    return NextResponse.json({
      plan,
      householdSize: user.householdSize,
      incomes,
      funds,
      budgetCategories,
      unbudgetedCategories,
      spendingCategories,
      summary: {
        plannedIncome: configuredIncome,
        receivedIncome,
        projectedIncome,
        netIncome: projectedIncome,
        configuredIncome,
        netIncomeActual: receivedIncome,
        actualExpenses,
        fixedCommitments: hardActual,
        hardActual,
        hardBudgetLimit,
        hardPercent: hardBudgetLimit > 0 ? (hardActual / hardBudgetLimit) * 100 : 0,
        sinkingMonthly,
        savings: savingsTarget,
        savingsActual,
        availableVariable,
        actualAvailable: availableVariable,
        variableActual,
        variableBudgetLimit,
        variablePercent: variableBudgetLimit > 0 ? (variableActual / variableBudgetLimit) * 100 : 0,
        variableRemaining,
        uncategorizedActual: unbudgetedActual,
        unbudgetedActual,
        budgetedActual: hardActual + variableActual,
        budgetCoverage: actualExpenses > 0 ? ((hardActual + variableActual) / actualExpenses) * 100 : 100,
        projectedVariable: variableActual > 0 ? (variableActual / monthElapsedDays) * daysInMonth : 0,
        weeklyLeisure: toNumber(plan.weeklyLeisureBudget),
        monthlyLeisure,
        leisureActualMonth: 0,
        leisureActualWeek,
        essentialMonthly,
        essentialCashCommitments,
        emergencyMin,
        emergencyMax,
        emergencyProgress,
        debtPayment,
        debtPrincipal,
        debtBurden,
        freeAfterLeisure: hasLeisureTarget ? availableVariable - monthlyLeisure : availableVariable,
        hasLeisureTarget,
        dataCoverage,
        recommendation,
      },
    });
  } catch {
    return NextResponse.json({ error: "לא ניתן לטעון את התוכנית המשפחתית" }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    const input = planSchema.parse(await req.json());
    const plan = await prisma.financialPlan.upsert({ where: { userId: user.id }, create: { userId: user.id, ...input }, update: input });
    return NextResponse.json(plan);
  } catch {
    return NextResponse.json({ error: "לא ניתן לשמור את התוכנית המשפחתית" }, { status: 400 });
  }
}
