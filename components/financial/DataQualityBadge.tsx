import type { DataStatus } from "../../lib/data-quality";

const config: Record<DataStatus, { label: string; tone: string }> = {
  HAS_DATA: { label: "נתונים זמינים", tone: "good" },
  REAL_ZERO: { label: "אין פעילות", tone: "neutral" },
  NO_DATA: { label: "טרם דווח", tone: "unknown" },
  PARTIAL_DATA: { label: "נתונים חלקיים", tone: "warning" },
  INSUFFICIENT_HISTORY: { label: "אין מספיק היסטוריה", tone: "unknown" },
  STALE_DATA: { label: "ייתכן שהנתונים לא מעודכנים", tone: "warning" },
};

type DataQualityBadgeProps = {
  status: DataStatus;
  className?: string;
};

export function DataQualityBadge({ status, className = "" }: DataQualityBadgeProps) {
  const item = config[status];
  return <span className={`data-quality-badge data-quality-${item.tone} ${className}`}>{item.label}</span>;
}
