import Link from "next/link";
import LogoutButton from "./LogoutButton";

export default function Nav({ name }: { name: string }) {
  return (
    <aside className="w-full md:w-64 bg-white border-l border-gray-200 min-h-screen p-5">
      <div className="text-2xl font-black mb-1">FamilyBudget</div>
      <div className="text-sm text-gray-500 mb-8">{name}</div>
      <nav className="space-y-2">
        <Link className="block rounded-xl px-4 py-3 hover:bg-gray-100" href="/dashboard">📊 לוח בקרה</Link>
        <Link className="block rounded-xl px-4 py-3 hover:bg-gray-100" href="/transactions">💳 תנועות</Link>
        <Link className="block rounded-xl bg-indigo-50 px-4 py-3 font-semibold text-indigo-700 hover:bg-indigo-100" href="/import">📥 ייבוא Excel + Gemini</Link>
        <Link className="block rounded-xl px-4 py-3 hover:bg-gray-100" href="/budgets">🎯 תקציבים</Link>
        <Link className="block rounded-xl px-4 py-3 hover:bg-gray-100" href="/settings">⚙️ הגדרות</Link>
      </nav>
      <div className="mt-8 border-t pt-5"><LogoutButton /></div>
    </aside>
  );
}
