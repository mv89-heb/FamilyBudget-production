"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

export type DashboardDetailRow = {
  id: string;
  type: "INCOME" | "EXPENSE";
  kind: string;
  amount: number;
  date: string;
  category: string;
  note: string | null;
  paymentMethod: string | null;
};

type DrilldownType = "income" | "expenses" | "debts" | "savings" | "cashflow";

const titles: Record<DrilldownType, string> = {
  income: "פירוט הכנסות",
  expenses: "פירוט הוצאות שוטפות",
  debts: "פירוט תשלומי חוב",
  savings: "פירוט חיסכון",
  cashflow: "פירוט תזרים נטו",
};

const subtitles: Record<DrilldownType, string> = {
  income: "כל ההכנסות שנקלטו בחודש הנבחר.",
  expenses: "רק הוצאות שוטפות — ללא חובות וללא חיסכון.",
  debts: "תשלומי חוב שבוצעו בפועל בחודש הנבחר.",
  savings: "העברות וחיסכון ישיר שזוהו בחודש הנבחר.",
  cashflow: "הכנסות מול כל היציאות בפועל בחודש הנבחר.",
};

const money = (value: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 2 }).format(value);
const date = (value: string) => new Intl.DateTimeFormat("he-IL").format(new Date(value));

export function DashboardDrilldown({ type, rows, total, onClose }: { type: DrilldownType; rows: DashboardDetailRow[]; total: number; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isCashflow = type === "cashflow";
  const incomeRows = rows.filter(row => row.type === "INCOME");
  const expenseRows = rows.filter(row => row.type === "EXPENSE");
  const displayRows = isCashflow ? rows : rows;

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label={titles[type]} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl" dir="rtl">
      <header className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
        <div><h2 className="text-xl font-black text-slate-900">{titles[type]}</h2><p className="mt-1 text-sm text-slate-500">{subtitles[type]}</p></div>
        <button type="button" onClick={onClose} aria-label="סגירה" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200"><X size={18} /></button>
      </header>
      <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-4">
        <div className="text-xs font-bold text-slate-500">סה״כ</div>
        <div className="mt-1 text-2xl font-black text-slate-900">{money(total)}</div>
        {isCashflow && <div className="mt-2 text-xs text-slate-500">נכנס {money(incomeRows.reduce((sum, row) => sum + row.amount, 0))} · יצא {money(expenseRows.reduce((sum, row) => sum + row.amount, 0))}</div>}
      </div>
      <div className="overflow-y-auto p-5">
        {!displayRows.length ? <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm font-semibold text-slate-500">אין תנועות להצגה בחודש הזה.</div> : <div className="space-y-2">
          {displayRows.map(row => <div key={row.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-slate-900">{row.note || row.category || "ללא תיאור"}</strong><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">{row.category || "לא סווג"}</span></div>
                <div className="mt-1 text-xs text-slate-500">{date(row.date)}{row.paymentMethod ? ` · ${row.paymentMethod}` : ""}</div>
              </div>
              <strong className={`shrink-0 text-sm ${row.type === "INCOME" ? "text-emerald-700" : "text-slate-900"}`}>{row.type === "INCOME" ? "+" : "-"}{money(row.amount)}</strong>
            </div>
          </div>)}
        </div>}
      </div>
    </section>
  </div>;
}
