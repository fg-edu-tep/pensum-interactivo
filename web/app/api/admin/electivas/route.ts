import { normalizeCode } from "@/lib/import/normalizeCode";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { normalizeName } from "@/lib/import/textMatch";
import { buildRoles, termList } from "@/lib/admin/electiveShape";

export const runtime = "nodejs";

/** POST — add an Elective row. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const name = String(body?.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });
  }
  const normalizedName = normalizeName(name);
  const existing = await prisma.elective.findUnique({ where: { normalizedName } });
  if (existing) {
    return NextResponse.json(
      { error: "Ya existe una electiva con ese nombre." },
      { status: 409 }
    );
  }

  const level = String(body?.level ?? "pregrado").trim() || "pregrado";
  const created = await prisma.elective.create({
    data: {
      name,
      normalizedName,
      code: normalizeCode(body?.code) || null,
      codeSource: normalizeCode(body?.code) ? "admin" : null,
      level,
      ciclo: String(body?.ciclo ?? "").trim() || null,
      roles: buildRoles(body?.roles),
      isCursoIntegrador: Boolean(body?.isCursoIntegrador),
      offeredTerms: termList(body?.offeredTerms) as unknown as Prisma.InputJsonValue,
      sourceFiles: [] as unknown as Prisma.InputJsonValue,
    },
  });
  await writeAudit({
    action: "elective.create",
    entityType: "Elective",
    entityId: created.id,
    after: { name },
  });
  return NextResponse.json({ ok: true, id: created.id });
}
