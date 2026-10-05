import { NextResponse } from "next/server";
import { verifyMasterSecret } from "@/lib/auth/users";
import {
  SUPER_COOKIE,
  createSuperToken,
  superCookieOptions,
} from "@/lib/auth/session";
import { currentActor } from "@/lib/auth/actor";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

/** Exchange the 12-word master secret for a short-lived super cookie. */
export async function POST(req: Request) {
  let phrase = "";
  try {
    const body = (await req.json()) as { mnemonic?: unknown };
    phrase = String(body.mnemonic ?? "");
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  if (!phrase.trim()) {
    return NextResponse.json(
      { error: "Ingresa la frase maestra." },
      { status: 400 }
    );
  }

  const ok = await verifyMasterSecret(phrase);
  const actor = await currentActor();
  if (!ok) {
    await writeAudit({
      actor,
      action: "super.unlock.fail",
      entityType: "AdminSetting",
      entityId: "master_secret",
    });
    return NextResponse.json({ error: "Frase maestra incorrecta." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SUPER_COOKIE, await createSuperToken(), superCookieOptions());
  await writeAudit({
    actor,
    action: "super.unlock",
    entityType: "AdminSetting",
    entityId: "master_secret",
  });
  return res;
}
