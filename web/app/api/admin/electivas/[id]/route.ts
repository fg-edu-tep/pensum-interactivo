import { normalizeCode } from "@/lib/import/normalizeCode";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { normalizeName } from "@/lib/import/textMatch";
import { buildRoles, termList } from "@/lib/admin/electiveShape";

export const runtime = "nodejs";

/** PATCH — edit one Elective row. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = Number((await params).id);
  const row = await prisma.elective.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "Electiva no encontrada." }, { status: 404 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });

  const data: Prisma.ElectiveUncheckedUpdateInput = {};
  if ("name" in body) {
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "El nombre no puede quedar vacío." }, { status: 400 });
    const normalizedName = normalizeName(name);
    if (normalizedName !== row.normalizedName) {
      const clash = await prisma.elective.findUnique({ where: { normalizedName } });
      if (clash && clash.id !== id) {
        return NextResponse.json({ error: "Otro registro ya usa ese nombre." }, { status: 409 });
      }
    }
    data.name = name;
    data.normalizedName = normalizedName;
  }
  if ("code" in body) {
    data.code = normalizeCode(body.code) || null;
    // an admin-set code is kept by later seeds (they only fill blanks)
    data.codeSource = data.code ? "admin" : null;
  }
  if ("nextOfferingTerm" in body) {
    const t = String(body.nextOfferingTerm ?? "").trim();
    if (t && !/^\d{4}(10|20|19)$/.test(t)) {
      return NextResponse.json({ error: "Próxima oferta: usa el formato AAAAPP (p. ej. 202710)." }, { status: 400 });
    }
    data.nextOfferingTerm = t || null;
  }
  if ("level" in body) data.level = String(body.level ?? "pregrado").trim() || "pregrado";
  if ("ciclo" in body) data.ciclo = String(body.ciclo ?? "").trim() || null;
  if ("isCursoIntegrador" in body) data.isCursoIntegrador = Boolean(body.isCursoIntegrador);
  if ("roles" in body) data.roles = buildRoles(body.roles);
  if ("offeredTerms" in body)
    data.offeredTerms = termList(body.offeredTerms) as unknown as Prisma.InputJsonValue;

  await prisma.elective.update({ where: { id }, data });
  await writeAudit({
    action: "elective.update",
    entityType: "Elective",
    entityId: id,
    before: row,
    after: data,
  });
  return NextResponse.json({ ok: true });
}

/** DELETE — remove one Elective row. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = Number((await params).id);
  const row = await prisma.elective.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "Electiva no encontrada." }, { status: 404 });
  await prisma.elective.delete({ where: { id } });
  await writeAudit({
    action: "elective.delete",
    entityType: "Elective",
    entityId: id,
    before: row,
  });
  return NextResponse.json({ ok: true });
}
