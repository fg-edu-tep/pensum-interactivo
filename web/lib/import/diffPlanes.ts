// Field-level diff of a parsed PLANES.xlsx against the current DB. Rows / fields
// an admin has pinned (`lockedFields`) surface as conflicts; nothing is written
// here — see applyPlanes.ts.

import type { PrismaClient } from "@prisma/client";
import { normalizeCode } from "./normalizeCode";
import type {
  ParsedPlanCourse,
  ParsedPlanesWorkbook,
  ParsedRequirementNode,
} from "./parsePlanesWorkbook";

interface DbCourseRow {
  displayCode: string;
  name: string;
  credits: number;
  suggestedSemester: number;
  courseType: string;
  category: string | null;
  isPlaceholder: boolean;
  placeholderKind: string | null;
  placeholderLabel: string | null;
  prereqText: string | null;
  coreqText: string | null;
  manuallyEdited: boolean;
  lockedFields: unknown;
  courseId: number | null;
  course: { normalizedCode: string } | null;
}

export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface CourseDiff {
  key: string;
  code: string;
  name: string;
  kind: "added" | "removed" | "modified";
  changes: FieldChange[];
  conflictFields: string[]; // changed fields listed in the DB row's lockedFields
  manuallyEdited: boolean;
}

export interface CatalogDiff {
  slug: string;
  programName: string;
  isNew: boolean;
  metaChanges: FieldChange[];
  courses: CourseDiff[];
  unchangedCount: number;
}

export interface EntityDiff {
  id: string;
  label: string;
  kind: "added" | "removed" | "modified";
  changes: FieldChange[];
}

export interface PlanesDiff {
  catalogs: CatalogDiff[];
  requirementNodes: EntityDiff[];
  gradRules: EntityDiff[];
  warnings: string[];
  counts: { added: number; removed: number; modified: number; conflicts: number };
}

const eq = (a: unknown, b: unknown) => {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => x === b[i]);
  }
  if (a == null || a === "") return b == null || b === "";
  return String(a) === String(b);
};

/** Registro pads requisites with runs of spaces: they don't count as a change */
const ws = (s: string | null | undefined) => String(s ?? "").replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();

function occKey(
  c: { isPlaceholder: boolean; placeholderKind?: string | null; normalizedCode: string; semester: number | null },
  occ: Map<string, number>
): string {
  if (!c.isPlaceholder && c.normalizedCode) return c.normalizedCode;
  const base = `${c.placeholderKind ?? "SLOT"}#${c.semester ?? "?"}`;
  const n = (occ.get(base) ?? 0) + 1;
  occ.set(base, n);
  return `${base}#${n}`;
}

