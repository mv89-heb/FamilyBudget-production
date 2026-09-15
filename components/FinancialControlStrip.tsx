"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Landmark, TrendingUp } from "lucide-react";

const money = (value: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(value);

type ControlData = {
  debts?: { outstanding: number; monthlyPayments: number; principalPaid: number };
  netWorth?: { assets: number; liabilities: number; netWorth: number };
};

export default function FinancialControlStrip() {
  const [data, setData] = useState<ControlData | null>(null);

  useEffect(() => {
    fetch("/api/dashboard", { cache: "no-store", headers: { Accept: "application/json" } })
      .then(async (response) => response.ok ? response.json() : null)
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (!data) return null;

  return <section dir="rtl" className="mb-6 grid gap-3 md:grid-cols-3">
    <Link href="/loans" className="card-elevated group p-4 transition hover:-translate-y-0.5 hover:border-indigo-200">
      <div className="flex items-center justify-between gap-3"><div><div className="text-xs font-bold text-slate-400">חוב והתחייבויות</div><div className="mt-1 text-xl font-black text-slate-900">{money(data.debts?.outstanding ?? 0)}</div><div className="mt-1 text-xs text-slate-500">{money(data.debts?.monthlyPayments ?? 0)} תשלום חודשי · {money(data.debts?.principalPaid ?? 0)} קרן החודש</div></div><Landmark size={20} className="text-slate-300 group-hover:text-indigo-500" /></div>
    </Link>
    <Link href="/financial-control" className="card-elevated group p-4 transition hover:-translate-y-0.5 hover:border-indigo-200">
      <div className="flex items-center justify-between gap-3"><div><div className="text-xs font-bold text-slate-400">שווי נקי רשום</div><div className="mt-1 text-xl font-black text-slate-900">{money(data.netWorth?.netWorth ?? 0)}</div><div className="mt-1 text-xs text-slate-500">נכסים {money(data.netWorth?.assets ?? 0)} · התחייבויות {money(data.netWorth?.liabilities ?? 0)}</div></div><TrendingUp size={20} className="text-slate-300 group-hover:text-emerald-500" /></div>
    </Link>
    <Link href="/financial-control" className="card-elevated group p-4 transition hover:-translate-y-0.5 hover:border-indigo-200">
      <div className="text-xs font-bold text-slate-400">מקור האמת</div><div className="mt-1 text-sm font-black text-slate-900">תנועות → Ledger → תקציב → חובות → שווי נקי</div><div className="mt-1 text-xs text-slate-500">כל המסכים נשענים על אותו חישוב מרכזי.</div>
    </Link>
  </section>;
}
