// Writes one ParsedCatalog (+ prereq text + pairing results) into the DB.
// Used by scripts/seed.ts and by lib/import/apply.ts (the latter wraps this in a
// snapshot + import-job transaction).

import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import type { ParsedCatalog, ParsedCourse } from "./parsePensumWorkbook";
import type { PrereqRow } from "./parsePrereqExport";
import { parseRequirement } from "./requirementParser";
import { pairCatalog, type CoursePairResult, type PairInputCourse } from "../pairing/pairCatalog";
import type { OfferingsCache } from "../pairing/offeringsCache";

export interface PersistOptions {
  status?: "draft" | "published" | "archived";
  term: string;
  sourceFilename?: string;
  /** run live API pairing after writing courses (default true) */
  pair?: boolean;
  /** also pull /api/courseDetails per auto-paired course (default true) */
  fetchDetails?: boolean;
  concurrency?: number;
  /** share an offerings cache across several persist calls in one run */
  cache?: OfferingsCache;
  /** presentation identity written onto the Catalog row */
  identity?: {
    accentColor?: string | null;
    tagline?: string | null;
    subtitle?: string | null;
    imagePath?: string | null;
  };
  /** admin progression rules ({ gates, attestations }) written onto Catalog.rules */
  rules?: unknown;
  /** first-load requirement nodes (RequirementNode rows) */
  requirementNodes?: {
    key: string;
    label: string;
    description?: string;
    infoUrl?: string;
    credits: number;
    semester: number;
    sortIndex: number;
    attestationId?: string;
    linkedCourseCodes: string[];
    autoLinkRegex?: string;
  }[];
  /** overwrite Catalog.rules / identity / requirement nodes even when the row
   * already exists (a plain re-seed leaves admin edits alone) */
  resetMeta?: boolean;
  /** delete + recreate CatalogCourse rows from the parsed Excel even when the
   * catalog already has courses (default: only rebuild on first load) */
  rebuildCourses?: boolean;
}

export interface PersistResult {
  slug: string;
  catalogId: number;
  courseCount: number;
  pairing: {
    auto_paired: number;
    not_offered: number;
    needs_manual: number;
    placeholder_pool: number;
    sync_failed: number;
    manual_resolved: number;
  };
  /** auto-paired courses for which courseDetails (prereq/coreq) was pulled OK */
  detailsPaired: number;
  apiFailureRate: number;
  /** whether CatalogCourse rows were rebuilt from Excel this run */
  rebuilt: boolean;
}

function toInputJson(v: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return v == null ? (undefined as never) : (v as Prisma.InputJsonValue);
}

