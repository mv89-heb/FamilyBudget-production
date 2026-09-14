export type ClassifiedPresentation = {
  name: string;
  reason: string | null;
  isDebt: boolean;
  isCreditCardPayment: boolean;
  isSavings: boolean;
  isEssential: boolean;
};

/**
 * Presentation-only classifier for legacy/imported transactions.
 * It never changes the accounting source or Transaction.kind.
 * Its purpose is to make old "אחר" rows understandable without rewriting history.
 */
export function classifyTransactionPresentation(categoryName: string | null | undefined, note: string | null | undefined): ClassifiedPresentation {
  const original = (categoryName || "").trim();
  const text = `${original} ${note || ""}`.toLocaleLowerCase("he");
  const fallback: ClassifiedPresentation = {
    name: original || "לא סווג",
    reason: null,
    isDebt: false,
    isCreditCardPayment: false,
    isSavings: false,
    isEssential: false,
  };

  if (/(ישראכרט|חיוב כרטיסי אשראי|כרטיסי אשראי)/i.test(text)) {
    return { ...fallback, name: "חיובי כרטיסי אשראי", reason: "חיוב חודשי של כרטיס אשראי; פירוט הרכישות נמצא בנפרד", isCreditCardPayment: true, isEssential: true };
  }
  if (/(בנק יהב\s*-?\s*אשראי|בנק יהב אשראי|מימון ישיר)/i.test(text)) {
    return { ...fallback, name: "תשלומי חוב", reason: "זוהה כתשלום הלוואה/חוב לפי פרטי התנועה", isDebt: true, isEssential: true };
  }
  if (/(לאומי למשכנתאות|משכנתא)/i.test(text)) {
    return { ...fallback, name: "משכנתא", reason: "זוהה כתשלום משכנתא לפי פרטי התנועה", isDebt: true, isEssential: true };
  }
  if (/(הפקדה לפקדון|פקדון|פיקדון|חיסכון)/i.test(text)) {
    return { ...fallback, name: "חיסכון ופקדונות", reason: "העברה לחיסכון אינה צריכה להופיע כהוצאה צרכנית", isSavings: true, isEssential: false };
  }
  if (/(כלל השתלמות|קרן השתלמות|פנסיה|גמל)/i.test(text)) {
    return { ...fallback, name: "חיסכון פנסיוני", reason: "הפקדה לחיסכון/חיסכון פנסיוני", isSavings: true, isEssential: true };
  }
  if (/(הראל בטוח|הראל ביטוח|ביטוח)/i.test(text)) return { ...fallback, name: "ביטוחים", reason: "זוהה כתשלום ביטוח", isEssential: true };
  if (/(עיריית בית שמש|ארנונה)/i.test(text)) return { ...fallback, name: "ארנונה", reason: "זוהה כתשלום לרשות מקומית", isEssential: true };
  if (/(מי שמש בע|מים)/i.test(text)) return { ...fallback, name: "מים", reason: "זוהה כתשלום מים", isEssential: true };
  if (/(פאמפי|דלק|תחנת דלק)/i.test(text)) return { ...fallback, name: "דלק", reason: "זוהה כתדלוק", isEssential: true };
  if (/(מכבי|בריאות|רופא|בית מרקחת|פארם)/i.test(text)) return { ...fallback, name: "בריאות", reason: "זוהה כהוצאה רפואית/בריאות", isEssential: true };
  if (/(עמלות|דמי ניהול חשבון)/i.test(text)) return { ...fallback, name: "עמלות בנק", reason: "זוהה כעמלת חשבון", isEssential: true };
  if (/(מס|מיסים|רשות המסים)/i.test(text)) return { ...fallback, name: "מיסים", reason: "זוהה כתשלום מס", isEssential: true };

  const category = original.toLocaleLowerCase("he");
  const essentialCategory = /(מזון|סופר|קניות בסופר|תחבורה|דלק|רכב|דיור|חשמל|מים|גז|ביטוח|בריאות|חינוך|ילד|גן|מעון|מיסים)/i.test(category);
  const debtCategory = /(הלווא|חוב|משכנתא)/i.test(category);
  return { ...fallback, isDebt: debtCategory, isEssential: essentialCategory || debtCategory };
}
