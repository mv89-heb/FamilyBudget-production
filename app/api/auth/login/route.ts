import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSession, verifyPassword } from "@/lib/auth";

const schema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(8).max(200) });
const attempts = new Map<string, { count: number; resetAt: number }>();

function limit(key: string) {
  const now = Date.now(); const current = attempts.get(key);
  if (!current || current.resetAt <= now) { attempts.set(key, { count: 1, resetAt: now + 60_000 }); return true; }
  current.count += 1; return current.count <= 8;
}

export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  if (!limit(`login:${ip}`)) return NextResponse.json({ error: "ניסיונות רבים מדי. נסה שוב בעוד דקה." }, { status: 429 });
  try {
    const input = schema.parse(await req.json());
    const email = input.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    const valid = user ? await verifyPassword(input.password, user.passwordHash) : false;
    if (!user || !valid) return NextResponse.json({ error: "אימייל או סיסמה שגויים" }, { status: 401 });
    await createSession(user.id);
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 }); }
}
