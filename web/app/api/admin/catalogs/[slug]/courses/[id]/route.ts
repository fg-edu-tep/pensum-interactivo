import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { normalizeCode } from "@/lib/import/normalizeCode";
import { parseRequirement } from "@/lib/import/requirementParser";
import { syncCatalogCourses, type SyncedCourse } from "@/lib/pairing/syncCatalogCourses";

export const runtime = "nodejs";
// a rebind pulls the course's offering + requirements from the API (a few seconds)
export const maxDuration = 60;

const SCALAR_FIELDS = [
  "displayCode",
  "name",
  "credits",
  "suggestedSemester",
  "courseType",
  "isPlaceholder",
  "placeholderKind",
  "placeholderLabel",
] as const;

async function loadRow(slug: string, id: number) {
  const row = await prisma.catalogCourse.findFirst({
    where: { id, catalog: { slug } },
    include: { course: { select: { normalizedCode: true } } },
  });
  return row;
}

/** PATCH — partial edit of one CatalogCourse row (marks it manuallyEdited). */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id: idStr } = await params;
  const id = Number(idStr);
  const row = await loadRow(slug, id);
  if (!row) {
    return NextResponse.json({ error: "Curso no encontrado." }, { status: 404 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const data: Prisma.CatalogCourseUncheckedUpdateInput = {};
  const before: Record<string, unknown> = {};

  for (const f of SCALAR_FIELDS) {
    if (!(f in body)) continue;
    before[f] = (row as Record<string, unknown>)[f];
    if (f === "credits") {
      const n = Number(body[f]);
      data.credits = Number.isFinite(n) ? n : 0;
    } else if (f === "suggestedSemester") {
      const n = Number(body[f]);
      if (!Number.isFinite(n) || n < 1) {
        return NextResponse.json({ error: "Semestre inválido." }, { status: 400 });
      }
      data.suggestedSemester = n;
    } else if (f === "isPlaceholder") {
      data.isPlaceholder = Boolean(body[f]);
    } else {
      const v = body[f] == null ? null : String(body[f]).trim();
      (data as Record<string, unknown>)[f] = f === "name" || f === "displayCode" ? v ?? "" : v || null;
    }
  }

  if ("prereqText" in body) {
    before.prereqText = row.prereqText;
    const text = String(body.prereqText ?? "").trim();
    data.prereqText = text || null;
    data.prereqTree = (parseRequirement(text) ??
      Prisma.JsonNull) as unknown as Prisma.InputJsonValue;
  }

  if ("lockedFields" in body) {
    before.lockedFields = row.lockedFields;
    const arr = Array.isArray(body.lockedFields)
      ? [...new Set(body.lockedFields.map((s) => String(s)))]
      : [];
    data.lockedFields = (arr.length
      ? arr
      : Prisma.JsonNull) as unknown as Prisma.InputJsonValue;
  }

  // re-attach the global Course when the code changed to a real one (or a
  // placeholder slot was turned into a real course)
  const newCode =
    typeof data.displayCode === "string" ? data.displayCode : row.displayCode;
  const normalized = normalizeCode(newCode);
  const willBePlaceholder =
    data.isPlaceholder != null ? Boolean(data.isPlaceholder) : row.isPlaceholder;
  const becameReal = row.isPlaceholder && !willBePlaceholder;
  if (
    ("displayCode" in body || becameReal) &&
    !willBePlaceholder &&
    normalized &&
    normalized !== row.course?.normalizedCode
  ) {
    const g = await prisma.course.upsert({
      where: { normalizedCode: normalized },
      create: {
        normalizedCode: normalized,
        nameEs: (data.name as string) || row.name,
      },
      update: {},
    });
    data.courseId = g.id;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: true, unchanged: true });
  }
  data.manuallyEdited = true;

  const updated = await prisma.catalogCourse.update({ where: { id }, data });
  await writeAudit({
    action: "course.update",
    entityType: "CatalogCourse",
    entityId: id,
    before,
    after: Object.fromEntries(
      Object.keys(before).map((k) => [k, (updated as Record<string, unknown>)[k]])
    ),
  });

  // a new binding has no CourseOffering yet — pull it now so students (and the
  // discrepancy report) get the API data without waiting for a re-seed. Best
  // effort: the edit is already saved, a failed sync just reports back.
  let sync: SyncedCourse | null = null;
  let syncError: string | null = null;
  if (!willBePlaceholder && ("courseId" in data || becameReal)) {
    try {
      const out = await syncCatalogCourses(row.catalogId, { ids: [id] });
      sync = out.courses[0] ?? null;
    } catch (err) {
      syncError = err instanceof Error ? err.message : String(err);
      console.error("course sync after edit failed", err);
    }
  }
  return NextResponse.json({ ok: true, sync, syncError });
}

/** DELETE — remove one CatalogCourse row. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id: idStr } = await params;
  const id = Number(idStr);
  const row = await loadRow(slug, id);
  if (!row) {
    return NextResponse.json({ error: "Curso no encontrado." }, { status: 404 });
  }
  await prisma.catalogCourse.delete({ where: { id } });
  await writeAudit({
    action: "course.delete",
    entityType: "CatalogCourse",
    entityId: id,
    before: { slug, displayCode: row.displayCode, name: row.name },
  });
  return NextResponse.json({ ok: true });
}
