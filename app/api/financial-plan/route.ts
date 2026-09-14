import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateDebtPayments, calculateNetExpense, calculateOperatingIncome, getIsraelMonth, monthRange, sum, toNumber, type FinancialTransaction } from "@/lib/financial-engine";
import { classifyTransactionPresentation } from "@/lib/category-classifier";

const planSchema = z.object({
  monthlySavingsTarget: z.coerce.number().min(0).max(999999999),
  weeklyLeisureBudget: z.coerce.number().min(0).max(999999999),
  emergencyFundAmount: z.coerce.number().min(0).max(999999999),
  emergencyTargetMonths: z.coerce.number().int().min(3).max(6),
});

const leisurePattern = /(בילוי|פנאי|מסעד|קפה|קולנוע|אטרקציה|בידור|יציאה|נופש|חופשה)/i;
const hardExpensePattern = /(דיור|משכנתא|ארנונה|שכירות|חשמל|מים|גז|ביטוח|גן|מעון|חינוך|בית ספר|קייטנה|תינוק|הלווא|חוב|אשראי|מיסים)/i;
function sectionForCategory(name: string): string {
  if (/(דיור|משכנתא|ארנונה|שכירות|חשמל|מים|גז|ביטוח דירה)/i.test(name)) return "דיור";
  if (/(מזון|סופר|מכולת|מסעד|קפה|פנאי|בילוי|קולנוע|אטרקציה|בידור)/i.test(name)) return "מחיה ופנאי";
  if (/(תחבורה|דלק|רכב|מוסך|חניה|כביש)/i.test(name)) return "תחבורה";
  if (/(ילד|גן|מעון|חינוך|בית ספר|קייטנה|תינוק)/i.test(name)) return "ילדים";
  if (/(הלווא|חוב|אשראי|משכנתא)/i.test(name)) return "חובות";
  if (/(חיסכון|פקדון|פנסיוני)/i.test(name)) return "חיסכון";
  return "אחר";
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

    const normalized = transactions.map(t => ({ type: t.type, kind: t.kind, amount: toNumber(t.amount), transactionDate: t.transactionDate, categoryId: t.categoryId, categoryName: t.category?.name ?? null, note: t.note })) satisfies FinancialTransaction[];
    const receivedIncome = calculateOperatingIncome(normalized);
    const configuredIncome = sum(incomes.map(i => i.monthlyAmount));
    const projectedIncome = receivedIncome > 0 ? receivedIncome : configuredIncome;
    const actualExpenses = Math.max(0, calculateNetExpense(normalized));
    const expenseTransactions = normalized.filter(t => (t.type === "EXPENSE" && ["STANDARD", "LOAN_INTEREST"].includes(t.kind)) || (t.type === "INCOME" && t.kind === "REFUND"));

    const presentation = new Map<string, ReturnType<typeof classifyTransactionPresentation>>();
    const presentedName = (t: FinancialTransaction) => {
      const key = `${t.categoryId}|${t.categoryName}|${t.note}`;
      let value = presentation.get(key);
      if (!value) { value = classifyTransactionPresentation(t.categoryName, t.note); presentation.set(key, value); }
      return value;
    };

    // Legacy bank imports can contain known debt payments persisted as STANDARD.
    // They remain STANDARD in the accounting ledger, but count toward debt burden and
    // emergency cash commitments. Explicit LOAN_PRINCIPAL remains the only principal kind.
    const debtPayment = calculateDebtPayments(normalized, (t) => {
      const view = presentedName(t);
      return t.kind === "STANDARD" && t.type === "EXPENSE" && view.isDebt;
    });
    const debtPrincipal = sum(normalized.filter(t => t.kind === "LOAN_PRINCIPAL").map(t => Math.abs(t.amount)));

    const hardBudgetIds = new Set(budgets.filter(b => b.class === "HARD").map(b => b.categoryId));
    const variableBudgetIds = new Set(budgets.filter(b => b.class === "VARIABLE").map(b => b.categoryId));
    const budgetCategoryIds = new Set(budgets.map(b => b.categoryId));
    const hardBudgetLimit = sum(budgets.filter(b => b.class === "HARD").map(b => b.limit));
    const variableBudgetLimit = sum(budgets.filter(b => b.class === "VARIABLE").map(b => b.limit));

    const isHard = (t: FinancialTransaction) => hardBudgetIds.has(t.categoryId ?? "") || (!variableBudgetIds.has(t.categoryId ?? "") && (hardExpensePattern.test(presentedName(t).name) || presentedName(t).isDebt || presentedName(t).isCreditCardPayment));
    const signedExpenseAmount = (t: FinancialTransaction) => t.kind === "REFUND" ? -Math.abs(t.amount) : Math.abs(t.amount);
    const hardActual = sum(expenseTransactions.filter(isHard).map(signedExpenseAmount));
    const variableActual = sum(expenseTransactions.filter(t => !isHard(t)).map(signedExpenseAmount));
    const unbudgetedActual = sum(expenseTransactions.filter(t => !budgetCategoryIds.has(t.categoryId ?? "")).map(signedExpenseAmount));
    const leisureActualWeek = sum(expenseTransactions.filter(t => t.transactionDate && t.transactionDate >= currentWeek && t.type === "EXPENSE" && leisurePattern.test(presentedName(t).name)).map(t => Math.abs(t.amount)));
    const sinkingMonthly = sum(funds.map(f => f.monthlyContribution));
    const savings = toNumber(plan.monthlySavingsTarget);

    const availableVariable = projectedIncome - actualExpenses - debtPrincipal - sinkingMonthly - savings;
    const monthlyLeisure = toNumber(plan.weeklyLeisureBudget) * 4.33;
    const debtBurden = projectedIncome > 0 ? debtPayment / projectedIncome : 0;
    const elapsedMs = Math.max(86400000, now.getTime() - month.getTime());
    const monthElapsedDays = Math.max(1, Math.ceil(elapsedMs / 86400000));
    const daysInMonth = Math.max(1, Math.round((nextMonth.getTime() - month.getTime()) / 86400000));

    // Emergency savings cover essential monthly cash commitments, not merely categories marked HARD.
    // Debt is already included in debtPayment, so exclude debt rows here to prevent double counting.
    // Credit-card summary payments are deliberately excluded from the essential estimate because they
    // contain both essential and discretionary purchases; the separate card-detail source can refine this later.
    const essentialActual = sum(expenseTransactions.filter(t => {
      const view = presentedName(t);
      return view.isEssential && !view.isSavings && !view.isDebt && !view.isCreditCardPayment;
    }).map(signedExpenseAmount));
    const essentialCashCommitments = essentialActual + debtPayment;
    const essentialMonthly = Math.max(essentialCashCommitments, hardBudgetLimit);
    const emergencyMin = essentialMonthly * 3;
    const emergencyMax = essentialMonthly * 6;
    const emergencyProgress = toNumber(plan.emergencyFundAmount);
    const dataCoverage = receivedIncome > 0 || actualExpenses > 0 ? "GOOD" : configuredIncome > 0 ? "PARTIAL" : "LOW";
    const variableRemaining = variableBudgetLimit - variableActual;
    const hasLeisureTarget = toNumber(plan.weeklyLeisureBudget) > 0;

    const recommendation = unbudgetedActual > 0
      ? `יש ${Math.round(unbudgetedActual).toLocaleString("he-IL")} ₪ של הוצאות בלי מסגרת. הסכום עדיין נכלל בהוצאות בפועל; כדאי להגדיר מסגרות לסעיפים המרכזיים.`
      : availableVariable <= 0
        ? "אין כרגע כסף פנוי אחרי ההוצאות, החוב, החיסכון והקופות. לפני שמגדילים הוצאות כדאי לאזן את התוכנית."
        : debtBurden >= 0.4
          ? "נטל החוב גבוה. שמור על הוצאות חובה וחיסכון בסיסי, והעדף צמצום חוב יקר לפני הגדלת הוצאות פנאי."
          : hasLeisureTarget && leisureActualWeek > toNumber(plan.weeklyLeisureBudget)
            ? `הוצאות הפנאי השבוע כבר מעל היעד ב-${Math.round(leisureActualWeek - toNumber(plan.weeklyLeisureBudget)).toLocaleString("he-IL")} ₪. כדאי לעצור כאן לשאר השבוע.`
            : variableBudgetLimit > 0 && variableActual > variableBudgetLimit
              ? `ההוצאות המשתנות עברו את התקציב החודשי ב-${Math.round(variableActual - variableBudgetLimit).toLocaleString("he-IL")} ₪.`
              : `נשארו ${Math.round(availableVariable).toLocaleString("he-IL")} ₪ בפועל אחרי ההוצאות, החוב, החיסכון והקופות.`;

    const budgetCategoriesMap = new Map<string, { categoryId: string; name: string; class: "HARD" | "VARIABLE"; section: string; limit: number; actual: number; remaining: number; percent: number }>();
    for (const budget of budgets) {
      const limit = toNumber(budget.limit);
      const actual = sum(expenseTransactions.filter(t => t.categoryId === budget.categoryId).map(signedExpenseAmount));
      budgetCategoriesMap.set(budget.categoryId, { categoryId: budget.categoryId, name: budget.category.name, class: budget.class, section: sectionForCategory(budget.category.name), limit, actual, remaining: limit - actual, percent: limit > 0 ? (actual / limit) * 100 : 0 });
    }
    const budgetCategories = Array.from(budgetCategoriesMap.values()).sort((a, b) => a.section.localeCompare(b.section, "he") || b.actual - a.actual || a.name.localeCompare(b.name, "he"));

    const unbudgetedByCategory = new Map<string, { categoryId: string; name: string; actual: number; reason: string | null }>();
    for (const transaction of expenseTransactions) {
      const categoryId = transaction.categoryId ?? "uncategorized";
      if (budgetCategoryIds.has(categoryId)) continue;
      const view = presentedName(transaction);
      const current = unbudgetedByCategory.get(view.name);
      unbudgetedByCategory.set(view.name, { categoryId: view.name, name: view.name, actual: (current?.actual ?? 0) + signedExpenseAmount(transaction), reason: view.reason });
    }
    const unbudgetedCategories = Array.from(unbudgetedByCategory.values()).filter(x => x.actual !== 0).sort((a, b) => Math.abs(b.actual) - Math.abs(a.actual) || a.name.localeCompare(b.name, "he"));

    const spendingByCategory = new Map<string, { name: string; actual: number; reason: string | null }>();
    for (const transaction of expenseTransactions) {
      const view = presentedName(transaction);
      const current = spendingByCategory.get(view.name);
      spendingByCategory.set(view.name, { name: view.name, actual: (current?.actual ?? 0) + signedExpenseAmount(transaction), reason: view.reason });
    }
    const spendingCategories = Array.from(spendingByCategory.values()).filter(x => x.actual !== 0).sort((a, b) => b.actual - a.actual);

    return NextResponse.json({ plan, householdSize: user.householdSize, incomes, funds, budgetCategories, unbudgetedCategories, spendingCategories, summary: {
      plannedIncome: configuredIncome, receivedIncome, projectedIncome, netIncome: projectedIncome, configuredIncome, netIncomeActual: receivedIncome,
      actualExpenses, fixedCommitments: hardActual, hardActual, hardBudgetLimit, sinkingMonthly, savings,
      availableVariable, actualAvailable: availableVariable, variableActual, variableBudgetLimit, variableRemaining,
      uncategorizedActual: unbudgetedActual, unbudgetedActual, projectedVariable: variableActual > 0 ? (variableActual / monthElapsedDays) * daysInMonth : 0,
      weeklyLeisure: toNumber(plan.weeklyLeisureBudget), monthlyLeisure, leisureActualMonth: 0, leisureActualWeek,
      essentialMonthly, essentialCashCommitments, emergencyMin, emergencyMax, emergencyProgress, debtPayment, debtPrincipal, debtBurden,
      freeAfterLeisure: hasLeisureTarget ? availableVariable - monthlyLeisure : availableVariable, hasLeisureTarget, dataCoverage, recommendation,
    }});
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
    return NextResponse.json({ error: "נתוני התוכנית אינם תקינים" }, { status: 400 });
  }
}
