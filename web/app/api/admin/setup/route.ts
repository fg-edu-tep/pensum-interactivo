import { NextResponse } from "next/server";
import {
  completeSetup,
  isInitialized,
  usernamePolicyError,
} from "@/lib/auth/users";
import { generateMnemonic } from "@/lib/auth/mnemonic";
import { passwordPolicyError } from "@/lib/auth/password";
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

/**
 * One-time bootstrap. First-visitor-wins: reachable only while the app is
 * uninitialized. Creates the first admin user, generates the 12-word master
 * secret, returns it once (never stored in cleartext), and logs the first user
 * straight in.
 */
export async function POST(req: Request) {
  if (await isInitialized()) {
    return NextResponse.json(
      { error: "El sistema ya está configurado." },
      { status: 409 }
    );
  }

  let username = "";
  let password = "";
  let displayName = "";
  try {
    const body = (await req.json()) as {
      username?: unknown;
      password?: unknown;
      displayName?: unknown;
    };
    username = String(body.username ?? "");
    password = String(body.password ?? "");
    displayName = String(body.displayName ?? "");
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const uErr = usernamePolicyError(username);
  if (uErr) return NextResponse.json({ error: uErr }, { status: 400 });
  const pErr = passwordPolicyError(password);
  if (pErr) return NextResponse.json({ error: pErr }, { status: 400 });

  const mnemonic = generateMnemonic();

  try {
    await completeSetup({ username, password, displayName, mnemonic });
  } catch (err) {
    // completeSetup throws "already-initialized" if someone beat us to it
    if (err instanceof Error && err.message === "already-initialized") {
      return NextResponse.json(
        { error: "El sistema ya está configurado." },
        { status: 409 }
      );
    }
    throw err;
  }

  await writeAudit({
    actor: username.trim().toLowerCase(),
    action: "auth.setup",
    entityType: "AdminUser",
    entityId: username.trim().toLowerCase(),
  });

  // log the first user straight in
  const res = NextResponse.json({ ok: true, mnemonic });
  res.cookies.set(
    SESSION_COOKIE,
    await createSessionToken(username.trim().toLowerCase()),
    sessionCookieOptions()
  );
  return res;
}
