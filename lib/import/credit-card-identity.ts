export type CreditCardIdentityInput = {
  date?: string;
  purchaseDate?: Date;
  type: "CHARGE" | "REFUND";
  amount: number;
  merchant: string;
  note?: string | null;
  installmentNumber?: number | null;
  installmentTotal?: number | null;
  paymentMethodId?: string | null;
};

export type CreditCardIdentityCandidate = {
  purchaseDate: Date;
  type: "CHARGE" | "REFUND";
  amount: unknown;
  merchant: string;
  note: string | null;
  installmentNumber?: number | null;
  installmentTotal?: number | null;
  paymentMethodId?: string | null;
};

export function normalizeCreditCardText(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("he")
    .normalize("NFKC")
    .replace(/[\u200e\u200f]/g, "")
    .replace(/["'׳״`´]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[|,;]+/g, " ")
    .trim();
}

export function creditCardIdentityMatches(input: CreditCardIdentityInput, candidate: CreditCardIdentityCandidate) {
  const candidateAmount = Number(candidate.amount);
  const inputDate = input.date ?? input.purchaseDate?.toISOString().slice(0, 10);
  if (!inputDate) return false;
  if (!Number.isFinite(candidateAmount) || Math.abs(candidateAmount - input.amount) > 0.005) return false;
  if (candidate.type !== input.type) return false;
  if (candidate.purchaseDate.toISOString().slice(0, 10) !== inputDate) return false;
  if (normalizeCreditCardText(candidate.merchant) !== normalizeCreditCardText(input.merchant)) return false;
  if (normalizeCreditCardText(candidate.note) !== normalizeCreditCardText(input.note)) return false;
  if ((candidate.installmentNumber ?? null) !== (input.installmentNumber ?? null)) return false;
  if ((candidate.installmentTotal ?? null) !== (input.installmentTotal ?? null)) return false;
  if (input.paymentMethodId && candidate.paymentMethodId && input.paymentMethodId !== candidate.paymentMethodId) return false;
  return true;
}

export function creditCardIdentityDateRange(date: string): { from: Date; to: Date };
export function creditCardIdentityDateRange(rows: Array<{ date: Date }>): { from: Date; to: Date } | null;
export function creditCardIdentityDateRange(value: string | Array<{ date: Date }>) {
  if (typeof value === "string") {
    return {
      from: new Date(`${value}T00:00:00.000Z`),
      to: new Date(`${value}T23:59:59.999Z`),
    };
  }
  if (!value.length) return null;
  const timestamps = value.map(item => item.date.getTime()).filter(Number.isFinite);
  if (!timestamps.length) return null;
  return {
    from: new Date(Math.min(...timestamps)),
    to: new Date(Math.max(...timestamps) + 86_399_999),
  };
}
