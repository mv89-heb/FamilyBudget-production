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

function formatAmount(value: number) {
  return `${value.toLocaleString("he-IL", { maximumFractionDigits: 0 })} ₪`;
}

export default function Budgets() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [cats, setCats] = useState<C[]>([]);
  const [budgets, setBudgets] = useState<B[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");

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
          : "לא ניתן לטעון את התקציבים"
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
  const totalBudget = useMemo(
    () => budgets.reduce((sum, budget) => sum + Number(budget.limit || 0), 0),
    [budgets]
  );
  const totalSpent = useMemo(
    () => budgets.reduce((sum, budget) => sum + Number(budget.spent || 0), 0),
    [budgets]
  );
  const configuredCount = budgets.filter((budget) => Number(budget.limit) > 0).length;
  const remaining = Math.max(totalBudget - totalSpent, 0);

  async function save(categoryId: string) {
    setSaving(categoryId);
    setError("");
    try {
      const response = await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId, month, limit: values[categoryId] || 0 }),
      });
      await readJson(response);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא ניתן לשמור את התקציב");
    } finally {
      setSaving(null);
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
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="field-control min-w-[190px]"
            />
          </label>
        </div>
      </section>

      {!loading && !error && (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="card-elevated p-5">
            <div className="metric-label">תקציב מוגדר</div>
            <div className="metric-value mt-2">{formatAmount(totalBudget)}</div>
          </div>
          <div className="card-elevated p-5">
            <div className="metric-label">הוצאה בפועל</div>
            <div className="metric-value mt-2">{formatAmount(totalSpent)}</div>
          </div>
          <div className="card-elevated p-5">
            <div className="metric-label">יתרה בתקציב</div>
            <div className="metric-value mt-2">{formatAmount(remaining)}</div>
          </div>
          <div className="card-elevated p-5">
            <div className="metric-label">קטגוריות מוגדרות</div>
            <div className="metric-value mt-2">{configuredCount}</div>
            <div className="text-xs text-slate-500">מתוך {expenseCats.length} קטגוריות הוצאה</div>
          </div>
        </section>
      )}

      {error && (
        <div className="card-elevated border-red-200 bg-red-50 p-5 text-sm text-red-700" role="alert">
          <div className="font-bold">לא הצלחנו להשלים את הפעולה</div>
          <div className="mt-1">{error}</div>
          <button type="button" onClick={load} className="secondary-button mt-4">נסה שוב</button>
        </div>
      )}

      {loading ? (
        <section className="grid gap-4 md:grid-cols-2" aria-label="טוען תקציבים">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="card-elevated h-52 animate-pulse bg-slate-50" />
          ))}
        </section>
      ) : expenseCats.length === 0 ? (
        <section className="card-elevated p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">₪</div>
          <h2 className="mt-4 text-lg font-extrabold text-slate-900">אין עדיין קטגוריות הוצאה</h2>
          <p className="mt-2 text-sm text-slate-500">הוסיפו קטגוריות הוצאה בהגדרות כדי להתחיל לבנות תקציב.</p>
        </section>
      ) : (
        <section className="grid gap-4 md:grid-cols-2">
          {expenseCats.map((category) => {
            const budget = budgets.find((item) => item.categoryId === category.id);
            const value = values[category.id] ?? (budget?.limit?.toString() || "");
            const percent = Math.min(Math.max(Number(budget?.percent || 0), 0), 100);
            const overBudget = Number(budget?.percent || 0) >= 100;
            const spent = Number(budget?.spent || 0);
            const limit = Number(budget?.limit || 0);

            return (
              <article key={category.id} className="card-elevated p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-base font-extrabold text-slate-900">{category.name}</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      {budget ? `${formatAmount(spent)} מתוך ${formatAmount(limit)}` : "עדיין לא הוגדר תקציב"}
                    </p>
                  </div>
                  {budget && (
                    <span className={`status-badge ${overBudget ? "status-badge-danger" : "status-badge-success"}`}>
                      {overBudget ? "חריגה" : `${Math.round(Number(budget.percent || 0))}%`}
                    </span>
                  )}
                </div>

                <div className="mt-5">
                  <div className="mb-2 flex justify-between text-xs font-semibold text-slate-500">
                    <span>ניצול התקציב</span>
                    <span>{budget ? `${Math.round(Number(budget.percent || 0))}%` : "0%"}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full transition-all ${overBudget ? "bg-red-500" : "bg-indigo-600"}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                  <label className="field-group flex-1">
                    <span className="sr-only">תקציב חודשי ל{category.name}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={value}
                      onChange={(event) => setValues({ ...values, [category.id]: event.target.value })}
                      className="field-control"
                      placeholder="תקציב חודשי"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => save(category.id)}
                    disabled={saving === category.id}
                    className="primary-button min-w-[92px] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving === category.id ? "שומר..." : "שמור"}
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
