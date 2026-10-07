import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SUPER_COOKIE,
  sessionCookieOptions,
  superCookieOptions,
} from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(0), maxAge: 0 });
  res.cookies.set(SUPER_COOKIE, "", { ...superCookieOptions(0), maxAge: 0 });
  return res;
}
