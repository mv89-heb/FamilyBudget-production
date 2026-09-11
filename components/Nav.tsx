"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CreditCard, FileSpreadsheet, LogOut, Settings, Target, Wallet, PiggyBank, CalendarDays } from "lucide-react";
import LogoutButton from "./LogoutButton";

type NavProps = { name: string };
type Item = { href: string; label: string; icon: typeof BarChart3 };
const items: Item[] = [
  { href: "/dashboard", label: "לוח בקרה", icon: BarChart3 },
  { href: "/plan", label: "תוכנית החודש", icon: CalendarDays },
  { href: "/transactions", label: "הכנסות והוצאות", icon: CreditCard },
  { href: "/import", label: "ייבוא Excel", icon: FileSpreadsheet },
  { href: "/budgets", label: "תקציבים", icon: Target },
  { href: "/loans", label: "הלוואות", icon: PiggyBank },
  { href: "/settings", label: "הגדרות", icon: Settings },
];
function isActive(pathname: string, href: string) { return href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`); }
export default function Nav({ name }: NavProps) {
  const pathname = usePathname();
  return <aside className="app-sidebar"><div className="sidebar-inner">
    <Link href="/dashboard" className="brand" aria-label="FamilyBudget - לוח בקרה"><span className="brand-mark"><Wallet size={21} strokeWidth={2.5} /></span><span><span className="brand-name">FamilyBudget</span><span className="brand-subtitle">ניהול תקציב משפחתי</span></span></Link>
    <div className="user-card"><div className="avatar" aria-hidden="true">{name.trim().charAt(0) || "מ"}</div><div className="min-w-0"><div className="user-label">שלום,</div><div className="user-name" title={name}>{name}</div></div></div>
    <nav className="nav-list" aria-label="ניווט ראשי">{items.map(({ href, label, icon: Icon }) => { const active = isActive(pathname, href); return <Link key={href} href={href} className={`nav-item${active ? " active" : ""}`} aria-current={active ? "page" : undefined}><Icon size={19} strokeWidth={active ? 2.5 : 2} /><span>{label}</span>{href === "/import" && <span className="nav-badge">חדש</span>}</Link>; })}</nav>
    <div className="sidebar-spacer" /><div className="sidebar-tip"><div className="tip-icon"><BarChart3 size={17} /></div><div><strong>טיפ קטן</strong><p>עדיף לבדוק את התקציב פעם בשבוע מאשר לחכות לסוף החודש.</p></div></div><div className="sidebar-footer"><LogOut size={17} className="text-slate-400" /><LogoutButton /></div>
  </div></aside>;
}
