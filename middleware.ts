import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "familybudget_session";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/_next/") || pathname === "/favicon.ico" || pathname.startsWith("/api/")) return NextResponse.next();

  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  if (pathname === "/login" && hasSession) {
    const url = req.nextUrl.clone(); url.pathname = "/dashboard"; url.search = ""; return NextResponse.redirect(url);
  }
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/transactions") || pathname.startsWith("/budgets") || pathname.startsWith("/settings")) {
    if (!hasSession) {
      const url = req.nextUrl.clone(); url.pathname = "/login"; url.searchParams.set("next", pathname); return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
