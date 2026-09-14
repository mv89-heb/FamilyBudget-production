import FinancialPlan from "@/components/FinancialPlan";
import FinancialPlanInsights from "@/components/FinancialPlanInsights";

export default function PlanPage() {
  return (
    <>
      <FinancialPlan />
      <details className="decision-card" dir="rtl">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
          <div><h2 className="text-lg font-extrabold text-slate-900">ניתוח AI אופציונלי</h2><p className="mt-1 text-xs text-slate-500">פותחים רק כשצריך הסבר או המלצה נוספת. לא חלק מהמעקב היומיומי.</p></div>
          <span className="secondary-button">פתיחה</span>
        </summary>
        <div className="mt-4"><FinancialPlanInsights /></div>
      </details>
    </>
  );
}
