"use client";

import { useEffect, useMemo, useState } from "react";

type CardTransaction = {
  id: string;
  type: "CHARGE" | "REFUND";
  kind: "PURCHASE" | "INSTALLMENT" | "REFUND" | "FEE" | "OTHER";
  amount: string | number;
  purchaseDate: string;
  postingDate: string | null;
  merchant: string;
  note: string | null;
  reference: string | null;
  installmentTotal: number | null;
  installmentNumber: number | null;
  category: { id: string; name: string; type: string } | null;
  paymentMethod: { id: string; nickname: string | null; last4: string | null; type: string } | null;
};

function formatAmount(value: string | number) {
  return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS" }).format(Number(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("he-IL", { dateStyle: "short" }).format(new Date(value));
}

export default function CreditCardTransactionsPage() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [rows, setRows] = useState<CardTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`/api/credit-card-transactions?month=${encodeURIComponent(month)}`, { credentials: "same-origin" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "לא ניתן לטעון את תנועות האשראי");
        return data as CardTransaction[];
      })
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "לא ניתן לטעון את תנועות האשראי");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [month]);

  const totals = useMemo(() => rows.reduce(
    (acc, row) => {
      const amount = Math.abs(Number(row.amount));
      if (row.kind === "REFUND" || row.type === "REFUND") acc.refunds += amount;
      else acc.charges += amount;
      return acc;
    },
    { charges: 0, refunds: 0 },
  ), [rows]);

  return (
    <main dir="rtl" className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">תנועות כרטיסי אשראי</h1>
          <p className="mt-1 text-sm text-muted-foreground">פירוט הכרטיס נשמר בנפרד מתנועות הבנק, כדי למנוע ספירה כפולה של חיובי הכרטיס.</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          חודש
          <input className="rounded-md border px-3 py-2" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        </label>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4 shadow-sm"><div className="text-sm text-muted-foreground">חיובים</div><div className="mt-1 text-xl font-semibold">{formatAmount(totals.charges)}</div></div>
        <div className="rounded-xl border bg-card p-4 shadow-sm"><div className="text-sm text-muted-foreground">זיכויים</div><div className="mt-1 text-xl font-semibold">{formatAmount(totals.refunds)}</div></div>
        <div className="rounded-xl border bg-card p-4 shadow-sm"><div className="text-sm text-muted-foreground">נטו</div><div className="mt-1 text-xl font-semibold">{formatAmount(totals.charges - totals.refunds)}</div></div>
      </section>

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        {loading ? <div className="p-8 text-center text-muted-foreground">טוען...</div> : error ? <div className="p-8 text-center text-destructive">{error}</div> : rows.length === 0 ? <div className="p-8 text-center text-muted-foreground">אין תנועות אשראי לחודש שנבחר.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="px-4 py-3">תאריך</th>
                  <th className="px-4 py-3">בית עסק</th>
                  <th className="px-4 py-3">קטגוריה</th>
                  <th className="px-4 py-3">כרטיס</th>
                  <th className="px-4 py-3">סוג</th>
                  <th className="px-4 py-3">סכום</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const refund = row.kind === "REFUND" || row.type === "REFUND";
                  return (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="px-4 py-3 whitespace-nowrap">{formatDate(row.purchaseDate)}</td>
                      <td className="px-4 py-3 font-medium">{row.merchant || "לא ידוע"}{row.note ? <div className="text-xs text-muted-foreground">{row.note}</div> : null}</td>
                      <td className="px-4 py-3">{row.category?.name || "אחר"}</td>
                      <td className="px-4 py-3">{row.paymentMethod?.nickname || (row.paymentMethod?.last4 ? `•••• ${row.paymentMethod.last4}` : "—")}</td>
                      <td className="px-4 py-3">{refund ? "זיכוי" : row.kind === "INSTALLMENT" ? `תשלומים${row.installmentNumber && row.installmentTotal ? ` ${row.installmentNumber}/${row.installmentTotal}` : ""}` : row.kind === "FEE" ? "עמלה" : "רכישה"}</td>
                      <td className="px-4 py-3 font-semibold">{refund ? "−" : ""}{formatAmount(row.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