export async function persistParsedCatalog(
  parsed: ParsedCatalog,
  prereqMap: Map<string, PrereqRow>,
  opts: PersistOptions
): Promise<PersistResult> {
  const status = opts.status ?? "draft";
  const identity = opts.identity ?? {};

  const existing = await prisma.catalog.findUnique({
    where: { slug: parsed.slug },
    select: { id: true, _count: { select: { courses: true } } },
  });
  const isNew = !existing;
  // rules / identity / requirement nodes are admin-owned once the catalog exists —
  // a plain re-seed only re-applies them on first load or with SEED_RESET_META=1.
  const writeMeta = isNew || !!opts.resetMeta;
  const rebuildCourses =
    isNew || (existing?._count.courses ?? 0) === 0 || !!opts.rebuildCourses;

  // 1. upsert the Catalog row
  const catalog = await prisma.catalog.upsert({
    where: { slug: parsed.slug },
    create: {
      slug: parsed.slug,
      programCode: parsed.programCode,
      programName: parsed.programName,
      variantLabel: parsed.variantLabel,
      status,
      term: opts.term,
      sourceFilename: opts.sourceFilename,
      accentColor: identity.accentColor ?? null,
      tagline: identity.tagline ?? null,
      subtitle: identity.subtitle ?? null,
      imagePath: identity.imagePath ?? null,
      rules: (opts.rules ?? undefined) as Prisma.InputJsonValue | undefined,
    },
    update: {
      programCode: parsed.programCode,
      programName: parsed.programName,
      variantLabel: parsed.variantLabel,
      status,
      term: opts.term,
      sourceFilename: opts.sourceFilename,
      ...(writeMeta && identity.accentColor !== undefined ? { accentColor: identity.accentColor } : {}),
      ...(writeMeta && identity.tagline !== undefined ? { tagline: identity.tagline } : {}),
      ...(writeMeta && identity.subtitle !== undefined ? { subtitle: identity.subtitle } : {}),
      ...(writeMeta && identity.imagePath !== undefined ? { imagePath: identity.imagePath } : {}),
      ...(writeMeta && opts.rules !== undefined
        ? { rules: opts.rules as Prisma.InputJsonValue }
        : {}),
    },
  });

  // 1b. requirement nodes — create-only (never overwrite an admin's edits)
  for (const rn of opts.requirementNodes ?? []) {
    await prisma.requirementNode.upsert({
      where: { catalogId_key: { catalogId: catalog.id, key: rn.key } },
      create: {
        catalogId: catalog.id,
        key: rn.key,
        label: rn.label,
        description: rn.description ?? null,
        infoUrl: rn.infoUrl ?? null,
        credits: rn.credits,
        semester: rn.semester,
        sortIndex: rn.sortIndex,
        attestationId: rn.attestationId ?? null,
        linkedCourseCodes: rn.linkedCourseCodes as unknown as Prisma.InputJsonValue,
        autoLinkRegex: rn.autoLinkRegex ?? null,
      },
      update: opts.resetMeta
        ? {
            label: rn.label,
            description: rn.description ?? null,
            infoUrl: rn.infoUrl ?? null,
            credits: rn.credits,
            semester: rn.semester,
            attestationId: rn.attestationId ?? null,
            autoLinkRegex: rn.autoLinkRegex ?? null,
          }
        : {},
    });
  }

  // 2. upsert global Course rows for every real (non-placeholder) code
  const realCourses = parsed.courses.filter((c) => !c.isPlaceholder && c.normalizedCode);
  const courseIdByCode = new Map<string, number>();
  for (const c of realCourses) {
    const pr = prereqMap.get(c.normalizedCode);
    const row = await prisma.course.upsert({
      where: { normalizedCode: c.normalizedCode },
      create: {
        normalizedCode: c.normalizedCode,
        nameEs: pr?.nameEs || c.name,
        defaultCredits: pr?.credits ?? c.credits,
      },
      update: {
        nameEs: pr?.nameEs || c.name,
        defaultCredits: pr?.credits ?? c.credits,
      },
    });
    courseIdByCode.set(c.normalizedCode, row.id);
  }

  // 3. (re)build the catalog's CatalogCourse rows from the Excel — only on first
  //    load or when explicitly asked. Otherwise the DB rows (incl. admin edits)
  //    are left as-is and we just refresh pairing/offering data below.
  const makeCatalogCourseData = (c: ParsedCourse): Prisma.CatalogCourseCreateManyInput => {
    const pr = c.isPlaceholder ? undefined : prereqMap.get(c.normalizedCode);
    const prereqText = pr?.prereqText ?? "";
    const coreqText = pr?.coreqText ?? "";
    // Coreq codes in the export are often hyphenated lab/practice companions
    // ("IELE-1118L", "FISI-1518P"); a space lets the requirement tokenizer read
    // them as "<PREFIX> <number><letter>".
    const coreqExpr = coreqText.replace(/-/g, " ");
    return {
      catalogId: catalog.id,
      courseId: c.isPlaceholder ? null : (courseIdByCode.get(c.normalizedCode) ?? null),
      displayCode: c.displayCode,
      name: c.name,
      credits: c.credits,
      suggestedSemester: c.semester,
      courseType: c.courseType,
      isPlaceholder: c.isPlaceholder,
      placeholderKind: c.placeholderKind ?? null,
      placeholderLabel: c.placeholderLabel ?? null,
      sortIndex: c.sortIndex,
      prereqText: prereqText || null,
      coreqText: coreqText || null,
      prereqTree: toInputJson(parseRequirement(prereqText)),
      coreqTree: toInputJson(parseRequirement(coreqExpr)),
      pairingStatus: c.isPlaceholder ? "needs_manual" : "needs_manual",
    };
  };

  if (rebuildCourses) {
    await prisma.catalogCourse.deleteMany({ where: { catalogId: catalog.id } });
    await prisma.catalogCourse.createMany({
      data: parsed.courses.map(makeCatalogCourseData),
    });
  }

  const catalogCourses = await prisma.catalogCourse.findMany({
    where: { catalogId: catalog.id },
    orderBy: { sortIndex: "asc" },
  });
  const ccBySortIndex = new Map(catalogCourses.map((cc) => [cc.sortIndex, cc]));

  const counts = {
    auto_paired: 0,
    not_offered: 0,
    needs_manual: 0,
    placeholder_pool: 0,
    sync_failed: 0,
    manual_resolved: 0,
  };
  let apiFailureRate = 0;
  let detailsPaired = 0;

  // 4. pairing
  if (opts.pair !== false) {
    // The DB row is authoritative: an admin may have re-bound a slot to a
    // different course than the pensum Excel says (kept rows are not rebuilt),
    // and pairing the Excel's code would write the WRONG course's offering onto
    // the re-bound row. Pair with the code the row is actually bound to.
    const boundIds = [...new Set(catalogCourses.map((cc) => cc.courseId).filter((x): x is number => x != null))];
    const boundCodes = new Map(
      (await prisma.course.findMany({ where: { id: { in: boundIds } }, select: { id: true, normalizedCode: true } })).map(
        (x) => [x.id, x.normalizedCode] as const
      )
    );
    // an admin may also have turned a placeholder slot into a real course
    const isBoundReal = (c: (typeof parsed.courses)[number]) => {
      const db = ccBySortIndex.get(c.sortIndex);
      return !!db && !db.isPlaceholder && db.courseId != null;
    };
    const pairCode = (c: (typeof parsed.courses)[number]) => {
      const db = ccBySortIndex.get(c.sortIndex);
      return (isBoundReal(c) && db?.courseId != null ? boundCodes.get(db.courseId) : undefined) ?? c.normalizedCode;
    };
    const pairInput: PairInputCourse[] = parsed.courses.map((c) => ({
      sortIndex: c.sortIndex,
      normalizedCode: pairCode(c),
      displayCode: c.displayCode,
      name: c.name,
      credits: c.credits,
      semester: c.semester,
      isPlaceholder: isBoundReal(c) ? false : c.isPlaceholder,
      placeholderKind: isBoundReal(c) ? undefined : c.placeholderKind,
      placeholderLabel: isBoundReal(c) ? undefined : c.placeholderLabel,
      prereqText: (c.isPlaceholder && !isBoundReal(c) ? undefined : prereqMap.get(pairCode(c))?.prereqText) ?? null,
    }));

    const result = await pairCatalog(pairInput, opts.term, {
      concurrency: opts.concurrency,
      programCode: parsed.programCode,
      cache: opts.cache,
      fetchDetails: opts.fetchDetails,
    });
    apiFailureRate = result.apiFailureRate;

    for (const r of result.courses) {
      const cc = ccBySortIndex.get(r.sortIndex);
      if (!cc) continue;
      await applyPairResult(r, cc, opts.term, courseIdByCode);
      counts[r.pairingStatus] = (counts[r.pairingStatus] ?? 0) + 1;
      if (r.details && !r.details.syncError) detailsPaired += 1;
    }
  }

  return {
    slug: parsed.slug,
    catalogId: catalog.id,
    courseCount: catalogCourses.length,
    pairing: counts,
    detailsPaired,
    apiFailureRate,
    rebuilt: rebuildCourses,
  };
}

