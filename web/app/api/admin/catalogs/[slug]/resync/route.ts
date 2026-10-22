import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { syncCatalogCourses } from "@/lib/pairing/syncCatalogCourses";

export const runtime = "nodejs";
// a whole plan is ~50 courses × (sections + courseDetails) at concurrency 4
export const maxDuration = 300;

/**
 * POST { courseId?, term? } — re-pull the live offering + requirements from the
 * Uniandes API for one row (`courseId` = CatalogCourse id) or the whole plan.
 * `term` defaults to the plan's term.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const catalog = await prisma.catalog.findUnique({ where: { slug }, select: { id: true } });
  if (!catalog) {
    return NextResponse.json({ error: "Plan no encontrado." }, { status: 404 });
  }
  const body = ((await req.json().catch(() => null)) ?? {}) as { courseId?: unknown; term?: unknown };

  let ids: number[] | undefined;
  if (body.courseId != null) {
    const id = Number(body.courseId);
    const row = Number.isInteger(id)
      ? await prisma.catalogCourse.findFirst({ where: { id, catalogId: catalog.id }, select: { id: true } })
      : null;
    if (!row) return NextResponse.json({ error: "Curso no encontrado." }, { status: 404 });
    ids = [row.id];
  }
  const term = typeof body.term === "string" && /^\d{6}$/.test(body.term.trim()) ? body.term.trim() : undefined;

  const out = await syncCatalogCourses(catalog.id, { ids, term });
  const count = (s: string) => out.courses.filter((c) => c.pairingStatus === s).length;
  const summary = {
    term: out.term,
    courses: out.courses.length,
    offered: count("auto_paired"),
    notOffered: count("not_offered"),
    failed: count("sync_failed"),
    aborted: out.aborted,
  };
  await writeAudit({
    action: "catalog.resync",
    entityType: ids ? "CatalogCourse" : "Catalog",
    entityId: ids ? ids[0] : catalog.id,
    after: summary,
  });
  return NextResponse.json({ ok: true, ...summary, results: out.courses });
}
