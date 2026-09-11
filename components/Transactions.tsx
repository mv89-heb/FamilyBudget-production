"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type Cat = { id: string; name: string; type: "INCOME" | "EXPENSE" };
type Method = { id: string; nickname: string; last4: string | null; institution: string | null };
type Tx = {
  id: string;
  type: "INCOME" | "EXPENSE";
  kind: string;
  amount: number | string;
  transactionDate: string;
  category: { name: string } | null;
  paymentMethod: Method | null;
  note: string | null;
  categoryId: string;
  paymentMethodId: string | null;
};

type FormState = { type: "INCOME" | "EXPENSE"; amount: string | number; transactionDate: string; categoryId: string; paymentMethodId: string; note: string };
type CategoryGroup = { name: string; rows: Tx[]; total: number };

const PAGE_SIZE = 100;
const NON_ECONOMIC_KINDS = new Set(["TRANSFER", "CASH_WITHDRAWAL"]);
const initial = (): FormState => ({ type: "EXPENSE", amount: "", transactionDate: new Date().toISOString().slice(0, 10), categoryId: "", paymentMethodId: "", note: "" });
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

function CategorySection({ group, type, onEdit, onDelete }: { group: CategoryGroup; type: "INCOME" | "EXPENSE"; onEdit: (row: Tx) => void; onDelete: (id: string) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <button type="button" onClick={() => setOpen(value => !value)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-right transition-colors hover:bg-slate-50">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-900">{group.name}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">{group.rows.length}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-extrabold ${type === "INCOME" ? "text-emerald-600" : "text-red-600"}`}>{type === "INCOME" ? "+" : "-"}{money(group.total)}</span>
          <span className="text-slate-400">{open ? "⌃" : "⌄"}</span>
        </div>
      </button>
      {open && (
        <div className="border-t border-slate-100">
          {group.rows.map(row => (
            <div key={row.id} className="border-t border-slate-100 px-4 py-3 first:border-t-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">{row.note || "ללא תיאור"}</div>
                  <div className="mt-1 text-xs text-slate-500">{new Date(row.transactionDate).toLocaleDateString("he-IL")}{row.paymentMethod ? ` · ${row.paymentMethod.nickname}${row.paymentMethod.last4 ? ` •••• ${row.paymentMethod.last4}` : ""}` : ""}</div>
                </div>
                <div className={`shrink-0 text-sm font-bold ${type === "INCOME" ? "text-emerald-600" : "text-red-600"}`}>{type === "INCOME" ? "+" : "-"}{money(Number(row.amount))}</div>
              </div>
              <div className="mt-2 flex gap-3 text-xs">
                <button type="button" onClick={() => onEdit(row)} className="font-semibold text-indigo-600 hover:text-indigo-800">עריכה</button>
                <button type="button" onClick={() => onDelete(row.id)} className="font-semibold text-red-600 hover:text-red-800">מחיקה</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Transactions() {
  const searchParams = useSearchParams();
  const requestedMonth = searchParams.get("month");
  const initialMonth = requestedMonth === "all" || /^\d{4}-\d{2}$/.test(requestedMonth || "") ? requestedMonth || currentMonth() : currentMonth();
  const [rows, setRows] = useState<Tx[]>([]), [cats, setCats] = useState<Cat[]>([]), [methods, setMethods] = useState<Method[]>([]), [month, setMonth] = useState(initialMonth), [form, setForm] = useState<FormState>(initial()), [editing, setEditing] = useState<string | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [loading, setLoading] = useState(false);

  useEffect(() => { if (requestedMonth === "all" || /^\d{4}-\d{2}$/.test(requestedMonth || "")) setMonth(requestedMonth as string); }, [requestedMonth]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [categoriesRes, methodsRes] = await Promise.all([
        fetch("/api/categories", { cache: "no-store" }),
        fetch("/api/payment-methods", { cache: "no-store" }),
      ]);
      if (!categoriesRes.ok || !methodsRes.ok) throw new Error("לא ניתן לטעון את נתוני התנועות");
      setCats(await categoriesRes.json());
      setMethods(await methodsRes.json());

      const allRows: Tx[] = [];
      let page = 1;
      while (true) {
        const response = await fetch(`/api/transactions?month=${encodeURIComponent(month)}&page=${page}&limit=${PAGE_SIZE}`, { cache: "no-store" });
        if (!response.ok) throw new Error("לא ניתן לטעון את נתוני התנועות");
        const pageRows = (await response.json()) as Tx[];
        allRows.push(...pageRows);
        if (response.headers.get("X-Has-Next-Page") !== "true") break;
        page += 1;
      }
      setRows(allRows.filter(row => !NON_ECONOMIC_KINDS.has(row.kind)));
    } finally { setLoading(false); }
  }

  useEffect(() => { load().catch(e => setError(e instanceof Error ? e.message : "לא ניתן לטעון נתונים")); }, [month]);
  const filteredCats = cats.filter(c => c.type === form.type);
  const incomeRows = useMemo(() => rows.filter(row => row.type === "INCOME"), [rows]);
  const expenseRows = useMemo(() => rows.filter(row => row.type === "EXPENSE"), [rows]);
  const incomeGroups = useMemo(() => groupByCategory(incomeRows), [incomeRows]);
  const expenseGroups = useMemo(() => groupByCategory(expenseRows), [expenseRows]);
  const totals = useMemo(() => ({ income: incomeRows.reduce((sum, row) => sum + Number(row.amount), 0), expense: expenseRows.reduce((sum, row) => sum + Number(row.amount), 0) }), [incomeRows, expenseRows]);
  const periodLabel = month === "all" ? "כל התקופות" : new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00`));

  async function save(e: React.FormEvent) {
    e.preventDefault(); if (busy) return; setError(""); setBusy(true);
    try {
      const url = editing ? `/api/transactions/${editing}` : "/api/transactions";
      const res = await fetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const d = await res.json(); if (!res.ok) throw new Error(d.error || "שגיאה בשמירת התנועה");
      setEditing(null); setForm(initial()); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "שגיאה בשמירת התנועה"); } finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!confirm("למחוק את התנועה?")) return;
    const res = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
    if (!res.ok) setError("לא ניתן למחוק את התנועה"); else await load();
  }

  function edit(row: Tx) {
    setEditing(row.id);
    setForm({ type: row.type, amount: Number(row.amount), transactionDate: row.transactionDate.slice(0, 10), categoryId: row.categoryId, paymentMethodId: row.paymentMethodId || "", note: row.note || "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="space-y-6">
      <header className="page-header">
        <div>
          <div className="eyebrow">תנועות</div>
          <h1 className="page-title">הכנסות והוצאות</h1>
          <p className="page-subtitle">מבט פשוט על הכסף שנכנס ועל הכסף שיצא, בלי דשבורד.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-white p-2 shadow-sm">
          <span className="px-2 text-sm text-slate-500">תקופה</span>
          <select aria-label="בחירת תקופה" value={month === "all" ? "all" : "month"} onChange={e => setMonth(e.target.value === "all" ? "all" : currentMonth())} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium outline-none focus:border-indigo-500">
            <option value="month">חודש נבחר</option><option value="all">כל התקופות</option>
          </select>
          {month !== "all" && <input aria-label="בחירת חודש" type="month" value={month} onChange={e => setMonth(e.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-500" />}
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="card-elevated p-5"><div className="text-sm font-medium text-slate-500">הכנסות</div><div className="mt-2 text-2xl font-extrabold text-emerald-600">+{money(totals.income)}</div></div>
        <div className="card-elevated p-5"><div className="text-sm font-medium text-slate-500">הוצאות</div><div className="mt-2 text-2xl font-extrabold text-red-600">-{money(totals.expense)}</div></div>
        <div className="card-elevated p-5"><div className="text-sm font-medium text-slate-500">הפרש</div><div className={`mt-2 text-2xl font-extrabold ${totals.income - totals.expense >= 0 ? "text-slate-900" : "text-red-700"}`}>{money(totals.income - totals.expense)}</div></div>
      </section>

      <section className="card-elevated overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 md:px-6">
          <div><h2 className="font-bold text-slate-900">{editing ? "עריכת תנועה" : "תנועה חדשה"}</h2><p className="mt-1 text-xs text-slate-500">{editing ? "עדכן את פרטי התנועה ושמור." : "הוסף הכנסה או הוצאה חדשה."}</p></div>
          {editing && <button type="button" onClick={() => { setEditing(null); setForm(initial()); }} className="text-sm font-medium text-slate-500 hover:text-slate-900">ביטול עריכה</button>}
        </div>
        <form onSubmit={save} className="grid gap-3 p-5 md:grid-cols-6 md:p-6">
          <select aria-label="סוג תנועה" value={form.type} onChange={e => setForm({ ...form, type: e.target.value as FormState["type"], categoryId: "" })} className="input-professional"><option value="EXPENSE">הוצאה</option><option value="INCOME">הכנסה</option></select>
          <input required type="number" step="0.01" min="0.01" max="999999999" placeholder="סכום" aria-label="סכום" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="input-professional" />
          <input required type="date" aria-label="תאריך" value={form.transactionDate} onChange={e => setForm({ ...form, transactionDate: e.target.value })} className="input-professional" />
          <select required aria-label="קטגוריה" value={form.categoryId} onChange={e => setForm({ ...form, categoryId: e.target.value })} className="input-professional"><option value="">קטגוריה</option>{filteredCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select aria-label="אמצעי תשלום" value={form.paymentMethodId} onChange={e => setForm({ ...form, paymentMethodId: e.target.value })} className="input-professional"><option value="">אמצעי תשלום</option>{methods.map(m => <option key={m.id} value={m.id}>{m.nickname}{m.last4 ? ` •••• ${m.last4}` : ""}</option>)}</select>
          <input maxLength={500} placeholder="תיאור / הערה" aria-label="תיאור או הערה" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="input-professional" />
          <div className="flex gap-2 md:col-span-6"><button disabled={busy} className="primary-button">{busy ? "שומר..." : editing ? "שמירת שינוי" : "הוספת תנועה"}</button>{editing && <button type="button" onClick={() => { setEditing(null); setForm(initial()); }} className="secondary-button">ביטול</button>}</div>
          {error && <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 md:col-span-6">{error}</div>}
        </form>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div><h2 className="text-xl font-extrabold text-slate-900">{periodLabel}</h2><p className="mt-1 text-sm text-slate-500">העברות טכניות ומשיכות מזומן אינן מוצגות כאן, כדי שהמסך ישקף הכנסה או הוצאה אמיתית.</p></div>
          {loading && <span className="text-xs font-semibold text-indigo-600">טוען...</span>}
        </div>

        <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
          <div className="space-y-3">
            <div className="card-elevated overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-emerald-50/40 px-5 py-4">
                <div><h3 className="text-lg font-extrabold text-slate-900">הכנסות</h3><p className="mt-1 text-xs text-slate-500">לפי קטגוריה</p></div>
                <div className="text-lg font-extrabold text-emerald-600">+{money(totals.income)}</div>
              </div>
              <div className="space-y-3 p-4">
                {!loading && incomeGroups.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">אין הכנסות בתקופה זו</div>}
                {incomeGroups.map(group => <CategorySection key={group.name} group={group} type="INCOME" onEdit={edit} onDelete={remove} />)}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="card-elevated overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-red-50/40 px-5 py-4">
                <div><h3 className="text-lg font-extrabold text-slate-900">הוצאות</h3><p className="mt-1 text-xs text-slate-500">לפי קטגוריה</p></div>
                <div className="text-lg font-extrabold text-red-600">-{money(totals.expense)}</div>
              </div>
              <div className="space-y-3 p-4">
                {!loading && expenseGroups.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">אין הוצאות בתקופה זו</div>}
                {expenseGroups.map(group => <CategorySection key={group.name} group={group} type="EXPENSE" onEdit={edit} onDelete={remove} />)}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
