import type { DataStatus, FinancialValue } from "@/lib/data-quality";

export type DisplayTone = "neutral" | "positive" | "warning" | "critical" | "muted";

export type FinancialDisplay = {
  text: string;
  secondaryText: string | null;
  tone: DisplayTone;
  isKnown: boolean;
};

export function formatIls(value: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatFinancialValue(
  financial: FinancialValue,
  options: { emptyLabel?: string; zeroLabel?: string } = {},
): FinancialDisplay {
  const emptyLabel = options.emptyLabel ?? "טרם דווח";
  const zeroLabel = options.zeroLabel;

  switch (financial.status) {
    case "NO_DATA":
      return { text: "—", secondaryText: emptyLabel, tone: "muted", isKnown: false };
    case "INSUFFICIENT_HISTORY":
      return { text: "—", secondaryText: "אין מספיק נתונים היסטוריים", tone: "muted", isKnown: false };
    case "PARTIAL_DATA":
      return {
        text: financial.value == null ? "—" : formatIls(financial.value),
        secondaryText: "תמונת מצב חלקית",
        tone: "warning",
        isKnown: financial.value != null,
      };
    case "STALE_DATA":
      return {
        text: financial.value == null ? "—" : formatIls(financial.value),
        secondaryText: "הנתון דורש עדכון",
        tone: "warning",
        isKnown: financial.value != null,
      };
    case "REAL_ZERO":
      return {
        text: zeroLabel ?? formatIls(0),
        secondaryText: "הנתון ידוע והוא אפס",
        tone: "neutral",
        isKnown: true,
      };
    case "HAS_DATA":
      return {
        text: financial.value == null ? "—" : formatIls(financial.value),
        secondaryText: null,
        tone: "neutral",
        isKnown: financial.value != null,
      };
  }
}

export function statusLabel(status: DataStatus): string {
  switch (status) {
    case "HAS_DATA":
      return "נתונים זמינים";
    case "REAL_ZERO":
      return "אפס אמיתי";
    case "NO_DATA":
      return "טרם דווח";
    case "PARTIAL_DATA":
      return "תמונת מצב חלקית";
    case "INSUFFICIENT_HISTORY":
      return "אין מספיק היסטוריה";
    case "STALE_DATA":
      return "נדרש עדכון";
  }
}

export function trendTone(value: number | null, baseline: number | null): DisplayTone {
  if (value === null || baseline === null || baseline === 0) return "muted";
  if (value > baseline) return "warning";
  if (value < baseline) return "positive";
  return "neutral";
}
