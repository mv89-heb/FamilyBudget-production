"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, CreditCard, FileSpreadsheet, Plus, Search, Upload } from "lucide-react";
import { useSearchParams } from "next/navigation";

type Cat = { id: string; name: string; type: "INCOME" | "EXPENSE" };
type Method = { id: string; nickname: string; last4: string | null; institution: string | null };
type Tx = {
  id: string;
  type: "INCOME" | "EXPENSE";
  kind?: string;
  amount: number | string;
  transactionDate: string;
  category: { name: string };
  paymentMethod: Method | null;
  note: string | null;
  categoryId: string;
  paymentMethodId: string | null;
  loanId?: string | null;
};
type FormState = {
  type: "INCOME" | "EXPENSE";
  amount: string | number;
  transactionDate: string;
  categoryId: string;
  paymentMethodId: string;
  note: string;
};

const PAGE_SIZE = 100;

function localDateString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function localMonthString() {
  return localDateString().slice(0, 7);
}

const initial = (): FormState => ({
  type: "EXPENSE",
  amount: "",
  transactionDate: localDateString(),
  categoryId: "",
  paymentMethodId: "",
  note: "",
});

function displayDate(value: string) {
  const dateOnly = value.slice(0, 10);
  const [year, month, day] = dateOnly.split("-").map(Number);
  if (!year || !month || !day) return dateOnly;
  return new Intl.DateTimeFormat("he-IL").format(new Date(year, month - 1, day));
}

