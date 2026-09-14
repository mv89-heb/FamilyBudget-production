"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileSpreadsheet, Plus, Search, Upload, CreditCard } from "lucide-react";
import { useSearchParams } from "next/navigation";

type Cat = { id: string; name: string; type: "INCOME" | "EXPENSE" };
type Method = { id: string; nickname: string; last4: string | null; institution: string | null };
type Tx = { id: string; type: "INCOME" | "EXPENSE"; amount: number | string; transactionDate: string; category: { name: string }; paymentMethod: Method | null; note: string | null; categoryId: string; paymentMethodId: string | null };
type FormState = { type: "INCOME" | "EXPENSE"; amount: string | number; transactionDate: string; categoryId: string; paymentMethodId: string; note: string };
const PAGE_SIZE = 100;
const initial = (): FormState => ({ type: "EXPENSE", amount: "", transactionDate: new Date().toISOString().slice(0, 10), categoryId: "", paymentMethodId: "", note: "" });
const currentMonth = () => new Date().toISOString().slice(0, 7);

export default function Transactions() {
  const searchParams = useSearchParams();
  const requestedMonth = searchParams.get("month");
  const [rows, setRows] = useState<Tx[]>([]), [cats, setCats] = useState<Cat[]>([]), [methods, setMethods] = useState<Method[]>([]);
  const [month, setMonth] = useState(requestedMonth === "all" || /^\d{4}-\d{2}$/.test(requestedMonth || "") ? requestedMonth || currentMonth() : currentMonth());
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1), [hasNextPage, setHasNextPage] = useState(false);
  const [form, setForm] = useState<FormState>(initial()), [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [loading, setLoading] = useState(false);

  useEffect(() => { if (requestedMonth === "all" || /^\d{4}-\d{2}$/.test(requestedMonth || "")) { setMonth(requestedMonth as string); setPage(1); } }, [requestedMonth]);

  async function load(targetPage = page) {
    setLoading(true); setError("");
    try {
      const [a, b, c] = await Promise.all([
        fetch(`/api/transactions?month=${encodeURIComponent(month)}&page=${targetPage}&limit=${PAGE_SIZE}`, { cache: "no-store" }),
        fetch("/api/categories", { cache: "no-store" }), fetch("/api/payment-methods", { cache: "no-store" }),
      ]);
      if (!a.ok || !b.ok || !c.ok) throw new Error("לא ניתן לטעון את נתוני התנועות");
      setRows(await a.json()); setCats(await b.json()); setMethods(await c.json()); setHasNextPage(a.headers.get("X-Has-Next-Page") === "true");
    } finally { setLoading(false); }
  }
  useEffect(() => { load(page).catch(e => setError(e instanceof Error ? e.message : "לא ניתן לטעון נתונים")); }, [month, page]);

  const filteredRows = search.trim() ? rows.filter(r => `${r.category?.name || ""} ${r.note || ""} ${r.paymentMethod?.nickname || ""}`.toLocaleLowerCase("he").includes(search.trim().toLocaleLowerCase("he"))) : rows;
  const filteredCats = cats.filter(c => c.type === form.type);

  async function save(e: React.FormEvent) {
    e.preventDefault(); if (busy) return; setError(""); setBusy(true);
    try {
      const url = editing ? `/api/transactions/${editing}` : "/api/transactions";
      const res = await fetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const d = await res.json(); if (!res.ok) throw new Error(d.error || "שגיאה בשמירת התנועה");
      setEditing(null); setForm(initial()); await load(page);
    } catch (e) { setError(e instanceof Error ? e.message : "שגיאה בשמירת התנועה"); } finally { setBusy(false); }
  }
  async function remove(id: string) {
    if (!confirm("למחוק את התנועה?")) return;
    const res = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
    if (!res.ok) setError("לא ניתן למחוק את התנועה"); else await load(page);
  }
  function edit(r: Tx) { setEditing(r.id); setForm({ type: r.type, amount: Number(r.amount), transactionDate: r.transactionDate.slice(0, 10), categoryId: r.categoryId, paymentMethodId: r.paymentMethodId || "", note: r.note || "" }); }
  const periodLabel = month === "all" ? "כל התקופות" : new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00`));

  return <div className="space-y-6" dir="rtl">
    <header className="page-header"><div><div className="eyebrow"><CreditCard size={14} /> מקור האמת</div><h1 className="page-title">תנועות וייבוא</h1><p className="page-subtitle">כל הפעולות היומיומיות במקום אחד. קודם בודקים, אחר כך צוללים לפרטים.</p></div></header>

    <section className="card-elevated overflow-hidden">
      <div className="grid md:grid-cols-3">
        <Link href="/import" className="group border-b border-slate-100 p-5 transition hover:bg-slate-50 md:border-b-0 md:border-l"><div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700"><FileSpreadsheet size={19} /></div><strong className="block text-sm text-slate-900">ייבוא Excel</strong><span className="mt-1 block text-xs leading-5 text-slate-500">דוח בנק או קובץ אשראי. זיהוי וסיווג אוטומטי.</span><span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-indigo-600">התחל ייבוא <ArrowLeft size={13} /></span></Link>
        <Link href="/import/credit-card-pdf" className="group border-b border-slate-100 p-5 transition hover:bg-slate-50 md:border-b-0 md:border-l"><div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700"><Upload size={19} /></div><strong className="block text-sm text-slate-900">ייבוא PDF אשראי</strong><span className="mt-1 block text-xs leading-5 text-slate-500">בדיקת כפילויות, פרטיות וייבוא מחדש בטוח.</span><span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-indigo-600">העלה פירוט <ArrowLeft size={13} /></span></Link>
        <Link href="/credit-card-transactions" className="group p-5 transition hover:bg-slate-50"><div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700"><CreditCard size={19} /></div><strong className="block text-sm text-slate-900">פירוט אשראי</strong><span className="mt-1 block text-xs leading-5 text-slate-500">לפרטים המלאים של רכישות, תשלומים והחזרים.</span><span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-indigo-600">צפה <ArrowLeft size={13} /></span></Link>
      </div>
    </section>

    <details className="card-elevated overflow-hidden" open={Boolean(editing)}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-4 [&::-webkit-details-marker]:hidden"><div><strong className="text-sm text-slate-900">{editing ? "עריכת תנועה" : "הוספת תנועה ידנית"}</strong><p className="mt-1 text-xs text-slate-500">ברוב המקרים עדיף לייבא. השתמש בזה לתיקון או לתנועה בודדת.</p></div><span className="secondary-button inline-flex items-center gap-2"><Plus size={15} /> {editing ? "עריכה פתוחה" : "פתיחה"}</span></summary>
      <form onSubmit={save} className="grid gap-3 p-5 md:grid-cols-6">
        <select aria-label="סוג תנועה" value={form.type} onChange={e => setForm({ ...form, type: e.target.value as FormState["type"], categoryId: "" })} className="input-professional"><option value="EXPENSE">הוצאה</option><option value="INCOME">הכנסה</option></select>
        <input required type="number" step="0.01" min="0.01" max="999999999" placeholder="סכום" aria-label="סכום" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="input-professional" />
        <input required type="date" aria-label="תאריך" value={form.transactionDate} onChange={e => setForm({ ...form, transactionDate: e.target.value })} className="input-professional" />
        <select required aria-label="קטגוריה" value={form.categoryId} onChange={e => setForm({ ...form, categoryId: e.target.value })} className="input-professional"><option value="">קטגוריה</option>{filteredCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select aria-label="אמצעי תשלום" value={form.paymentMethodId} onChange={e => setForm({ ...form, paymentMethodId: e.target.value })} className="input-professional"><option value="">אמצעי תשלום</option>{methods.map(m => <option key={m.id} value={m.id}>{m.nickname}{m.last4 ? ` •••• ${m.last4}` : ""}</option>)}</select>
        <input maxLength={500} placeholder="הערה (אופציונלי)" aria-label="הערה" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="input-professional" />
        <div className="flex gap-2 md:col-span-6"><button disabled={busy} className="primary-button">{busy ? "שומר..." : editing ? "שמירת שינוי" : "הוספת תנועה"}</button>{editing && <button type="button" onClick={() => { setEditing(null); setForm(initial()); }} className="secondary-button">ביטול</button>}</div>
      </form>
    </details>

    <section className="card-elevated overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 md:flex-row md:items-center md:justify-between"><div><h2 className="font-bold text-slate-900">כל תנועות החשבון</h2><p className="mt-1 text-xs text-slate-500">{periodLabel} · {filteredRows.length} תנועות מוצגות</p></div><div className="flex flex-wrap gap-2"><select aria-label="בחירת תקופה" value={month === "all" ? "all" : "month"} onChange={e => { setMonth(e.target.value === "all" ? "all" : currentMonth()); setPage(1); }} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"><option value="month">חודש נבחר</option><option value="all">כל התקופות</option></select>{month !== "all" && <input aria-label="בחירת חודש" type="month" value={month} onChange={e => { setMonth(e.target.value); setPage(1); }} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />}<div className="relative"><Search size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש מהיר" aria-label="חיפוש מהיר" className="w-44 rounded-xl border border-slate-200 bg-slate-50 py-2 pl-3 pr-9 text-sm outline-none focus:border-indigo-500" /></div></div></div>
      {error && <div role="alert" className="m-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}
      <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="bg-slate-50/80 text-slate-500"><tr><th className="p-4 text-right font-semibold">תאריך</th><th className="p-4 text-right font-semibold">קטגוריה</th><th className="p-4 text-right font-semibold">אמצעי</th><th className="p-4 text-right font-semibold">סכום</th><th className="p-4 text-right font-semibold">פעולות</th></tr></thead><tbody>{filteredRows.map(r => <tr key={r.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50/60"><td className="p-4 text-slate-600">{new Date(r.transactionDate).toLocaleDateString("he-IL")}</td><td className="p-4 font-medium text-slate-900">{r.category?.name || "לא סווג"}</td><td className="p-4 text-slate-500">{r.paymentMethod ? `${r.paymentMethod.nickname}${r.paymentMethod.last4 ? ` •••• ${r.paymentMethod.last4}` : ""}` : "—"}</td><td className={`p-4 font-bold ${r.type === "EXPENSE" ? "text-slate-800" : "text-emerald-700"}`}>{r.type === "EXPENSE" ? "-" : "+"}{Number(r.amount).toLocaleString("he-IL", { style: "currency", currency: "ILS" })}</td><td className="p-4"><div className="flex gap-3"><button onClick={() => edit(r)} className="font-medium text-indigo-600 hover:text-indigo-800">עריכה</button><button onClick={() => remove(r.id)} className="font-medium text-red-600 hover:text-red-800">מחיקה</button></div></td></tr>)}</tbody></table></div>
      {filteredRows.length === 0 && !loading && <div className="px-6 py-14 text-center"><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-xl">₪</div><p className="font-semibold text-slate-900">אין תנועות תואמות</p><p className="mt-1 text-sm text-slate-500">נסה לשנות חודש או חיפוש, או ייבא קובץ חדש.</p></div>}
      {(page > 1 || hasNextPage) && <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 p-4"><button disabled={page === 1 || loading} onClick={() => setPage(p => Math.max(1, p - 1))} className="secondary-button disabled:opacity-40">הקודם</button><span className="text-sm font-medium text-slate-500">עמוד {page}</span><button disabled={!hasNextPage || loading} onClick={() => setPage(p => p + 1)} className="secondary-button disabled:opacity-40">הבא</button></div>}
    </section>
  </div>;
}
