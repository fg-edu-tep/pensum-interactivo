import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, sessionUsername } from "@/lib/auth/session";
import { normalizeUsername } from "@/lib/auth/users";
import { revokeApiToken } from "@/lib/auth/apiTokens";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

/** Revoke one of the logged-in user's own tokens. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const store = await cookies();
  const username = await sessionUsername(store.get(SESSION_COOKIE)?.value);
  const user = username
    ? await prisma.adminUser.findUnique({ where: { username: normalizeUsername(username) }, select: { id: true, username: true } })
    : null;
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const id = Number((await params).id);
  if (!(await revokeApiToken(user.id, id))) {
    return NextResponse.json({ error: "Token no encontrado o ya revocado." }, { status: 404 });
  }
  await writeAudit({ actor: user.username, action: "token.revoke", entityType: "AdminApiToken", entityId: id });
  return NextResponse.json({ ok: true });
}
