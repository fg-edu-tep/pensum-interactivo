// Builds the denormalized document the student panel consumes for one catalog.
// The `courses` array uses the exact `Course` shape from app/src/lib/types.ts so
// availability.ts and the React Flow graph work unchanged; edges are derived here
// from the stored prereq/coreq trees.

import { prisma } from "./db";
import { termLabel } from "./term";
import type {
  CatalogPayload,
  CatalogRules,
  Course,
  ElectiveDTO,
  OfferingBadge,
  ReqNode,
  RequirementNodeDTO,
  RequirementSource,
  Restriction,
} from "./types";

function safeRe(src: string | null | undefined): RegExp | null {
  if (!src) return null;
  try {
    return new RegExp(src);
  } catch {
    return null;
  }
}
import { collectCourseCodes } from "./import/requirementParser";

/** codes that appear ONLY with a trailing "*" in the tree (never as a hard leaf) */
function softOnlyCodes(node: ReqNode | null, hard = new Set<string>(), soft = new Set<string>()) {
  if (!node) return soft;
  if (node.op === "COURSE") {
    if (node.code) (node.soft ? soft : hard).add(node.code);
  } else for (const it of node.items ?? []) softOnlyCodes(it, hard, soft);
  for (const h of hard) soft.delete(h);
  return soft;
}
import { normalizeCode } from "./import/normalizeCode";

function placeholderId(kind: string | null, semester: number, n: number): string {
  return `ph-${(kind ?? "slot").toLowerCase()}-s${semester}-${n}`;
}