export async function buildPlanesDiff(
  parsed: ParsedPlanesWorkbook,
  prisma: PrismaClient
): Promise<PlanesDiff> {
  const warnings = [...parsed.warnings];
  const counts = { added: 0, removed: 0, modified: 0, conflicts: 0 };

  const dbCatalogs = await prisma.catalog.findMany({
    include: {
      courses: {
        orderBy: { sortIndex: "asc" },
        include: { course: { select: { normalizedCode: true } } },
      },
      requirementNodes: true,
    },
  });
  const dbBySlug = new Map(dbCatalogs.map((c) => [c.slug, c]));

  // ---------- catalogs + courses ----------
  const catalogs: CatalogDiff[] = [];
  for (const meta of parsed.catalogs) {
    const db = dbBySlug.get(meta.slug);
    const parsedCourses = parsed.courses[meta.slug] ?? [];

    const metaChanges: FieldChange[] = [];
    if (db) {
      const cmp: [string, unknown, unknown][] = [
        ["programName", db.programName, meta.programName],
        ["variantLabel", db.variantLabel, meta.variantLabel],
        ["term", db.term, meta.term],
        ["status", db.status, meta.status],
        ["accentColor", db.accentColor, meta.accentColor],
        ["tagline", db.tagline, meta.tagline],
      ];
      for (const [f, before, after] of cmp) {
        if (after !== "" && after != null && !eq(before, after)) {
          metaChanges.push({ field: f, before, after });
        }
      }
    }

    // key both sides
    const pOcc = new Map<string, number>();
    const parsedByKey = new Map<string, ParsedPlanCourse>();
    for (const pc of parsedCourses) parsedByKey.set(occKey(pc, pOcc), pc);

    const dOcc = new Map<string, number>();
    const dbByKey = new Map<string, DbCourseRow>();
    for (const dc of (db?.courses ?? []) as DbCourseRow[]) {
      dbByKey.set(
        occKey(
          {
            isPlaceholder: dc.isPlaceholder,
            placeholderKind: dc.placeholderKind,
            normalizedCode: dc.isPlaceholder
              ? ""
              : dc.course?.normalizedCode ?? normalizeCode(dc.displayCode),
            semester: dc.suggestedSemester,
          },
          dOcc
        ),
        dc
      );
    }

    const courseDiffs: CourseDiff[] = [];
    let unchanged = 0;

    for (const [key, pc] of parsedByKey) {
      const dc = dbByKey.get(key);
      if (!dc) {
        courseDiffs.push({
          key,
          code: pc.displayCode,
          name: pc.name,
          kind: "added",
          changes: [],
          conflictFields: [],
          manuallyEdited: false,
        });
        counts.added++;
        continue;
      }
      const locked = new Set(
        ((dc.lockedFields as string[] | null) ?? []).map(String)
      );
      const changes: FieldChange[] = [];
      // the official matrix carries Banner's 30-character names ("ELEMENT.SISTEMAS
      // ELÉCTRICOS"): a course already in the plan keeps its curated name
      const matrix = parsed.format === "matrix";
      const consider: [string, unknown, unknown][] = [
        ...(matrix ? [] : ([["name", dc.name, pc.name]] as [string, unknown, unknown][])),
        ["credits", dc.credits, pc.credits],
        ["suggestedSemester", dc.suggestedSemester, pc.semester],
        ["courseType", dc.courseType, pc.courseType],
        ["placeholderLabel", dc.placeholderLabel, pc.placeholderLabel ?? null],
        // only the official file has TIPO; the coordinator template leaves it alone
        ...(pc.category !== undefined ? ([["category", dc.category, pc.category]] as [string, unknown, unknown][]) : []),
      ];
      for (const [f, before, after] of consider) {
        if (after == null && f === "suggestedSemester") continue; // missing sem -> warning already
        if (!eq(before, after)) changes.push({ field: f, before, after });
      }
      // prereqText: only propose a change when the sheet has a non-empty value
      if (pc.prereqText && !eq(ws(dc.prereqText), ws(pc.prereqText))) {
        changes.push({ field: "prereqText", before: dc.prereqText ?? "", after: pc.prereqText });
      }
      // the matrix is authoritative for requisites: an emptied cell clears them
      if (matrix && !pc.isPlaceholder && !pc.prereqText && (dc.prereqText ?? "").trim()) {
        changes.push({ field: "prereqText", before: dc.prereqText ?? "", after: "" });
      }
      if (pc.coreqText !== undefined && !pc.isPlaceholder && !eq(ws(dc.coreqText), ws(pc.coreqText))) {
        changes.push({ field: "coreqText", before: dc.coreqText ?? "", after: pc.coreqText });
      }

      if (changes.length === 0) {
        unchanged++;
      } else {
        const conflictFields = changes
          .map((c) => c.field)
          .filter((f) => locked.has(f));
        counts.modified++;
        counts.conflicts += conflictFields.length;
        courseDiffs.push({
          key,
          code: pc.displayCode,
          name: pc.name,
          kind: "modified",
          changes,
          conflictFields,
          manuallyEdited: dc.manuallyEdited,
        });
      }
    }

    for (const [key, dc] of dbByKey) {
      if (parsedByKey.has(key)) continue;
      courseDiffs.push({
        key,
        code: dc.displayCode,
        name: dc.name,
        kind: "removed",
        changes: [],
        conflictFields: dc.manuallyEdited ? ["*"] : [],
        manuallyEdited: dc.manuallyEdited,
      });
      counts.removed++;
      if (dc.manuallyEdited) counts.conflicts++;
    }

    catalogs.push({
      slug: meta.slug,
      programName: meta.programName || db?.programName || meta.slug,
      isNew: !db,
      metaChanges,
      courses: courseDiffs,
      unchangedCount: unchanged,
    });
  }

  if (parsed.format === "matrix") {
    return { catalogs, requirementNodes: [], gradRules: [], warnings, counts };
  }

  // ---------- requirement nodes (compared against every catalog that has them;
  //            the template is global, so diff against the union keyed by `key`) ----------
  const dbNodes = new Map<string, ParsedRequirementNode & { _count: number }>();
  for (const c of dbCatalogs) {
    for (const n of c.requirementNodes) {
      if (dbNodes.has(n.key)) {
        dbNodes.get(n.key)!._count++;
        continue;
      }
      dbNodes.set(n.key, {
        key: n.key,
        label: n.label,
        semester: n.semester,
        attestationId: n.attestationId,
        autoLinkRegex: n.autoLinkRegex,
        linkedCourseCodes:
          ((n.linkedCourseCodes as string[] | null) ?? []).map(String),
        infoUrl: n.infoUrl,
        description: n.description,
        _count: 1,
      });
    }
  }
  const requirementNodes: EntityDiff[] = [];
  const parsedNodeKeys = new Set(parsed.requirementNodes.map((n) => n.key));
  for (const pn of parsed.requirementNodes) {
    const dn = dbNodes.get(pn.key);
    if (!dn) {
      requirementNodes.push({ id: pn.key, label: pn.label, kind: "added", changes: [] });
      counts.added++;
      continue;
    }
    const changes: FieldChange[] = [];
    const cmp: [string, unknown, unknown][] = [
      ["label", dn.label, pn.label],
      ["semester", dn.semester, pn.semester],
      ["attestationId", dn.attestationId, pn.attestationId],
      ["autoLinkRegex", dn.autoLinkRegex, pn.autoLinkRegex],
      ["linkedCourseCodes", dn.linkedCourseCodes, pn.linkedCourseCodes],
      ["infoUrl", dn.infoUrl, pn.infoUrl],
      ["description", dn.description, pn.description],
    ];
    for (const [f, before, after] of cmp) {
      if (f === "semester" && after == null) continue;
      if (!eq(before, after)) changes.push({ field: f, before, after });
    }
    if (changes.length) {
      requirementNodes.push({ id: pn.key, label: pn.label, kind: "modified", changes });
      counts.modified++;
    }
  }
  for (const [key, dn] of dbNodes) {
    if (!parsedNodeKeys.has(key)) {
      requirementNodes.push({ id: key, label: dn.label, kind: "removed", changes: [] });
      counts.removed++;
    }
  }

  // ---------- graduation rules (attestations only for v1; gates carried as JSON) ----------
  const anyRules = (dbCatalogs[0]?.rules ?? { attestations: [], gates: [] }) as {
    attestations?: { id: string; label: string; description?: string }[];
    gates?: { id: string; label: string }[];
  };
  const dbAtt = new Map((anyRules.attestations ?? []).map((a) => [a.id, a]));
  const gradRules: EntityDiff[] = [];
  const parsedIds = new Set(parsed.gradRequirements.map((r) => r.id));
  for (const pr of parsed.gradRequirements) {
    if (pr.type !== "atestación" && pr.type !== "atestacion") {
      if (pr.type === "gate" && !safeJson(pr.rule)) {
        warnings.push(`Requisito de grado "${pr.id}": la regla del gate no es JSON válido — se ignora.`);
      }
      continue;
    }
    const da = dbAtt.get(pr.id);
    if (!da) {
      gradRules.push({ id: pr.id, label: pr.label, kind: "added", changes: [] });
      counts.added++;
      continue;
    }
    const changes: FieldChange[] = [];
    if (!eq(da.label, pr.label)) changes.push({ field: "label", before: da.label, after: pr.label });
    if (!eq(da.description ?? "", pr.description))
      changes.push({ field: "description", before: da.description ?? "", after: pr.description });
    if (changes.length) {
      gradRules.push({ id: pr.id, label: pr.label, kind: "modified", changes });
      counts.modified++;
    }
  }
  for (const [id, da] of dbAtt) {
    if (!parsedIds.has(id)) {
      gradRules.push({ id, label: da.label, kind: "removed", changes: [] });
      counts.removed++;
    }
  }

  return { catalogs, requirementNodes, gradRules, warnings, counts };
}

function safeJson(s: string): boolean {
  try {
    JSON.parse(s.replace(/^[^{[]*/, ""));
    return true;
  } catch {
    return false;
  }
}