async function applyPairResult(
  r: CoursePairResult,
  cc: { id: number; courseId: number | null; displayCode: string; name: string; credits: number; suggestedSemester: number; prereqText: string | null },
  term: string,
  courseIdByCode: Map<string, number>
) {
  await prisma.catalogCourse.update({
    where: { id: cc.id },
    data: { pairingStatus: r.pairingStatus },
  });

  // write CourseOffering for real courses we have a courseId for
  const courseId = cc.courseId ?? courseIdByCode.get(r.normalizedCode) ?? null;
  if (r.offering && courseId != null) {
    const o = r.offering;
    const d = r.details;
    // Only touch the details columns when a details fetch actually ran, so a
    // details-less resync doesn't wipe a previous good pull. When it did run,
    // an absent tree is written as JSON null so a stale value is cleared.
    const j = (v: unknown) =>
      v == null ? Prisma.JsonNull : (v as Prisma.InputJsonValue);
    // Just the courseDetails columns — no `courseId`, so it spreads cleanly into
    // both the create and update bodies of the upsert.
    type DetailCols = {
      detailsNrc: string | null;
      apiPrereqText: string | null;
      apiPrereqTree: Prisma.InputJsonValue | typeof Prisma.JsonNull;
      apiCoreq: Prisma.InputJsonValue | typeof Prisma.JsonNull;
      apiCoreqTree: Prisma.InputJsonValue | typeof Prisma.JsonNull;
      restrictions: Prisma.InputJsonValue | typeof Prisma.JsonNull;
      detailsCompl: Prisma.InputJsonValue | typeof Prisma.JsonNull;
      detailsMaster: Prisma.InputJsonValue | typeof Prisma.JsonNull;
      detailsError: string | null;
      detailsSyncedAt: Date;
    };
    const detailsFields: Partial<DetailCols> = d
      ? {
          detailsNrc: d.nrc || null,
          apiPrereqText: d.prereqText,
          apiPrereqTree: j(d.prereqTree),
          apiCoreq: j(d.coreq),
          apiCoreqTree: j(d.coreqTree),
          restrictions: j(d.restrictions),
          detailsCompl: j(d.compl),
          detailsMaster: j(d.master),
          detailsError: d.syncError,
          detailsSyncedAt: new Date(),
        }
      : {};
    await prisma.courseOffering.upsert({
      where: { courseId_term: { courseId, term } },
      create: {
        courseId,
        term,
        offered: o.offered,
        canonicalTitle: o.canonicalTitle,
        canonicalCredits: o.canonicalCredits,
        sectionCount: o.sectionCount,
        seatsAvailableMin: o.seatsAvailableMin,
        seatsAvailableMax: o.seatsAvailableMax,
        attrs: o.attrs as unknown as Prisma.InputJsonValue,
        ptrmSet: o.ptrmSet as unknown as Prisma.InputJsonValue,
        syncError: o.syncError,
        ...detailsFields,
      },
      update: {
        offered: o.offered,
        canonicalTitle: o.canonicalTitle,
        canonicalCredits: o.canonicalCredits,
        sectionCount: o.sectionCount,
        seatsAvailableMin: o.seatsAvailableMin,
        seatsAvailableMax: o.seatsAvailableMax,
        attrs: o.attrs as unknown as Prisma.InputJsonValue,
        ptrmSet: o.ptrmSet as unknown as Prisma.InputJsonValue,
        syncError: o.syncError,
        lastSyncedAt: new Date(),
        ...detailsFields,
      },
    });
  }

  // create a ManualPairing prefill for anything not cleanly auto-paired
  const needsManualRow =
    r.pairingStatus === "needs_manual" ||
    r.pairingStatus === "not_offered" ||
    r.pairingStatus === "placeholder_pool" ||
    r.pairingStatus === "sync_failed";

  if (needsManualRow) {
    await prisma.manualPairing.upsert({
      where: { catalogCourseId: cc.id },
      create: {
        catalogCourseId: cc.id,
        excelCode: cc.displayCode,
        excelName: cc.name,
        excelCredits: cc.credits,
        excelSemester: cc.suggestedSemester,
        excelPrereqText: cc.prereqText,
        suggestedCode: r.manual?.suggestedCode ?? null,
        candidateCodes: (r.manual?.candidateCodes ?? null) as unknown as Prisma.InputJsonValue,
      },
      update: {
        excelCode: cc.displayCode,
        excelName: cc.name,
        excelCredits: cc.credits,
        excelSemester: cc.suggestedSemester,
        excelPrereqText: cc.prereqText,
        suggestedCode: r.manual?.suggestedCode ?? null,
        candidateCodes: (r.manual?.candidateCodes ?? null) as unknown as Prisma.InputJsonValue,
      },
    });
  } else {
    // auto_paired / manual_resolved: drop any stale manual row
    await prisma.manualPairing.deleteMany({ where: { catalogCourseId: cc.id } });
  }
}