export default function Transactions() {
  const searchParams = useSearchParams();
  const requestedMonth = searchParams.get("month");
  const initialMonth = requestedMonth === "all" || /^\d{4}-\d{2}$/.test(requestedMonth || "") ? requestedMonth || localMonthString() : localMonthString();

  const [rows, setRows] = useState<Tx[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [methods, setMethods] = useState<Method[]>([]);
  const [month, setMonth] = useState(initialMonth);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [form, setForm] = useState<FormState>(initial());
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (requestedMonth === "all" || /^\d{4}-\d{2}$/.test(requestedMonth || "")) {
      setMonth(requestedMonth as string);
      setPage(1);
    }
  }, [requestedMonth]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const [transactionsRes, categoriesRes, methodsRes] = await Promise.all([
          fetch(`/api/transactions?month=${encodeURIComponent(month)}&q=${encodeURIComponent(search.trim())}&page=${page}&limit=${PAGE_SIZE}`, { cache: "no-store" }),
          fetch("/api/categories", { cache: "no-store" }),
          fetch("/api/payment-methods", { cache: "no-store" }),
        ]);
        if (!transactionsRes.ok || !categoriesRes.ok || !methodsRes.ok) throw new Error("לא ניתן לטעון את נתוני התנועות");
        const [transactionData, categoryData, methodData] = await Promise.all([
          transactionsRes.json(),
          categoriesRes.json(),
          methodsRes.json(),
        ]);
        if (cancelled) return;
        setRows(transactionData);
        setCats(categoryData);
        setMethods(methodData);
        setHasNextPage(transactionsRes.headers.get("X-Has-Next-Page") === "true");
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "לא ניתן לטעון נתונים");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, search.trim() ? 300 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [month, page, search]);

  const filteredCats = useMemo(() => cats.filter((c) => c.type === form.type), [cats, form.type]);
  const periodLabel = month === "all"
    ? "כל התקופות"
    : new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00`));

  function changeSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function changeMonth(value: string) {
    setMonth(value);
    setPage(1);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const url = editing ? `/api/transactions/${editing}` : "/api/transactions";
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "שגיאה בשמירת התנועה");
      setEditing(null);
      setForm(initial());
      setPage(1);
      setSearch("");
      setMonth(form.transactionDate.slice(0, 7));
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בשמירת התנועה");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("למחוק את התנועה?")) return;
    setError("");
    const res = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error || "לא ניתן למחוק את התנועה");
      return;
    }
    if (rows.length === 1 && page > 1) setPage((value) => value - 1);
    else setPage(1);
  }

  function edit(row: Tx) {
    setEditing(row.id);
    setForm({
      type: row.type,
      amount: Number(row.amount),
      transactionDate: row.transactionDate.slice(0, 10),
      categoryId: row.categoryId,
      paymentMethodId: row.paymentMethodId || "",
      note: row.note || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditing(null);
    setForm(initial());
  }

  return (
    <div className="space-y-6" dir="rtl">
      <header className="page-header">
        <div>
          <div className="eyebrow"><CreditCard size={14} /> מקור האמת</div>
          <h1 className="page-title">תנועות וייבוא</h1>
          <p className="page-subtitle">כל ההכנסות וההוצאות במקום אחד, עם חיפוש, עריכה וייבוא בטוח.</p>
        </div>
      </header>

      <section className="card-elevated overflow-hidden">
        <div className="grid md:grid-cols-3">
          <Link href="/import" className="group border-b border-slate-100 p-5 transition hover:bg-slate-50 md:border-b-0 md:border-l">
            <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700"><FileSpreadsheet size={19} /></div>
            <strong className="block text-sm text-slate-900">ייבוא Excel</strong>
            <span className="mt-1 block text-xs leading-5 text-slate-500">דוח בנק או קובץ אשראי. זיהוי וסיווג אוטומטי.</span>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-indigo-600">התחל ייבוא <ArrowLeft size={13} /></span>
          </Link>
          <Link href="/import/credit-card-pdf" className="group border-b border-slate-100 p-5 transition hover:bg-slate-50 md:border-b-0 md:border-l">
            <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700"><Upload size={19} /></div>
            <strong className="block text-sm text-slate-900">ייבוא PDF אשראי</strong>
            <span className="mt-1 block text-xs leading-5 text-slate-500">בדיקת כפילויות, פרטיות וייבוא מחדש בטוח.</span>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-indigo-600">העלה פירוט <ArrowLeft size={13} /></span>
          </Link>
          <Link href="/credit-card-transactions" className="group p-5 transition hover:bg-slate-50">
            <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700"><CreditCard size={19} /></div>
            <strong className="block text-sm text-slate-900">פירוט אשראי</strong>
            <span className="mt-1 block text-xs leading-5 text-slate-500">לפרטים המלאים של רכישות, תשלומים והחזרים.</span>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-indigo-600">צפה <ArrowLeft size={13} /></span>
          </Link>
        </div>
      </section>

      <details className="card-elevated overflow-hidden" open={Boolean(editing)}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <div>
            <strong className="text-sm text-slate-900">{editing ? "עריכת תנועה" : "הוספת תנועה ידנית"}</strong>
            <p className="mt-1 text-xs text-slate-500">ברוב המקרים עדיף לייבא. השתמש בזה לתיקון או לתנועה בודדת.</p>
          </div>
          <span className="secondary-button inline-flex items-center gap-2"><Plus size={15} /> {editing ? "עריכה פתוחה" : "פתיחה"}</span>
        </summary>
        <form onSubmit={save} className="grid gap-3 p-5 md:grid-cols-6">
          <select aria-label="סוג תנועה" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as FormState["type"], categoryId: "" })} className="input-professional">
            <option value="EXPENSE">הוצאה</option><option value="INCOME">הכנסה</option>
          </select>
          <input required type="number" step="0.01" min="0.01" max="999999999" placeholder="סכום" aria-label="סכום" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="input-professional" />
          <input required type="date" aria-label="תאריך" value={form.transactionDate} onChange={(e) => setForm({ ...form, transactionDate: e.target.value })} className="input-professional" />
          <select required aria-label="קטגוריה" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="input-professional">
            <option value="">קטגוריה</option>{filteredCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select aria-label="אמצעי תשלום" value={form.paymentMethodId} onChange={(e) => setForm({ ...form, paymentMethodId: e.target.value })} className="input-professional">
            <option value="">אמצעי תשלום</option>{methods.map((m) => <option key={m.id} value={m.id}>{m.nickname}{m.last4 ? ` •••• ${m.last4}` : ""}</option>)}
          </select>
          <input maxLength={500} placeholder="הערה (אופציונלי)" aria-label="הערה" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="input-professional" />
          <div className="flex gap-2 md:col-span-6">
            <button disabled={busy} className="primary-button">{busy ? "שומר..." : editing ? "שמירת שינוי" : "הוספת תנועה"}</button>
            {editing && <button type="button" onClick={cancelEdit} className="secondary-button">ביטול</button>}
          </div>
        </form>
      </details>

      <section className="card-elevated overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-bold text-slate-900">כל תנועות החשבון</h2>
            <p className="mt-1 text-xs text-slate-500">{periodLabel} · {rows.length} תנועות בעמוד הנוכחי{search.trim() ? " · החיפוש מתבצע על כל התקופה" : ""}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select aria-label="בחירת תקופה" value={month} onChange={(e) => changeMonth(e.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <option value={localMonthString()}>החודש הנוכחי</option><option value="all">כל התקופות</option>
              {month !== "all" && month !== localMonthString() && <option value={month}>{periodLabel}</option>}
            </select>
            {month !== "all" && <input aria-label="בחירת חודש" type="month" value={month} onChange={(e) => changeMonth(e.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />}
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(e) => changeSearch(e.target.value)} placeholder="חיפוש בכל התנועות" aria-label="חיפוש בכל התנועות" className="w-52 rounded-xl border border-slate-200 bg-slate-50 py-2 pl-3 pr-9 text-sm outline-none focus:border-indigo-500" />
            </div>
          </div>
        </div>

        {error && <div role="alert" className="m-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}
        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">טוען תנועות...</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-sm font-semibold text-slate-700">לא נמצאו תנועות</div>
            <div className="mt-1 text-xs text-slate-500">נסה לשנות את התקופה או את החיפוש.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-50/80 text-slate-500">
                <tr><th className="p-4 text-right font-semibold">תאריך</th><th className="p-4 text-right font-semibold">קטגוריה</th><th className="p-4 text-right font-semibold">הערה</th><th className="p-4 text-right font-semibold">אמצעי</th><th className="p-4 text-right font-semibold">סוג</th><th className="p-4 text-right font-semibold">סכום</th><th className="p-4 text-right font-semibold">פעולות</th></tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50/60">
                    <td className="p-4 whitespace-nowrap text-slate-600">{displayDate(row.transactionDate)}</td>
                    <td className="p-4 font-medium text-slate-900">{row.category?.name || "לא סווג"}</td>
                    <td className="max-w-[220px] truncate p-4 text-slate-500" title={row.note || undefined}>{row.note || "—"}</td>
                    <td className="p-4 text-slate-500">{row.paymentMethod ? `${row.paymentMethod.nickname}${row.paymentMethod.last4 ? ` •••• ${row.paymentMethod.last4}` : ""}` : "—"}</td>
                    <td className="p-4 text-xs text-slate-500">{row.kind === "LOAN_PRINCIPAL" ? "קרן חוב" : row.kind === "LOAN_INTEREST" ? "ריבית" : row.kind === "TRANSFER" ? "העברה" : row.kind === "REFUND" ? "החזר" : row.type === "INCOME" ? "הכנסה" : "הוצאה"}</td>
                    <td className={`p-4 font-bold ${row.type === "EXPENSE" ? "text-slate-800" : "text-emerald-700"}`}>{row.type === "EXPENSE" ? "-" : "+"}{Number(row.amount).toLocaleString("he-IL", { style: "currency", currency: "ILS" })}</td>
                    <td className="p-4"><div className="flex gap-3"><button onClick={() => edit(row)} className="font-medium text-indigo-600 hover:text-indigo-800">עריכה</button><button onClick={() => remove(row.id)} className="font-medium text-red-600 hover:text-red-800">מחיקה</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4">
          <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} className="secondary-button inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"><ChevronRight size={15} /> הקודם</button>
          <span className="text-xs font-medium text-slate-500">עמוד {page}</span>
          <button type="button" disabled={!hasNextPage || loading} onClick={() => setPage((value) => value + 1)} className="secondary-button inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50">הבא <ChevronLeft size={15} /></button>
        </div>
      </section>
    </div>
  );
}
