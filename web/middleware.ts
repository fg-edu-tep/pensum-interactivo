import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  SUPER_COOKIE,
  verifySessionToken,
  verifySuperToken,
} from "@/lib/auth/session";

// Gate everything under /administrador and /api/admin except the public
// endpoints below. Runs on the Edge runtime — session.ts uses Web Crypto only
// (no Prisma, no node:crypto here). DB-dependent checks (is the app initialized?)
// live in the setup page / API themselves, not here.
export const config = {
  matcher: ["/administrador/:path*", "/api/admin/:path*"],
};

// Reachable without a session:
//   - login / logout
//   - the one-time setup page + API (they self-guard on isInitialized())
const PUBLIC_PATHS = new Set([
  "/administrador/login",
  "/administrador/setup",
  "/api/admin/login",
  "/api/admin/logout",
  "/api/admin/setup",
  "/api/admin/setup/state",
]);

// The super-panel additionally needs the master-secret "super" cookie. The
// unlock landing page (/administrador/super exactly) and the unlock endpoint
// are reachable with just a normal session — they're how you get the cookie.
function isSuperArea(pathname: string): boolean {
  if (pathname === "/administrador/super") return false; // unlock UI
  if (pathname === "/api/admin/super/unlock") return false; // unlock endpoint
  return (
    pathname.startsWith("/administrador/super") ||
    pathname.startsWith("/api/admin/super")
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  // 1) must be logged in
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const loggedIn = await verifySessionToken(token);
  if (!loggedIn) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/administrador/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // 2) super area additionally needs the master-secret unlock cookie
  if (isSuperArea(pathname)) {
    const superOk = await verifySuperToken(req.cookies.get(SUPER_COOKIE)?.value);
    if (!superOk) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "super-locked" }, { status: 403 });
      }
      const url = req.nextUrl.clone();
      url.pathname = "/administrador/super";
      url.search = ""; // the super landing renders the unlock form
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}
