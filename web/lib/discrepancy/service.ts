// DB loading for the discrepancy report. One function feeds every surface
// (the Discrepancias page, the catalog-list badge, the course editor, the
// registro wizard) so they can never disagree with each other.
// Read-only.

import { prisma } from "../db";
import type { ReqNode } from "../types";
import { reportCourse, summarize, type CourseInput, type CourseReport, type Summary } from "./report";

export interface CatalogReport {
  slug: string;
  programName: string;
  variantLabel: string;
  status: string;
  /** the term whose offerings/API data are compared */
  term: string;
  courses: CourseReport[];
  summary: Summary;
  /** most recent API details sync among the compared courses (ISO) */
  latestApiSync: string | null;
  oldestApiSync: string | null;
}

export async function loadCourseInputs(slugs?: string[]): Promise<Map<string, { meta: Omit<CatalogReport, "courses" | "summary" | "latestApiSync" | "oldestApiSync">; inputs: CourseInput[] }>> {
  const catalogs = await prisma.catalog.findMany({
    where: slugs ? { slug: { in: slugs } } : undefined,
    orderBy: { slug: "asc" },
    include: {
      courses: {
        where: { isPlaceholder: false, courseId: { not: null } },
        orderBy: [{ suggestedSemester: "asc" }, { sortIndex: "asc" }],
        include: { course: { include: { offerings: true } } },
      },
    },
  });

  const out = new Map<string, { meta: Omit<CatalogReport, "courses" | "summary" | "latestApiSync" | "oldestApiSync">; inputs: CourseInput[] }>();
  for (const cat of catalogs) {
    const inputs: CourseInput[] = cat.courses.map((cc) => {
      const o = cc.course?.offerings.find((x) => x.term === cat.term) ?? null;
      return {
        catalogCourseId: cc.id,
        displayCode: cc.displayCode,
        code: cc.course?.normalizedCode ?? "",
        name: cc.name,
        docPrereqText: cc.prereqText,
        docPrereqTree: (cc.prereqTree as ReqNode | null) ?? null,
        docCoreqText: cc.coreqText,
        docCoreqTree: (cc.coreqTree as ReqNode | null) ?? null,
        manuallyEdited: cc.manuallyEdited,
        lockedFields: (cc.lockedFields as string[] | null) ?? [],
        offering: o
          ? {
              offered: o.offered,
              syncError: o.syncError,
              detailsSyncedAt: o.detailsSyncedAt ? o.detailsSyncedAt.toISOString() : null,
              detailsError: o.detailsError,
              apiPrereqText: o.apiPrereqText,
              apiPrereqTree: (o.apiPrereqTree as ReqNode | null) ?? null,
              apiCoreqTree: (o.apiCoreqTree as ReqNode | null) ?? null,
            }
          : null,
      };
    });
    out.set(cat.slug, {
      meta: {
        slug: cat.slug,
        programName: cat.programName,
        variantLabel: cat.variantLabel,
        status: cat.status,
        term: cat.term,
      },
      inputs,
    });
  }
  return out;
}

export async function buildDiscrepancyReports(slugs?: string[]): Promise<CatalogReport[]> {
  const loaded = await loadCourseInputs(slugs);
  return [...loaded.values()].map(({ meta, inputs }) => {
    const courses = inputs.map(reportCourse);
    const syncs = inputs
      .map((i) => i.offering?.detailsSyncedAt)
      .filter((x): x is string => !!x)
      .sort();
    return {
      ...meta,
      courses,
      summary: summarize(courses),
      latestApiSync: syncs.length ? syncs[syncs.length - 1] : null,
      oldestApiSync: syncs.length ? syncs[0] : null,
    };
  });
}
