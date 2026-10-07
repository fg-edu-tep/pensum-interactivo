import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { deleteUser, setUserDisabled, countUsers } from "@/lib/auth/users";
import { currentActor } from "@/lib/auth/actor";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

async function loadUser(id: number) {
  if (!Number.isFinite(id)) return null;
  return prisma.adminUser.findUnique({ where: { id } });
}

/** PATCH — enable/disable a user. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = Number((await params).id);
  const user = await loadUser(id);
  if (!user) return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { disabled?: unknown };
  const disabled = Boolean(body.disabled);

  // guard: never disable the last enabled account (would lock everyone out)
  if (disabled && !user.disabled) {
    const enabled = await prisma.adminUser.count({ where: { disabled: false } });
    if (enabled <= 1) {
      return NextResponse.json(
        { error: "No puedes deshabilitar el último usuario activo." },
        { status: 409 }
      );
    }
  }

  await setUserDisabled(id, disabled);
  await writeAudit({
    actor: await currentActor(),
    action: disabled ? "user.disable" : "user.enable",
    entityType: "AdminUser",
    entityId: id,
    before: { disabled: user.disabled },
    after: { disabled },
  });
  return NextResponse.json({ ok: true });
}

/** DELETE — remove a user. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = Number((await params).id);
  const user = await loadUser(id);
  if (!user) return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });

  // guard: never delete the last account
  if ((await countUsers()) <= 1) {
    return NextResponse.json(
      { error: "No puedes eliminar el último usuario." },
      { status: 409 }
    );
  }

  await deleteUser(id);
  await writeAudit({
    actor: await currentActor(),
    action: "user.delete",
    entityType: "AdminUser",
    entityId: id,
    before: { username: user.username },
  });
  return NextResponse.json({ ok: true });
}
