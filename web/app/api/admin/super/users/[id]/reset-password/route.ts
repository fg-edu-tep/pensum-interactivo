import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { adminResetPassword } from "@/lib/auth/users";
import { passwordPolicyError } from "@/lib/auth/password";
import { currentActor } from "@/lib/auth/actor";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

/**
 * Super-admin password recovery: set a user's password to a chosen temporary
 * value and flag mustReset so the user is nudged to change it on next login.
 * The super-admin communicates the temp password to the user out-of-band.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = Number((await params).id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Id inválido." }, { status: 400 });
  }
  const user = await prisma.adminUser.findUnique({ where: { id } });
  if (!user) return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });

  let password = "";
  try {
    const body = (await req.json()) as { password?: unknown };
    password = String(body.password ?? "");
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  const pErr = passwordPolicyError(password);
  if (pErr) return NextResponse.json({ error: pErr }, { status: 400 });

  await adminResetPassword(id, password);
  await writeAudit({
    actor: await currentActor(),
    action: "user.reset_password",
    entityType: "AdminUser",
    entityId: id,
    after: { username: user.username, mustReset: true },
  });
  return NextResponse.json({ ok: true });
}
