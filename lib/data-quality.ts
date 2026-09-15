export type DataStatus =
  | "HAS_DATA"
  | "REAL_ZERO"
  | "NO_DATA"
  | "PARTIAL_DATA"
  | "INSUFFICIENT_HISTORY"
  | "STALE_DATA";

export type DataSource =
  | "LEDGER"
  | "BUDGET"
  | "LOAN"
  | "ASSET"
  | "BANK"
  | "FORECAST"
  | "SINKING_FUND";

export type FinancialValue = {
  value: number | null;
  status: DataStatus;
  source: DataSource;
  updatedAt?: string;
  label?: string;
};

export type HistoricalPoint = {
  period: string;
  value: number | null;
  status: DataStatus;
};

export type HistoricalSeries = {
  points: HistoricalPoint[];
  availablePeriods: number;
  requestedPeriods: number;
};

export type DataQualitySummary = {
  status: DataStatus;
  missingSources: DataSource[];
  lastUpdated: string | null;
};

export function financialValue(
  value: number | null | undefined,
  source: DataSource,
  options: { hasData?: boolean; partial?: boolean; stale?: boolean; updatedAt?: string; label?: string } = {},
): FinancialValue {
  const { hasData = value !== null && value !== undefined, partial = false, stale = false, updatedAt, label } = options;

  if (!hasData) {
    return { value: null, status: "NO_DATA", source, updatedAt, label };
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return { value: null, status: "NO_DATA", source, updatedAt, label };
  }

  if (partial) {
    return { value: numericValue, status: "PARTIAL_DATA", source, updatedAt, label };
  }

  if (stale) {
    return { value: numericValue, status: "STALE_DATA", source, updatedAt, label };
  }

  return {
    value: numericValue,
    status: numericValue === 0 ? "REAL_ZERO" : "HAS_DATA",
    source,
    updatedAt,
    label,
  };
}

export function historicalSeries(
  points: Array<{ period: string; value: number | null | undefined; status?: DataStatus }>,
  requestedPeriods = points.length,
): HistoricalSeries {
  const normalized = points.map((point) => {
    if (point.value === null || point.value === undefined || !Number.isFinite(Number(point.value))) {
      return { period: point.period, value: null, status: point.status ?? "NO_DATA" };
    }

    const value = Number(point.value);
    return {
      period: point.period,
      value,
      status: point.status ?? (value === 0 ? "REAL_ZERO" : "HAS_DATA"),
    };
  });

  return {
    points: normalized,
    availablePeriods: normalized.filter((point) => point.status === "HAS_DATA" || point.status === "REAL_ZERO" || point.status === "PARTIAL_DATA" || point.status === "STALE_DATA").length,
    requestedPeriods,
  };
}

export function canCompareHistory(series: HistoricalSeries, minimumPeriods = 3): boolean {
  return series.availablePeriods >= minimumPeriods;
}

export function averageKnownValues(series: HistoricalSeries): number | null {
  const known = series.points
    .filter((point) => point.value !== null && point.status !== "NO_DATA" && point.status !== "INSUFFICIENT_HISTORY")
    .map((point) => Number(point.value));

  if (known.length === 0) return null;
  return known.reduce((sum, value) => sum + value, 0) / known.length;
}

export function historyStatus(series: HistoricalSeries, minimumPeriods = 3): DataStatus {
  if (series.availablePeriods === 0) return "NO_DATA";
  if (series.availablePeriods < minimumPeriods) return "INSUFFICIENT_HISTORY";
  if (series.points.some((point) => point.status === "PARTIAL_DATA" || point.status === "STALE_DATA")) return "PARTIAL_DATA";
  return "HAS_DATA";
}
