import type { DataStatus } from "../../lib/data-quality";

const statusLabels: Record<DataStatus, string> = {
  HAS_DATA: "",
  REAL_ZERO: "",
  NO_DATA: "טרם דווח",
  PARTIAL_DATA: "נתונים חלקיים",
  INSUFFICIENT_HISTORY: "אין מספיק היסטוריה",
  STALE_DATA: "הנתונים עשויים להיות לא מעודכנים",
};

function formatIls(value: number) {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(value);
}

type MoneyValueProps = {
  value: number | null;
  status: DataStatus;
  className?: string;
  showStatus?: boolean;
};

export function MoneyValue({ value, status, className = "", showStatus = true }: MoneyValueProps) {
  const known = value !== null && status !== "NO_DATA" && status !== "INSUFFICIENT_HISTORY";
  const text = known ? formatIls(value) : "—";
  const label = statusLabels[status];

  return (
    <span className={`money-value money-value-${status.toLowerCase()} ${className}`} title={label || undefined}>
      <span>{text}</span>
      {showStatus && label ? <small className="money-value-status">{label}</small> : null}
    </span>
  );
}
