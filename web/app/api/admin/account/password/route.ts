import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, sessionUsername } from "@/lib/auth/session";
import { changeOwnPassword, normalizeUsername } from "@/lib/auth/users";
import { passwordPolicyError } from "@/lib/auth/password";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

/** Change the logged-in user's own password (verifies the current one). */
export async function POST(req: Request) {
  const store = await cookies();
  const username = await sessionUsername(store.get(SESSION_COOKIE)?.value);
  if (!username) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const user = await prisma.adminUser.findUnique({
    where: { username: normalizeUsername(username) },
  });
  if (!user) {
    return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  }

  let current = "";
  let next = "";
  try {
    const body = (await req.json()) as { current?: unknown; next?: unknown };
    current = String(body.current ?? "");
    next = String(body.next ?? "");
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const pErr = passwordPolicyError(next);
  if (pErr) return NextResponse.json({ error: pErr }, { status: 400 });

  const ok = await changeOwnPassword(user.id, current, next);
  if (!ok) {
    return NextResponse.json(
      { error: "La contraseña actual es incorrecta." },
      { status: 401 }
    );
  }

  await writeAudit({
    actor: user.username,
    action: "user.change_password",
    entityType: "AdminUser",
    entityId: user.id,
  });
  return NextResponse.json({ ok: true });
}
