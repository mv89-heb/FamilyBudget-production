import { createHash } from "node:crypto";

export type TransactionIdentityInput = {
  source: "BANK" | "CREDIT_CARD";
  date: string;
  type: "INCOME" | "EXPENSE";
  amount: number;
  note?: string | null;
  paymentMethodName?: string | null;
  kind?: string | null;
};

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("he");
}

export function transactionIdentityPayload(input: TransactionIdentityInput) {
  return {
    source: input.source,
    date: input.date,
    type: input.type,
    amount: Number(input.amount.toFixed(2)),
    note: normalizeText(input.note),
    paymentMethodName: normalizeText(input.paymentMethodName),
    kind: normalizeText(input.kind),
  };
}

export function transactionFingerprint(input: TransactionIdentityInput) {
  return createHash("sha256")
    .update(JSON.stringify(transactionIdentityPayload(input)))
    .digest("hex");
}
