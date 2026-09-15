"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

function formatIls(value: number) {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(value);
}

type Status = {
  needsReview: number;
  amount: number;
  hasReviewItems: boolean;
};

export default function ClassificationAttentionBanner() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/classification/status", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: Status | null) => {
        if (active && data) setStatus(data);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  if (!status?.hasReviewItems) return null;

  return (
    <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-right shadow-sm dark:border-amber-900 dark:bg-amber-950/30">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-xl bg-amber-100 p-2 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold text-amber-950 dark:text-amber-100">יש תנועות שמחכות לסיווג</div>
            <div className="mt-0.5 text-sm text-amber-800 dark:text-amber-200">
              {status.needsReview.toLocaleString("he-IL")} תנועות · {formatIls(status.amount)} · שום דבר לא ישתנה בלי אישורך
            </div>
          </div>
        </div>
        <Link
          href="/classification?autostart=1"
          className="inline-flex shrink-0 items-center justify-center rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700"
        >
          סווג עם Gemini
        </Link>
      </div>
    </div>
  );
}
