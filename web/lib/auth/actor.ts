// Server-side helper: who is acting right now, for audit attribution. Reads the
// signed admin session cookie. Route handlers (nodejs runtime) call currentActor()
// and pass the result into writeAudit({ actor }). Falls back to "admin" so audit
// writes never fail just because the cookie couldn't be read.

import { cookies } from "next/headers";
import { SESSION_COOKIE, sessionUsername } from "./session";

export async function currentActor(): Promise<string> {
  try {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    const uname = await sessionUsername(token);
    return uname ?? "admin";
  } catch {
    return "admin";
  }
}
