import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { normalizeCode } from "@/lib/import/normalizeCode";
import { classifyCourse } from "@/lib/import/classifyPlaceholder";
import { parseRequirement } from "@/lib/import/requirementParser";
import { syncCatalogCourses, type SyncedCourse } from "@/lib/pairing/syncCatalogCourses";

export const runtime = "nodejs";
// a real course pulls its offering + requirements from the API (a few seconds)
export const maxDuration = 60;

/** POST — add a CatalogCourse row to this plan. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const catalog = await prisma.catalog.findUnique({ where: { slug } });
  if (!catalog) {
    return NextResponse.json({ error: "Plan no encontrado." }, { status: 404 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const displayCode = String(body.displayCode ?? "").trim();
  const name = String(body.name ?? "").trim();
  if (!displayCode && !name) {
    return NextResponse.json(
      { error: "Indica al menos un código o un nombre." },
      { status: 400 }
    );
  }
  const semester = Number(body.suggestedSemester);
  if (!Number.isFinite(semester) || semester < 1) {
    return NextResponse.json({ error: "Semestre inválido." }, { status: 400 });
  }

  const cls = classifyCourse(displayCode, name);
  const credits = Number(body.credits);
  const prereqText = String(body.prereqText ?? "").trim();
  const normalized = normalizeCode(displayCode);

  let courseId: number | null = null;
  if (!cls.isPlaceholder && normalized) {
    const g = await prisma.course.upsert({
      where: { normalizedCode: normalized },
      create: { normalizedCode: normalized, nameEs: name || displayCode },
      update: {},
    });
    courseId = g.id;
  }

  const agg = await prisma.catalogCourse.aggregate({
    where: { catalogId: catalog.id },
    _max: { sortIndex: true },
  });
  const sortIndex = (agg._max.sortIndex ?? 0) + 1;

  const created = await prisma.catalogCourse.create({
    data: {
      catalogId: catalog.id,
      courseId,
      displayCode: displayCode || name,
      name: name || cls.placeholderLabel || displayCode,
      credits: Number.isFinite(credits) ? credits : 0,
      suggestedSemester: semester,
      courseType: (body.courseType as string) || cls.courseType,
      isPlaceholder: cls.isPlaceholder,
      placeholderKind: cls.placeholderKind ?? null,
      placeholderLabel: cls.isPlaceholder ? name || cls.placeholderLabel || null : null,
      sortIndex,
      prereqText: prereqText || null,
      prereqTree: (parseRequirement(prereqText) ??
        Prisma.JsonNull) as unknown as Prisma.InputJsonValue,
      pairingStatus: cls.isPlaceholder ? "placeholder_pool" : "needs_manual",
      manuallyEdited: true,
    },
  });
  await writeAudit({
    action: "course.create",
    entityType: "CatalogCourse",
    entityId: created.id,
    after: { slug, displayCode, name, semester },
  });

  // pull the offering now (best effort — the row is already created)
  let sync: SyncedCourse | null = null;
  let syncError: string | null = null;
  if (courseId != null) {
    try {
      sync = (await syncCatalogCourses(catalog.id, { ids: [created.id] })).courses[0] ?? null;
    } catch (err) {
      syncError = err instanceof Error ? err.message : String(err);
      console.error("course sync after create failed", err);
    }
  }
  return NextResponse.json({ ok: true, id: created.id, sync, syncError });
}
