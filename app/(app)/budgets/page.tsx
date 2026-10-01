"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Plus, RefreshCw, Trash2 } from "lucide-react";

type Category = { id: string; name: string; type: "INCOME" | "EXPENSE" };
type Budget = { categoryId: string; name: string; class: "HARD" | "VARIABLE"; limit: number; actual: number; remaining: number; percent: number };

const money = (n: number) => n.toLocaleString("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });
const monthNow = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit" }).format(new Date());

export default function BudgetsPage() {
  const [month, setMonth] = useState(monthNow());
  const [categories, setCategories] = useState<Category[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [form, setForm] = useState({ categoryId: "", limit: "", class: "VARIABLE" as "HARD" | "VARIABLE" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const [c, b] = await Promise.all([
        fetch("/api/categories", { cache: "no-store" }),
        fetch(`/api/budgets?month=${encodeURIComponent(month)}`, { cache: "no-store" }),
      ]);
      const [categoriesBody, budgetsBody] = await Promise.all([c.json(), b.json()]);
      if (!c.ok || !b.ok) throw new Error(categoriesBody?.error || budgetsBody?.error || "לא ניתן לטעון את התקציב");
      setCategories(categoriesBody.filter((x: Category) => x.type === "EXPENSE"));
      setBudgets(budgetsBody);
    } catch (e) { setError(e instanceof Error ? e.message : "לא ניתן לטעון את התקציב"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [month]);

  const budgetedIds = useMemo(() => new Set(budgets.map(b => b.categoryId)), [budgets]);
  const availableCategories = categories.filter(c => !budgetedIds.has(c.id));
  const totals = useMemo(() => budgets.reduce((a, b) => ({ limit: a.limit + b.limit, actual: a.actual + b.actual }), { limit: 0, actual: 0 }), [budgets]);
  const remaining = totals.limit - totals.actual;
  const percent = totals.limit > 0 ? (totals.actual / totals.limit) * 100 : 0;

  async function save(e: React.FormEvent) {
    e.preventDefault(); if (saving || !form.categoryId || Number(form.limit) < 0) return;
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/budgets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ categoryId: form.categoryId, month, limit: Number(form.limit), class: form.class }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "לא ניתן לשמור תקציב");
      setForm({ categoryId: "", limit: "", class: "VARIABLE" });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "לא ניתן לשמור תקציב"); }
    finally { setSaving(false); }
  }

  function shiftMonth(delta: number) {
    const [y, m] = month.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }

  return <main className="page-shell" dir="rtl">
    <header className="page-header">
      <div><p className="eyebrow">תכנון משפחתי</p><h1 className="page-title">תקציב</h1><p className="page-subtitle">מגדירים מסגרת לכל קטגוריה ורואים מיד כמה נוצל וכמה נשאר.</p></div>
      <Link href="/plan" className="secondary-button inline-flex items-center gap-2">תוכנית החודש <ArrowLeft size={15} /></Link>
    </header>

    {error && <div role="alert" className="error-banner">{error}</div>}

    <section className="decision-metrics">
      <article className="decision-metric"><span>תקציב כולל</span><strong>{money(totals.limit)}</strong><small>{budgets.length} קטגוריות מוגדרות</small></article>
      <article className="decision-metric"><span>בוצע בפועל</span><strong>{money(totals.actual)}</strong><small>לפי התנועות בפועל</small></article>
      <article className={`decision-metric ${remaining < 0 ? "decision-metric-danger" : "decision-metric-primary"}`}><span>{remaining < 0 ? "חריגה" : "נשאר"}</span><strong>{money(Math.abs(remaining))}</strong><small>{totals.limit > 0 ? `${Math.round(percent)}% מהתקציב נוצל` : "טרם הוגדר תקציב"}</small></article>
    </section>

    <section className="decision-card">
      <div className="decision-card-header flex-wrap">
        <div><h2>חודש התקציב</h2><p>התקציב נשמר בנפרד לכל חודש.</p></div>
        <div className="flex items-center gap-2"><button aria-label="חודש קודם" onClick={() => shiftMonth(-1)} className="secondary-button p-2"><ChevronRight size={17} /></button><input aria-label="חודש" type="month" value={month} onChange={e => setMonth(e.target.value)} className="input-professional" /><button aria-label="חודש הבא" onClick={() => shiftMonth(1)} className="secondary-button p-2"><ChevronLeft size={17} /></button><button aria-label="רענון" onClick={load} className="secondary-button p-2"><RefreshCw size={16} /></button></div>
      </div>
    </section>

    <section className="decision-card">
      <div className="decision-card-header"><div><h2>הוספת קטגוריה לתקציב</h2><p>אפשר להגדיר הוצאה קשיחה או משתנה. שמירה חוזרת לחודש שנבחר.</p></div></div>
      <form onSubmit={save} className="grid gap-3 p-4 md:grid-cols-4">
        <select required value={form.categoryId} onChange={e => setForm({ ...form, categoryId: e.target.value })} className="input-professional"><option value="">בחר קטגוריה</option>{availableCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <input required min="0" max="999999999" step="0.01" type="number" placeholder="סכום חודשי" value={form.limit} onChange={e => setForm({ ...form, limit: e.target.value })} className="input-professional" />
        <select value={form.class} onChange={e => setForm({ ...form, class: e.target.value as "HARD" | "VARIABLE" })} className="input-professional"><option value="VARIABLE">הוצאה משתנה</option><option value="HARD">הוצאה קשיחה</option></select>
        <button disabled={saving || availableCategories.length === 0} className="primary-button inline-flex items-center justify-center gap-2"><Plus size={16} />{saving ? "שומר..." : "הוספת תקציב"}</button>
      </form>
      {availableCategories.length === 0 && <p className="px-4 pb-4 text-xs text-slate-500">כל קטגוריות ההוצאה כבר מוגדרות בתקציב לחודש הזה.</p>}
    </section>

    <section className="decision-card overflow-hidden">
      <div className="decision-card-header"><div><h2>התקציבים שלי</h2><p>{month} · נתוני ביצוע מחושבים מתנועות החודש.</p></div></div>
      {loading ? <div className="p-8 text-center text-sm text-slate-500">טוען...</div> : budgets.length === 0 ? <div className="empty-state m-4">אין עדיין תקציבים לחודש הזה. הוסף את הקטגוריות החשובות למעלה.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-4 text-right">קטגוריה</th><th className="p-4 text-right">סוג</th><th className="p-4 text-right">תקציב</th><th className="p-4 text-right">בוצע</th><th className="p-4 text-right">נשאר</th><th className="p-4 text-right">ניצול</th><th className="p-4 text-right">מצב</th></tr></thead><tbody>{budgets.map(b => { const over = b.remaining < 0; const p = Math.max(0, b.percent); return <tr key={b.categoryId} className="border-t border-slate-100"><td className="p-4 font-semibold text-slate-900">{b.name}</td><td className="p-4 text-slate-500">{b.class === "HARD" ? "קשיחה" : "משתנה"}</td><td className="p-4">{money(b.limit)}</td><td className="p-4 font-semibold">{money(b.actual)}</td><td className={`p-4 font-semibold ${over ? "text-red-600" : "text-emerald-700"}`}>{over ? `-${money(Math.abs(b.remaining))}` : money(b.remaining)}</td><td className="p-4 min-w-[150px]"><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.min(100, p)}%` }} /></div><small className="mt-1 block text-slate-500">{Math.round(p)}%</small></td><td className="p-4">{over ? <span className="font-bold text-red-600">חריגה</span> : p >= 90 ? <span className="font-bold text-amber-600">קרוב לתקרה</span> : <span className="font-bold text-emerald-700">תקין</span>}</td></tr>; })}</tbody></table></div>}
    </section>
  </main>;
}
