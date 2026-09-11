"use client";

import { useEffect, useMemo, useState } from "react";

type C = { id: string; name: string; type: string };
type B = {
  id: string;
  categoryId: string;
  categoryName: string;
  limit: number;
  spent: number;
  percent: number;
};
type Insight = {
  period: "monthly" | "weekly" | "daily";
  month: string;
  source: "gemini" | "statistical";
  summary: string;
  insights: string[];
  recommendations: string[];
  suggestedBudgets: { categoryId: string; categoryName: string; amount: number; reason: string }[];
  currentMonthTotal: number;
  currentDailyPace: number;
  currentWeeklyPace: number;
};

function formatAmount(value: number) {
  return `${value.toLocaleString("he-IL", { maximumFractionDigits: 0 })} ₪`;
}

function periodLabel(period: Insight["period"]) {
  return period === "daily" ? "יומי" : period === "weekly" ? "שבועי" : "חודשי";
}

export default function Budgets() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [cats, setCats] = useState<C[]>([]);
  const [budgets, setBudgets] = useState<B[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [insight, setInsight] = useState<Insight | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  async function readJson(response: Response) {
    const text = await response.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw new Error("השרת החזיר תשובה לא תקינה");
    }
    if (!response.ok) {
      throw new Error(
        typeof data === "object" && data && "error" in data && typeof data.error === "string"
          ? data.error
          : "לא ניתן לטעון את הנתונים"
      );
    }
    return data;
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [categoriesResponse, budgetsResponse] = await Promise.all([
        fetch("/api/categories", { cache: "no-store" }),
        fetch(`/api/budgets?month=${month}`, { cache: "no-store" }),
      ]);
      const [categories, budgetRows] = await Promise.all([
        readJson(categoriesResponse),
        readJson(budgetsResponse),
      ]);
      setCats(Array.isArray(categories) ? categories : []);
      setBudgets(Array.isArray(budgetRows) ? budgetRows : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "אירעה שגיאה בטעינת התקציבים");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [month]);

  const expenseCats = cats.filter((c) => c.type === "EXPENSE");
  const totalBudget = useMemo(() => budgets.reduce((sum, budget) => sum + Number(budget.limit || 0), 0), [budgets]);
  const totalSpent = useMemo(() => budgets.reduce((sum, budget) => sum + Number(budget.spent || 0), 0), [budgets]);
  const configuredCount = budgets.filter((budget) => Number(budget.limit) > 0).length;
  const remaining = Math.max(totalBudget - totalSpent, 0);

  async function save(categoryId: string, overrideValue?: number) {
    setSaving(categoryId);
    setError("");
    try {
      const response = await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId, month, limit: overrideValue ?? Number(values[categoryId] || 0) }),
      });
      await readJson(response);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא ניתן לשמור את התקציב");
    } finally {
      setSaving(null);
    }
  }

  async function loadInsights(period: Insight["period"]) {
    setInsightLoading(true);
    setError("");
    try {
      const response = await fetch("/api/budgets/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ period, month }),
        cache: "no-store",
      });
      const data = await readJson(response);
      setInsight(data as Insight);
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא ניתן לנתח את נתוני התקציב");
    } finally {
      setInsightLoading(false);
    }
  }

  async function applySuggestions() {
    if (!insight?.suggestedBudgets.length) return;
    setApplying(true);
    setError("");
    try {
      for (const suggestion of insight.suggestedBudgets) {
        await save(suggestion.categoryId, suggestion.amount);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא ניתן להחיל את ההמלצות");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="card-elevated overflow-hidden">
        <div className="flex flex-col gap-5 p-6 sm:p-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="section-eyebrow">תכנון פיננסי</span>
            <h1 className="page-title mt-2">תקציבים</h1>
            <p className="page-subtitle mt-2">הגדרת גבולות חודשיים לפי קטגוריה ומעקב אחר ההוצאות בפועל.</p>
          </div>
          <label className="field-group w-full sm:w-auto">
            <span className="field-label">חודש להצגה</span>
            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="field-control min-w-[190px]" />
          </label>
        </div>
      </section>

      {!loading && !error && (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="card-elevated p-5"><div className="metric-label">תקציב מוגדר</div><div className="metric-value mt-2">{formatAmount(totalBudget)}</div></div>
          <div className="card-elevated p-5"><div className="metric-label">הוצאה בפועל</div><div className="metric-value mt-2">{formatAmount(totalSpent)}</div></div>
          <div className="card-elevated p-5"><div className="metric-label">יתרה בתקציב</div><div className="metric-value mt-2">{formatAmount(remaining)}</div></div>
          <div className="card-elevated p-5"><div className="metric-label">קטגוריות מוגדרות</div><div className="metric-value mt-2">{configuredCount}</div><div className="text-xs text-slate-500">מתוך {expenseCats.length} קטגוריות הוצאה</div></div>
        </section>
      )}

      <section className="card-elevated overflow-hidden border-indigo-100 bg-gradient-to-br from-white to-indigo-50/60">
        <div className="flex flex-col gap-5 p-6 sm:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <span className="section-eyebrow">Budget Intelligence</span>
              <h2 className="mt-2 text-xl font-extrabold text-slate-900">לא צריך לנחש את התקציב</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">המערכת מנתחת את נתוני ההוצאות שכבר קיימים אצלך, מזהה דפוסים ומציעה תקציב חודשי לכל קטגוריה. Gemini יכול להוסיף הסברים ותובנות על הקצב היומי והשבועי.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["monthly", "weekly", "daily"] as const).map((period) => (
                <button key={period} type="button" onClick={() => loadInsights(period)} disabled={insightLoading} className="secondary-button disabled:cursor-not-allowed disabled:opacity-60">
                  {insightLoading && insight?.period === period ? "מנתח..." : `תובנות ${periodLabel(period)}`}
                </button>
              ))}
            </div>
          </div>

          {insight && (
            <div className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-extrabold text-slate-900">התמונה הפיננסית</h3>
                  <span className="status-badge status-badge-success">{insight.source === "gemini" ? "נותח עם Gemini" : "ניתוח נתונים"}</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-700">{insight.summary}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs font-semibold text-slate-500">הוצאה בחודש</div><div className="mt-1 font-extrabold text-slate-900">{formatAmount(insight.currentMonthTotal)}</div></div>
                  <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs font-semibold text-slate-500">קצב יומי</div><div className="mt-1 font-extrabold text-slate-900">{formatAmount(insight.currentDailyPace)}</div></div>
                  <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs font-semibold text-slate-500">קצב שבועי</div><div className="mt-1 font-extrabold text-slate-900">{formatAmount(insight.currentWeeklyPace)}</div></div>
                </div>
                {insight.insights.length > 0 && <div className="mt-5"><h4 className="text-sm font-extrabold text-slate-900">מה זוהה</h4><ul className="mt-2 space-y-2 text-sm text-slate-600">{insight.insights.map((item, index) => <li key={index} className="flex gap-2"><span className="mt-1 text-indigo-600">•</span><span>{item}</span></li>)}</ul></div>}
                {insight.recommendations.length > 0 && <div className="mt-5"><h4 className="text-sm font-extrabold text-slate-900">מה כדאי לעשות</h4><ul className="mt-2 space-y-2 text-sm text-slate-600">{insight.recommendations.map((item, index) => <li key={index} className="flex gap-2"><span className="mt-1 text-indigo-600">•</span><span>{item}</span></li>)}</ul></div>}
              </div>

              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div><h3 className="font-extrabold text-slate-900">תקציבים מוצעים</h3><p className="mt-1 text-xs text-slate-500">ל{month} · מחושב לפי הנתונים ההיסטוריים</p></div>
                  <button type="button" onClick={applySuggestions} disabled={applying || insight.suggestedBudgets.length === 0} className="primary-button disabled:cursor-not-allowed disabled:opacity-60">{applying ? "מעדכן..." : "החל הכל"}</button>
                </div>
                <div className="mt-4 space-y-3">
                  {insight.suggestedBudgets.length === 0 ? <div className="rounded-xl bg-white p-4 text-sm text-slate-500">אין מספיק נתונים להצעה אוטומטית.</div> : insight.suggestedBudgets.map((suggestion) => {
                    const existing = budgets.find((budget) => budget.categoryId === suggestion.categoryId);
                    return <div key={suggestion.categoryId} className="rounded-xl bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><div><div className="font-bold text-slate-900">{suggestion.categoryName}</div><div className="mt-1 text-xs text-slate-500">{suggestion.reason}</div></div><div className="text-left"><div className="font-extrabold text-indigo-700">{formatAmount(suggestion.amount)}</div>{existing && <div className="text-[11px] text-slate-400">קיים: {formatAmount(Number(existing.limit))}</div>}</div></div><button type="button" onClick={() => save(suggestion.categoryId, suggestion.amount)} disabled={saving === suggestion.categoryId} className="secondary-button mt-3 w-full disabled:opacity-60">{saving === suggestion.categoryId ? "שומר..." : "השתמש בהמלצה"}</button></div>;
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {error && <div className="card-elevated border-red-200 bg-red-50 p-5 text-sm text-red-700" role="alert"><div className="font-bold">לא הצלחנו להשלים את הפעולה</div><div className="mt-1">{error}</div><button type="button" onClick={load} className="secondary-button mt-4">נסה שוב</button></div>}

      {loading ? <section className="grid gap-4 md:grid-cols-2" aria-label="טוען תקציבים">{[1, 2, 3, 4].map((item) => <div key={item} className="card-elevated h-52 animate-pulse bg-slate-50" />)}</section> : expenseCats.length === 0 ? <section className="card-elevated p-8 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">₪</div><h2 className="mt-4 text-lg font-extrabold text-slate-900">אין עדיין קטגוריות הוצאה</h2><p className="mt-2 text-sm text-slate-500">הוסיפו קטגוריות הוצאה בהגדרות כדי להתחיל לבנות תקציב.</p></section> : <section className="grid gap-4 md:grid-cols-2">
        {expenseCats.map((category) => {
          const budget = budgets.find((item) => item.categoryId === category.id);
          const value = values[category.id] ?? (budget?.limit?.toString() || "");
          const percent = Math.min(Math.max(Number(budget?.percent || 0), 0), 100);
          const overBudget = Number(budget?.percent || 0) >= 100;
          const spent = Number(budget?.spent || 0);
          const limit = Number(budget?.limit || 0);
          return <article key={category.id} className="card-elevated p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4"><div><h2 className="text-base font-extrabold text-slate-900">{category.name}</h2><p className="mt-1 text-xs text-slate-500">{budget ? `${formatAmount(spent)} מתוך ${formatAmount(limit)}` : "עדיין לא הוגדר תקציב"}</p></div>{budget && <span className={`status-badge ${overBudget ? "status-badge-danger" : "status-badge-success"}`}>{overBudget ? "חריגה" : `${Math.round(Number(budget.percent || 0))}%`}</span>}</div>
            <div className="mt-5"><div className="mb-2 flex justify-between text-xs font-semibold text-slate-500"><span>ניצול התקציב</span><span>{budget ? `${Math.round(Number(budget.percent || 0))}%` : "0%"}</span></div><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full transition-all ${overBudget ? "bg-red-500" : "bg-indigo-600"}`} style={{ width: `${percent}%` }} /></div></div>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row"><label className="field-group flex-1"><span className="sr-only">תקציב חודשי ל{category.name}</span><input type="number" min="0" step="0.01" inputMode="decimal" value={value} onChange={(event) => setValues({ ...values, [category.id]: event.target.value })} className="field-control" placeholder="תקציב חודשי" /></label><button type="button" onClick={() => save(category.id)} disabled={saving === category.id} className="primary-button min-w-[92px] disabled:cursor-not-allowed disabled:opacity-60">{saving === category.id ? "שומר..." : "שמור"}</button></div>
          </article>;
        })}
      </section>}
    </div>
  );
}
