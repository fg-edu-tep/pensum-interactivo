import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, sessionUsername } from "@/lib/auth/session";
import { normalizeUsername } from "@/lib/auth/users";
import { createApiToken, listApiTokens } from "@/lib/auth/apiTokens";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

async function me() {
  const store = await cookies();
  const username = await sessionUsername(store.get(SESSION_COOKIE)?.value);
  if (!username) return null;
  return prisma.adminUser.findUnique({ where: { username: normalizeUsername(username) }, select: { id: true, username: true } });
}

/** The logged-in user's MCP access tokens (never the secrets). */
export async function GET() {
  const user = await me();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  return NextResponse.json({ tokens: await listApiTokens(user.id) });
}

/** Create a token for the logged-in user; the secret is returned only here. */
export async function POST(req: Request) {
  const user = await me();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { name?: unknown; expiresInDays?: unknown } | null;
  const days = body?.expiresInDays == null || body.expiresInDays === "" ? null : Number(body.expiresInDays);
  if (days !== null && (!Number.isInteger(days) || days < 1 || days > 730)) {
    return NextResponse.json({ error: "Vencimiento inválido." }, { status: 400 });
  }
  const out = await createApiToken(user.id, String(body?.name ?? ""), days);
  if ("error" in out) return NextResponse.json({ error: out.error }, { status: 400 });
  await writeAudit({
    actor: user.username,
    action: "token.create",
    entityType: "AdminApiToken",
    entityId: out.row.id,
    after: { name: out.row.name, prefix: out.row.prefix, expiresAt: out.row.expiresAt },
  });
  return NextResponse.json({ secret: out.secret, token: out.row });
}
