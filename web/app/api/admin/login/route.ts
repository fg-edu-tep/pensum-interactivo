import { NextResponse } from "next/server";
import { authenticate, isInitialized } from "@/lib/auth/users";
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  // If the app was never set up, there's nothing to log into yet.
  if (!(await isInitialized())) {
    return NextResponse.json(
      { error: "El sistema aún no está configurado.", needsSetup: true },
      { status: 409 }
    );
  }

  let username = "";
  let password = "";
  try {
    const body = (await req.json()) as { username?: unknown; password?: unknown };
    username = String(body.username ?? "");
    password = String(body.password ?? "");
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  if (!username || !password) {
    return NextResponse.json(
      { error: "Usuario y contraseña son obligatorios." },
      { status: 400 }
    );
  }

  const user = await authenticate(username, password);
  if (!user) {
    // generic message — don't reveal whether the username exists or is disabled
    return NextResponse.json(
      { error: "Usuario o contraseña incorrectos." },
      { status: 401 }
    );
  }

  const res = NextResponse.json({ ok: true, mustReset: user.mustReset });
  res.cookies.set(
    SESSION_COOKIE,
    await createSessionToken(user.username),
    sessionCookieOptions()
  );
  await writeAudit({
    actor: user.username,
    action: "auth.login",
    entityType: "AdminUser",
    entityId: user.id,
  });
  return res;
}
