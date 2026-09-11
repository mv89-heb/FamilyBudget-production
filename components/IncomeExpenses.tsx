"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type Method = { nickname: string; last4: string | null };
type Tx = {
  id: string;
  type: "INCOME" | "EXPENSE";
  kind: string;
  amount: number | string;
  transactionDate: string;
  category: { name: string } | null;
  paymentMethod: Method | null;
  note: string | null;
};
type CategoryGroup = { name: string; rows: Tx[]; total: number };

const PAGE_SIZE = 100;
const NON_ECONOMIC_KINDS = new Set(["TRANSFER", "CASH_WITHDRAWAL"]);
const currentMonth = () => new Date().toISOString().slice(0, 7);
const money = (value: number) => value.toLocaleString("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 2 });

function groupByCategory(rows: Tx[]): CategoryGroup[] {
  const groups = new Map<string, CategoryGroup>();
  for (const row of rows) {
    const name = row.category?.name || "אחר";
    const existing = groups.get(name);
    if (existing) {
      existing.rows.push(row);
      existing.total += Number(row.amount);
    } else {
      groups.set(name, { name, rows: [row], total: Number(row.amount) });
    }
  }
  return [...groups.values()].sort((a, b) => b.total - a.total);
}

export default function IncomeExpenses() {
  const searchParams = useSearchParams();
  const requestedMonth = searchParams.get("month");
  const initialMonth = requestedMonth === "all" || /^\d{4}-\d{2}$/.test(requestedMonth || "") ? requestedMonth || currentMonth() : currentMonth();
  const [rows, setRows] = useState<Tx[]>([]);
  const [month, setMonth] = useState(initialMonth);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (requestedMonth === "all" || /^\d{4}-\d{2}$/.test(requestedMonth || "")) setMonth(requestedMonth as string);
  }, [requestedMonth]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError("");
      try {
        const allRows: Tx[] = [];
        let page = 1;
        while (true) {
          const response = await fetch(`/api/transactions?month=${encodeURIComponent(month)}&page=${page}&limit=${PAGE_SIZE}`, { cache: "no-store" });
          if (!response.ok) throw new Error("לא ניתן לטעון את נתוני ההכנסות וההוצאות");
          allRows.push(...(await response.json()) as Tx[]);
          if (response.headers.get("X-Has-Next-Page") !== "true") break;
          page += 1;
        }
        if (!cancelled) setRows(allRows.filter(row => !NON_ECONOMIC_KINDS.has(row.kind)));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "לא ניתן לטעון נתונים");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [month]);

  const incomeRows = useMemo(() => rows.filter(row => row.type === "INCOME"), [rows]);
  const expenseRows = useMemo(() => rows.filter(row => row.type === "EXPENSE"), [rows]);
  const incomeGroups = useMemo(() => groupByCategory(incomeRows), [incomeRows]);
  const expenseGroups = useMemo(() => groupByCategory(expenseRows), [expenseRows]);
  const totals = useMemo(() => ({
    income: incomeRows.reduce((sum, row) => sum + Number(row.amount), 0),
    expense: expenseRows.reduce((sum, row) => sum + Number(row.amount), 0),
  }), [incomeRows, expenseRows]);
  const periodLabel = month === "all" ? "כל התקופות" : new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00`));

  function CategoryCard({ group, type }: { group: CategoryGroup; type: "INCOME" | "EXPENSE" }) {
    const [open, setOpen] = useState(true);
    const positive = type === "INCOME";
    return (
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <button type="button" onClick={() => setOpen(v => !v)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-right hover:bg-slate-50">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-900">{group.name}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">{group.rows.length}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-sm font-extrabold ${positive ? "text-emerald-600" : "text-red-600"}`}>{positive ? "+" : "-"}{money(group.total)}</span>
            <span className="text-slate-400">{open ? "⌃" : "⌄"}</span>
          </div>
        </button>
        {open && <div className="border-t border-slate-100">
          {group.rows.map(row => (
            <div key={row.id} className="border-t border-slate-100 px-4 py-3 first:border-t-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">{row.note || "ללא תיאור"}</div>
                  <div className="mt-1 text-xs text-slate-500">{new Date(row.transactionDate).toLocaleDateString("he-IL")}{row.paymentMethod ? ` · ${row.paymentMethod.nickname}${row.paymentMethod.last4 ? ` •••• ${row.paymentMethod.last4}` : ""}` : ""}</div>
                </div>
                <div className={`shrink-0 text-sm font-bold ${positive ? "text-emerald-600" : "text-red-600"}`}>{positive ? "+" : "-"}{money(Number(row.amount))}</div>
              </div>
            </div>
          ))}
        </div>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="page-header">
        <div><div className="eyebrow">סקירה פיננסית</div><h1 className="page-title">הכנסות והוצאות</h1><p className="page-subtitle">הכנסות בצד אחד והוצאות בצד השני, מסודרות לפי קטגוריות.</p></div>
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-white p-2 shadow-sm">
          <span className="px-2 text-sm text-slate-500">תקופה</span>
          <select aria-label="בחירת תקופה" value={month === "all" ? "all" : "month"} onChange={e => setMonth(e.target.value === "all" ? "all" : currentMonth())} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium outline-none focus:border-indigo-500"><option value="month">חודש נבחר</option><option value="all">כל התקופות</option></select>
          {month !== "all" && <input aria-label="בחירת חודש" type="month" value={month} onChange={e => setMonth(e.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-500" />}
        </div>
      </header>
      <section className="grid gap-4 md:grid-cols-3">
        <div className="card-elevated p-5"><div className="text-sm font-medium text-slate-500">הכנסות</div><div className="mt-2 text-2xl font-extrabold text-emerald-600">+{money(totals.income)}</div></div>
        <div className="card-elevated p-5"><div className="text-sm font-medium text-slate-500">הוצאות</div><div className="mt-2 text-2xl font-extrabold text-red-600">-{money(totals.expense)}</div></div>
        <div className="card-elevated p-5"><div className="text-sm font-medium text-slate-500">נטו</div><div className={`mt-2 text-2xl font-extrabold ${totals.income - totals.expense >= 0 ? "text-slate-900" : "text-red-700"}`}>{money(totals.income - totals.expense)}</div></div>
      </section>
      {error && <div role="alert" className="rounded-2xl bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">{error}</div>}
      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <section className="card-elevated overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 bg-emerald-50/50 px-5 py-4"><div><h2 className="text-lg font-extrabold text-slate-900">הכנסות</h2><p className="mt-1 text-xs text-slate-500">{periodLabel} · לפי קטגוריה</p></div><div className="text-lg font-extrabold text-emerald-600">+{money(totals.income)}</div></div>
          <div className="space-y-3 p-4">{!loading && incomeGroups.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">אין הכנסות בתקופה זו</div>}{incomeGroups.map(group => <CategoryCard key={group.name} group={group} type="INCOME" />)}</div>
        </section>
        <section className="card-elevated overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 bg-red-50/50 px-5 py-4"><div><h2 className="text-lg font-extrabold text-slate-900">הוצאות</h2><p className="mt-1 text-xs text-slate-500">{periodLabel} · לפי קטגוריה</p></div><div className="text-lg font-extrabold text-red-600">-{money(totals.expense)}</div></div>
          <div className="space-y-3 p-4">{!loading && expenseGroups.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">אין הוצאות בתקופה זו</div>}{expenseGroups.map(group => <CategoryCard key={group.name} group={group} type="EXPENSE" />)}</div>
        </section>
      </div>
    </div>
  );
}
