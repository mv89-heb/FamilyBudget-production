"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CreditCard, FileSpreadsheet, ShieldCheck, Upload } from "lucide-react";

type Row = {
  id: string;
  type: "CHARGE" | "REFUND";
  kind: "PURCHASE" | "INSTALLMENT" | "REFUND" | "FEE" | "OTHER";
  amount: number | string;
  purchaseDate: string;
  postingDate: string | null;
  merchant: string;
  note: string | null;
  reference: string | null;
  installmentTotal: number | null;
  installmentNumber: number | null;
  category: { id: string; name: string; type: "INCOME" | "EXPENSE" } | null;
  paymentMethod: { id: string; nickname: string; last4: string | null; type: string } | null;
};
type Card = { id: string; nickname: string; last4: string | null; type: string };

const money = (value: number) => value.toLocaleString("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 2 });
const currentMonth = () => new Date().toISOString().slice(0, 7);

export default function CreditCardTransactions() {
  const searchParams = useSearchParams();
  const requestedMonth = searchParams.get("month");
  const [month, setMonth] = useState(requestedMonth === "all" || /^\d{4}-\d{2}$/.test(requestedMonth || "") ? requestedMonth! : currentMonth());
  const [cardId, setCardId] = useState("all");
  const [rows, setRows] = useState<Row[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/payment-methods", { cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("לא ניתן לטעון את אמצעי התשלום");
        return response.json() as Promise<Card[]>;
      })
      .then(all => setCards(all.filter(card => card.type === "CARD")))
      .catch(() => setCards([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const allRows: Row[] = [];
        let page = 1;
        while (true) {
          const response = await fetch(`/api/credit-card-transactions?month=${encodeURIComponent(month)}&cardId=${encodeURIComponent(cardId)}&page=${page}`, { cache: "no-store" });
          if (!response.ok) throw new Error("לא ניתן לטעון תנועות אשראי");
          allRows.push(...(await response.json()) as Row[]);
          if (response.headers.get("X-Has-Next-Page") !== "true") break;
          page += 1;
        }
        if (!cancelled) setRows(allRows);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "לא ניתן לטעון נתונים");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [month, cardId]);

  const totals = useMemo(() => {
    const charges = rows.filter(row => row.type === "CHARGE").reduce((sum, row) => sum + Number(row.amount), 0);
    const refunds = rows.filter(row => row.type === "REFUND").reduce((sum, row) => sum + Number(row.amount), 0);
    return { charges, refunds, net: charges - refunds };
  }, [rows]);

  const periodLabel = month === "all" ? "כל התקופות" : new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00`));

  return (
    <div className="space-y-6">
      <header className="page-header">
        <div>
          <div className="eyebrow">כרטיסי אשראי</div>
          <h1 className="page-title">תנועות אשראי</h1>
          <p className="page-subtitle">פירוט רכישות, תשלומים, החזרים ועמלות בכרטיסי האשראי — מופרד מתנועות הבנק.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-white p-2 shadow-sm">
          <span className="px-2 text-sm text-slate-500">תקופה</span>
          <select aria-label="בחירת תקופה" value={month === "all" ? "all" : "month"} onChange={e => setMonth(e.target.value === "all" ? "all" : currentMonth())} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium outline-none focus:border-indigo-500"><option value="month">חודש נבחר</option><option value="all">כל התקופות</option></select>
          {month !== "all" && <input aria-label="בחירת חודש" type="month" value={month} onChange={e => setMonth(e.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-500" />}
          <select aria-label="בחירת כרטיס" value={cardId} onChange={e => setCardId(e.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium outline-none focus:border-indigo-500">
            <option value="all">כל הכרטיסים</option>
            {cards.map(card => <option key={card.id} value={card.id}>{card.nickname}{card.last4 ? ` · •••• ${card.last4}` : ""}</option>)}
          </select>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="card-elevated p-5"><div className="text-sm font-medium text-slate-500">חיובים</div><div className="mt-2 text-2xl font-extrabold text-red-600">-{money(totals.charges)}</div></div>
        <div className="card-elevated p-5"><div className="text-sm font-medium text-slate-500">החזרים</div><div className="mt-2 text-2xl font-extrabold text-emerald-600">+{money(totals.refunds)}</div></div>
        <div className="card-elevated p-5"><div className="text-sm font-medium text-slate-500">חיוב נטו</div><div className="mt-2 text-2xl font-extrabold text-slate-900">{money(totals.net)}</div></div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
        <div className="card-elevated p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-slate-100 p-2"><Upload size={20} /></div>
            <div><h2 className="text-lg font-extrabold text-slate-900">ייבוא פירוט אשראי</h2><p className="mt-1 text-sm text-slate-500">השלב הבא יתמוך ב־Excel וב־PDF, כולל זיהוי עמודות, תשלומים וחיובים חוזרים.</p></div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button type="button" disabled className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-400"><FileSpreadsheet size={18} />ייבוא Excel · בקרוב</button>
            <button type="button" disabled className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-400"><Upload size={18} />ייבוא PDF · בקרוב</button>
          </div>
        </div>
        <div className="card-elevated border border-emerald-100 bg-emerald-50/40 p-5">
          <div className="flex items-start gap-3"><div className="rounded-xl bg-white p-2 text-emerald-600"><ShieldCheck size={20} /></div><div><h2 className="text-lg font-extrabold text-slate-900">פרטיות כברירת מחדל</h2><p className="mt-1 text-sm leading-6 text-slate-600">לא שומרים מספר כרטיס מלא או קוד אבטחה. לניתוח AI יישלח בעתיד רק מידע שעבר הסרה/טשטוש של פרטים מזהים, ורצוי שהניתוח הבסיסי יוכל להתבצע מקומית.</p></div></div>
        </div>
      </section>

      {error && <div role="alert" className="rounded-2xl bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">{error}</div>}

      <section className="card-elevated overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="text-lg font-extrabold text-slate-900">פירוט תנועות</h2><p className="mt-1 text-xs text-slate-500">{periodLabel} · {rows.length} תנועות</p></div><CreditCard size={20} className="text-slate-400" /></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead><tr className="border-b bg-slate-50 text-right text-xs font-bold text-slate-500"><th className="px-4 py-3">תאריך</th><th className="px-4 py-3">בית עסק</th><th className="px-4 py-3">קטגוריה</th><th className="px-4 py-3">כרטיס</th><th className="px-4 py-3">סוג</th><th className="px-4 py-3">תשלום</th><th className="px-4 py-3">סכום</th></tr></thead>
            <tbody>
              {!loading && rows.length === 0 && <tr><td colSpan={7} className="px-4 py-14 text-center text-slate-500">אין עדיין תנועות אשראי. לאחר הוספת ייבוא Excel/PDF הן יופיעו כאן.</td></tr>}
              {rows.map(row => {
                const refund = row.type === "REFUND";
                const installment = row.installmentNumber && row.installmentTotal ? `תשלום ${row.installmentNumber}/${row.installmentTotal}` : row.kind === "INSTALLMENT" ? "תשלומים" : row.kind === "FEE" ? "עמלה" : row.kind === "REFUND" ? "החזר" : "רכישה";
                return <tr key={row.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50"><td className="whitespace-nowrap px-4 py-3 text-slate-600">{new Date(row.purchaseDate).toLocaleDateString("he-IL")}</td><td className="px-4 py-3 font-semibold text-slate-900"><div>{row.merchant}</div>{row.note && <div className="mt-1 max-w-[260px] truncate text-xs font-normal text-slate-500">{row.note}</div>}</td><td className="px-4 py-3 text-slate-600">{row.category?.name || "לא סווג"}</td><td className="px-4 py-3 text-slate-600">{row.paymentMethod ? `${row.paymentMethod.nickname}${row.paymentMethod.last4 ? ` · •••• ${row.paymentMethod.last4}` : ""}` : "לא משויך"}</td><td className="px-4 py-3 text-slate-600">{refund ? "החזר" : installment}</td><td className="px-4 py-3 text-slate-500">{row.postingDate ? new Date(row.postingDate).toLocaleDateString("he-IL") : "—"}</td><td className={`whitespace-nowrap px-4 py-3 font-extrabold ${refund ? "text-emerald-600" : "text-red-600"}`}>{refund ? "+" : "-"}{money(Number(row.amount))}</td></tr>;
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
