import type { DataStatus } from "../../lib/data-quality";

const config: Record<DataStatus, { label: string; className: string }> = {
  HAS_DATA: { label: "נתונים זמינים", className: "bg-emerald-50 text-emerald-700 border-emerald-100" },
  REAL_ZERO: { label: "אין פעילות", className: "bg-slate-50 text-slate-600 border-slate-200" },
  NO_DATA: { label: "טרם דווח", className: "bg-slate-50 text-slate-500 border-slate-200" },
  PARTIAL_DATA: { label: "נתונים חלקיים", className: "bg-amber-50 text-amber-700 border-amber-100" },
  INSUFFICIENT_HISTORY: { label: "אין מספיק היסטוריה", className: "bg-slate-50 text-slate-500 border-slate-200" },
  STALE_DATA: { label: "ייתכן שהנתונים לא מעודכנים", className: "bg-amber-50 text-amber-700 border-amber-100" },
};

type DataQualityBadgeProps = { status: DataStatus; className?: string };

export function DataQualityBadge({ status, className = "" }: DataQualityBadgeProps) {
  const item = config[status];
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold ${item.className} ${className}`}>{item.label}</span>;
}
