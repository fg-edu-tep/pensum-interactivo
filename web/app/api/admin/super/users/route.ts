import { NextResponse } from "next/server";
import {
  createUser,
  listUsers,
  usernamePolicyError,
} from "@/lib/auth/users";
import { passwordPolicyError } from "@/lib/auth/password";
import { currentActor } from "@/lib/auth/actor";
import { writeAudit } from "@/lib/audit";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ users: await listUsers() });
}

export async function POST(req: Request) {
  let username = "";
  let password = "";
  let displayName = "";
  try {
    const body = (await req.json()) as Record<string, unknown>;
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

  try {
    const user = await createUser({ username, password, displayName });
    await writeAudit({
      actor: await currentActor(),
      action: "user.create",
      entityType: "AdminUser",
      entityId: user.id,
      after: { username: user.username },
    });
    return NextResponse.json({ ok: true, user });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Ese usuario ya existe." },
        { status: 409 }
      );
    }
    throw err;
  }
}
