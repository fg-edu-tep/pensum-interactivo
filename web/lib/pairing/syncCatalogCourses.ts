// On-demand re-pull of the live offering + courseDetails for rows already in
// the DB (P2.4 re-sync). Unlike the seed/import path — which pairs whatever
// code the Excel row carries — this pairs each row with the code it is *bound*
// to right now, so an admin rebind (course editor, add-course) is picked up
// immediately instead of showing "sin registro de oferta" until the next seed.
//
// Placeholders and unbound rows are skipped: they have no Course to hang a
// CourseOffering on. Never throws for a single course — API failures land as
// `sync_failed` / `detailsError`, exactly like the seed.

import { prisma } from "../db";
import { applyPairResult } from "../import/persistCatalog";
import { pairCatalog, type PairingStatus } from "./pairCatalog";

export interface SyncedCourse {
  catalogCourseId: number;
  code: string;
  pairingStatus: PairingStatus;
  offered: boolean;
  sectionCount: number;
  /** requirements (courseDetails) were pulled cleanly */
  details: boolean;
  error: string | null;
}

export interface SyncResult {
  term: string;
  courses: SyncedCourse[];
  /** > 50 % of fetches failed, the rest were skipped (API down) */
  aborted: boolean;
}

export async function syncCatalogCourses(
  catalogId: number,
  opts: { ids?: number[]; term?: string } = {}
): Promise<SyncResult> {
  const catalog = await prisma.catalog.findUniqueOrThrow({
    where: { id: catalogId },
    select: { term: true, programCode: true },
  });
  const term = opts.term || catalog.term;
  const rows = await prisma.catalogCourse.findMany({
    where: {
      catalogId,
      isPlaceholder: false,
      courseId: { not: null },
      ...(opts.ids ? { id: { in: opts.ids } } : {}),
    },
    include: { course: { select: { normalizedCode: true } } },
  });
  if (rows.length === 0) return { term, courses: [], aborted: false };

  const result = await pairCatalog(
    rows.map((r) => ({
      sortIndex: r.sortIndex,
      normalizedCode: r.course!.normalizedCode,
      displayCode: r.displayCode,
      name: r.name,
      credits: r.credits,
      semester: r.suggestedSemester,
      isPlaceholder: false,
    })),
    term,
    { programCode: catalog.programCode }
  );

  const bySortIndex = new Map(rows.map((r) => [r.sortIndex, r]));
  const courses: SyncedCourse[] = [];
  for (const r of result.courses) {
    const cc = bySortIndex.get(r.sortIndex);
    if (!cc) continue;
    await applyPairResult(r, cc, term, new Map());
    courses.push({
      catalogCourseId: cc.id,
      code: r.normalizedCode,
      pairingStatus: r.pairingStatus,
      offered: r.offering?.offered ?? false,
      sectionCount: r.offering?.sectionCount ?? 0,
      details: !!r.details && !r.details.syncError,
      error: r.offering?.syncError ?? r.details?.syncError ?? null,
    });
  }
  return { term, courses, aborted: result.aborted };
}
