export type CreditCardIdentityInput = {
  date: string;
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
  installmentNumber: number | null;
  installmentTotal: number | null;
  paymentMethodId: string | null;
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
  if (!Number.isFinite(candidateAmount) || Math.abs(candidateAmount - input.amount) > 0.005) return false;
  if (candidate.type !== input.type) return false;
  if (candidate.purchaseDate.toISOString().slice(0, 10) !== input.date) return false;
  if (normalizeCreditCardText(candidate.merchant) !== normalizeCreditCardText(input.merchant)) return false;
  if (normalizeCreditCardText(candidate.note) !== normalizeCreditCardText(input.note)) return false;
  if ((candidate.installmentNumber ?? null) !== (input.installmentNumber ?? null)) return false;
  if ((candidate.installmentTotal ?? null) !== (input.installmentTotal ?? null)) return false;
  if (input.paymentMethodId && candidate.paymentMethodId && input.paymentMethodId !== candidate.paymentMethodId) return false;
  return true;
}

export function creditCardIdentityDateRange(date: string) {
  return {
    gte: new Date(`${date}T00:00:00.000Z`),
    lte: new Date(`${date}T23:59:59.999Z`),
  };
}
