import type { ReactNode } from "react";

import { MoneyValue } from "./MoneyValue";

export type FinancialKpiTone = "neutral" | "positive" | "warning" | "negative";

type FinancialKpiProps = {
  label: string;
  value: number | null;
  status?: "HAS_DATA" | "REAL_ZERO" | "NO_DATA" | "PARTIAL_DATA" | "INSUFFICIENT_HISTORY" | "STALE_DATA";
  hint?: string;
  tone?: FinancialKpiTone;
  icon?: ReactNode;
  href?: string;
};

export function FinancialKpi({ label, value, status = "HAS_DATA", hint, tone = "neutral", icon, href }: FinancialKpiProps) {
  const content = (
    <div className={`financial-kpi financial-kpi-${tone}`}>
      <div className="financial-kpi-top">
        <span className="financial-kpi-label">{label}</span>
        {icon ? <span className="financial-kpi-icon" aria-hidden="true">{icon}</span> : null}
      </div>
      <MoneyValue value={value} status={status} className="financial-kpi-value" />
      {hint ? <p className="financial-kpi-hint">{hint}</p> : null}
    </div>
  );

  return href ? <a className="financial-kpi-link" href={href}>{content}</a> : content;
}
