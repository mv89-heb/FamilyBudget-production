"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, LogOut, Settings, Wallet, CalendarDays, Layers3, ShieldCheck } from "lucide-react";
import LogoutButton from "./LogoutButton";

type NavProps = { name: string };
type Item = { href: string; label: string; icon: typeof BarChart3 };

const items: Item[] = [
  { href: "/dashboard", label: "סקירה", icon: BarChart3 },
  { href: "/transactions", label: "תנועות וייבוא", icon: Layers3 },
  { href: "/plan", label: "תוכנית החודש", icon: CalendarDays },
  { href: "/loans", label: "התחייבויות וקופות", icon: Wallet },
  { href: "/financial-control", label: "בקרה פיננסית", icon: ShieldCheck },
];

function isActive(pathname: string, href: string) { return href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`); }

export default function Nav({ name }: NavProps) {
  const pathname = usePathname();
  return <aside className="app-sidebar"><div className="sidebar-inner">
    <Link href="/dashboard" className="brand" aria-label="FamilyBudget - סקירה"><span className="brand-mark"><Wallet size={21} strokeWidth={2.5} /></span><span><span className="brand-name">FamilyBudget</span><span className="brand-subtitle">ניהול תקציב משפחתי</span></span></Link>
    <div className="user-card"><div className="avatar" aria-hidden="true">{name.trim().charAt(0) || "מ"}</div><div className="min-w-0"><div className="user-label">שלום,</div><div className="user-name" title={name}>{name}</div></div></div>
    <nav className="nav-list" aria-label="ניווט ראשי">{items.map(({ href, label, icon: Icon }) => { const active = isActive(pathname, href); return <Link key={href} href={href} className={`nav-item${active ? " active" : ""}`} aria-current={active ? "page" : undefined}><Icon size={19} strokeWidth={active ? 2.5 : 2} /><span>{label}</span></Link>; })}</nav>
    <div className="sidebar-spacer" />
    <Link href="/settings" className={`nav-item sidebar-settings${isActive(pathname, "/settings") ? " active" : ""}`}><Settings size={19} /><span>הגדרות</span></Link>
    <div className="sidebar-footer"><LogOut size={17} className="text-slate-400" /><LogoutButton /></div>
  </div></aside>;
}
