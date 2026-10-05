import { NextResponse } from "next/server";
import { rotateMasterSecret } from "@/lib/auth/users";
import { generateMnemonic } from "@/lib/auth/mnemonic";
import { currentActor } from "@/lib/auth/actor";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

/**
 * Rotate the master secret. Generates a fresh 12-word phrase, stores its hash,
 * and returns it once. The old phrase stops working immediately. Requires an
 * active super session (gated by middleware).
 */
export async function POST() {
  const mnemonic = generateMnemonic();
  await rotateMasterSecret(mnemonic);
  await writeAudit({
    actor: await currentActor(),
    action: "super.rotate_master_secret",
    entityType: "AdminSetting",
    entityId: "master_secret",
  });
  return NextResponse.json({ ok: true, mnemonic });
}
