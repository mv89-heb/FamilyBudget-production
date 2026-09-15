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

const tones: Record<FinancialKpiTone, string> = {
  neutral: "border-slate-200 bg-white",
  positive: "border-emerald-100 bg-emerald-50/50",
  warning: "border-amber-100 bg-amber-50/50",
  negative: "border-red-100 bg-red-50/50",
};

export function FinancialKpi({ label, value, status = "HAS_DATA", hint, tone = "neutral", icon, href }: FinancialKpiProps) {
  const content = (
    <div className={`rounded-2xl border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${tones[tone]}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs font-bold text-slate-500">{label}</span>
        {icon ? <span className="grid h-8 w-8 place-items-center rounded-xl bg-white/80 text-slate-500" aria-hidden="true">{icon}</span> : null}
      </div>
      <MoneyValue value={value} status={status} className="text-xl font-extrabold tracking-tight text-slate-900" />
      {hint ? <p className="mt-1.5 text-[11px] leading-5 text-slate-500">{hint}</p> : null}
    </div>
  );

  return href ? <a className="block" href={href}>{content}</a> : content;
}
