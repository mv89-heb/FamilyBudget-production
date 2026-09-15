"use client";

import { useState } from "react";
import FinancialDashboardV3 from "@/components/FinancialDashboardV3";
import { DashboardDrilldown, type DashboardDetailRow } from "@/components/DashboardDrilldown";

type DrilldownType = "income" | "expenses" | "debts" | "cashflow";

const labelToType: Record<string, DrilldownType> = {
  "הכנסות": "income",
  "הוצאות שוטפות": "expenses",
  "תשלומי חוב": "debts",
  "תזרים נטו": "cashflow",
};

export default function Dashboard() {
  const [drilldown, setDrilldown] = useState<{ type: DrilldownType; rows: DashboardDetailRow[]; total: number } | null>(null);
  const [loading, setLoading] = useState(false);

  async function openDrilldown(type: DrilldownType) {
    if (loading) return;
    setLoading(true);
    try {
      const month = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit" }).formatToParts(new Date());
      const currentMonth = `${month.find(part => part.type === "year")?.value}-${month.find(part => part.type === "month")?.value}`;
      const response = await fetch(`/api/dashboard?month=${encodeURIComponent(currentMonth)}`, { cache: "no-store", headers: { Accept: "application/json" } });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "לא ניתן לטעון את הפירוט");
      const rows = (data.drilldown?.[type] || []) as DashboardDetailRow[];
      const totals: Record<DrilldownType, number> = {
        income: Number(data.income || 0),
        expenses: Number(data.expense || 0),
        debts: Number(data.actualDebtPayments || 0),
        cashflow: Number(data.netCashFlow || 0),
      };
      setDrilldown({ type, rows, total: totals[type] });
    } catch (error) {
      console.error("Dashboard drilldown failed", error);
    } finally {
      setLoading(false);
    }
  }

  function handleDashboardClick(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement | null;
    const card = target?.closest(".dashboard-drilldown-enabled .rounded-2xl.border.p-4.shadow-sm");
    if (!(card instanceof HTMLElement)) return;
    const label = card.querySelector("span.text-xs.font-bold")?.textContent?.trim() || "";
    const type = labelToType[label];
    if (!type) return;
    void openDrilldown(type);
  }

  return <div className="dashboard-drilldown-enabled" onClick={handleDashboardClick}>
    <FinancialDashboardV3 />
    {drilldown && <DashboardDrilldown type={drilldown.type} rows={drilldown.rows} total={drilldown.total} onClose={() => setDrilldown(null)} />}
    {loading && <div className="pointer-events-none fixed bottom-5 left-5 z-40 rounded-full bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-lg">טוען פירוט…</div>}
  </div>;
}