export async function buildCatalogPayload(slug: string): Promise<CatalogPayload | null> {
  const catalog = await prisma.catalog.findUnique({
    where: { slug },
    include: {
      courses: {
        orderBy: { sortIndex: "asc" },
        include: {
          course: { include: { offerings: true } },
        },
      },
      requirementNodes: { orderBy: [{ semester: "asc" }, { sortIndex: "asc" }] },
    },
  });
  if (!catalog) return null;

  // stable ids + the catalog's own code set (for edge filtering)
  const phCounters = new Map<string, number>();
  const rows = catalog.courses.map((cc) => {
    let id: string;
    let codeNormalized: string;
    if (cc.isPlaceholder) {
      const key = `${cc.placeholderKind}-${cc.suggestedSemester}`;
      const n = (phCounters.get(key) ?? 0) + 1;
      phCounters.set(key, n);
      id = placeholderId(cc.placeholderKind, cc.suggestedSemester, n);
      codeNormalized = normalizeCode(cc.displayCode) || id;
    } else {
      codeNormalized = cc.course?.normalizedCode ?? normalizeCode(cc.displayCode);
      id = codeNormalized;
    }
    return { cc, id, codeNormalized };
  });

  const catalogCodes = new Set(rows.map((r) => r.codeNormalized));
  const idByCode = new Map(rows.map((r) => [r.codeNormalized, r.id]));

  const courses: Course[] = rows.map(({ cc, id, codeNormalized }) => {
    // Live courseDetails (this term) is the source of truth for requirements;
    // the PRERREQUISITOS spreadsheet is the fallback for courses with no
    // offering this term (or when the details fetch failed).
    const off = cc.course?.offerings?.find((o) => o.term === catalog.term);
    const detailsFetched = !!off?.detailsSyncedAt && !off?.detailsError;

    const apiPrereqTree = (off?.apiPrereqTree as ReqNode | null | undefined) ?? null;
    const docPrereqTree = (cc.prereqTree as ReqNode | null) ?? null;
    const prereqTree =
      apiPrereqTree ??
      (detailsFetched && !off?.apiPrereqText ? null : docPrereqTree);
    const prereqSource: RequirementSource = apiPrereqTree
      ? "api"
      : detailsFetched && !off?.apiPrereqText
        ? "api"
        : docPrereqTree
          ? "document"
          : null;
    const prereqText = apiPrereqTree
      ? (off?.apiPrereqText ?? "")
      : (cc.prereqText ?? "");

    const apiCoreqTree = (off?.apiCoreqTree as ReqNode | null | undefined) ?? null;
    const docCoreqTree = (cc.coreqTree as ReqNode | null) ?? null;
    const coreqTree = apiCoreqTree ?? (detailsFetched ? null : docCoreqTree);
    const coreqSource: RequirementSource = apiCoreqTree
      ? "api"
      : detailsFetched
        ? "api"
        : docCoreqTree
          ? "document"
          : null;

    const apiCoreq =
      (off?.apiCoreq as { normalizedCode: string; title: string }[] | null) ?? [];
    const coreqTitles: Record<string, string> = {};
    for (const c of apiCoreq) {
      if (c?.normalizedCode) coreqTitles[c.normalizedCode] = c.title ?? "";
    }
    const restrictions = (off?.restrictions as Restriction[] | null) ?? [];

    const allPrereq = [...collectCourseCodes(prereqTree)];
    const prereqCourseIds = allPrereq
      .filter((c) => catalogCodes.has(c))
      .map((c) => idByCode.get(c)!)
      .filter(Boolean);
    const prereqExternal = allPrereq.filter((c) => !catalogCodes.has(c));
    const concurrentPrereqIds = [...softOnlyCodes(prereqTree)]
      .filter((c) => catalogCodes.has(c))
      .map((c) => idByCode.get(c)!)
      .filter(Boolean);

    const allCoreq = [...collectCourseCodes(coreqTree)];
    const coreqCourseIds = allCoreq
      .filter((c) => catalogCodes.has(c))
      .map((c) => idByCode.get(c)!)
      .filter(Boolean);
    const coreqExternal = allCoreq.filter((c) => !catalogCodes.has(c));

    return {
      id,
      code: cc.displayCode,
      codeNormalized,
      name: cc.name,
      credits: cc.credits,
      semester: cc.suggestedSemester,
      type: cc.courseType as Course["type"],
      isPlaceholder: cc.isPlaceholder,
      placeholderKind: cc.placeholderKind,
      placeholderLabel: cc.placeholderLabel,
      description: cc.course?.description ?? null,
      prereqText,
      coreqText: cc.coreqText ?? "",
      prereqTree,
      prereqCourseIds,
      concurrentPrereqIds,
      prereqExternal,
      coreqTree,
      coreqCourseIds,
      coreqExternal,
      prereqSource,
      coreqSource,
      coreqTitles,
      restrictions,
    };
  });

  // --- non-course graduation requirements (RequirementNode rows, DB-editable):
  //     each becomes a 0-credit node; courses point at it either by explicit
  //     linkedCourseCodes or by autoLinkRegex matching an external prereq code ---
  const requirementNodes: RequirementNodeDTO[] = [];
  for (const rn of catalog.requirementNodes) {
    const linked = new Set(
      ((rn.linkedCourseCodes as string[] | null) ?? []).map(String)
    );
    const re = safeRe(rn.autoLinkRegex);
    for (const c of courses) {
      let attach = linked.has(c.codeNormalized);
      if (re && c.prereqExternal.some((code) => re.test(code))) {
        attach = true;
        c.prereqExternal = c.prereqExternal.filter((code) => !re.test(code));
      }
      if (attach && !c.prereqCourseIds.includes(rn.key)) {
        c.prereqCourseIds = [...c.prereqCourseIds, rn.key];
      }
    }
    courses.push({
      id: rn.key,
      code: "REQUISITO",
      codeNormalized: rn.key,
      name: rn.label,
      credits: rn.credits,
      semester: rn.semester,
      type: "complementaria",
      isPlaceholder: true,
      placeholderKind: "REQING",
      placeholderLabel: rn.label,
      prereqText: "",
      coreqText: "",
      prereqTree: null,
      prereqCourseIds: [],
      prereqExternal: [],
      coreqTree: null,
      coreqCourseIds: [],
      coreqExternal: [],
      prereqSource: null,
      coreqSource: null,
      coreqTitles: {},
      restrictions: [],
      requirementAttestationId: rn.attestationId,
      requirementInfoUrl: rn.infoUrl,
      requirementDescription: rn.description,
    });
    requirementNodes.push({
      key: rn.key,
      label: rn.label,
      description: rn.description,
      infoUrl: rn.infoUrl,
      credits: rn.credits,
      semester: rn.semester,
      sortIndex: rn.sortIndex,
      attestationId: rn.attestationId,
      linkedCourseCodes: [...linked],
    });
  }

  // offerings for this catalog's term, keyed by codeNormalized
  const offerings: Record<string, OfferingBadge> = {};
  for (const { cc, codeNormalized } of rows) {
    if (cc.isPlaceholder || !cc.course) continue;
    const off = cc.course.offerings.find((o) => o.term === catalog.term);
    if (!off) continue;
    const min = off.seatsAvailableMin;
    const max = off.seatsAvailableMax;
    offerings[codeNormalized] = {
      offered: off.offered,
      sectionCount: off.sectionCount,
      seatsAvailable: min != null && max != null ? [min, max] : undefined,
      attrs: (off.attrs as string[] | null) ?? [],
      ptrm: (off.ptrmSet as string[] | null) ?? [],
      syncFailed: cc.pairingStatus === "sync_failed" || !!off.syncError,
    };
  }

  const siblings = await prisma.catalog.findMany({
    where: { status: "published", NOT: { slug } },
    select: { slug: true, variantLabel: true, programName: true },
    orderBy: [{ programCode: "asc" }, { slug: "asc" }],
  });

  const electiveRows = await prisma.elective.findMany({ orderBy: { name: "asc" } });
  const electives: ElectiveDTO[] = electiveRows.map((e) => ({
    id: e.id,
    name: e.name,
    code: e.code,
    level: e.level as ElectiveDTO["level"],
    ciclo: e.ciclo,
    roles: e.roles as unknown as ElectiveDTO["roles"],
    isCursoIntegrador: !!e.isCursoIntegrador,
    offeredTerms: (e.offeredTerms as unknown as string[] | null) ?? [],
  }));

  return {
    generatedAt: new Date().toISOString(),
    catalog: {
      slug: catalog.slug,
      programCode: catalog.programCode,
      programName: catalog.programName,
      variantLabel: catalog.variantLabel,
      term: catalog.term,
      status: catalog.status,
      accentColor: catalog.accentColor,
      tagline: catalog.tagline,
      subtitle: catalog.subtitle,
      imagePath: catalog.imagePath,
    },
    program: {
      code: catalog.programCode,
      name: catalog.programName,
      catalogLabel: [catalog.variantLabel, `CBU3 · ${termLabel(catalog.term)}`].filter(Boolean).join(" · "),
    },
    courses,
    offerings,
    siblings,
    electives,
    rules: ((catalog.rules as CatalogRules | null) ?? {
      gates: [],
      attestations: [],
    }) as CatalogRules,
    requirementNodes,
  };
}
