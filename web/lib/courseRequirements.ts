// One course's prerequisites / corequisites across every plan that contains it:
// what each source says, what students actually see, and the edit that writes
// the plan's own ("document") value — optionally overriding the live API.
//
// Used by the MCP endpoint (app/api/mcp). Precedence is NOT re-implemented here:
// what students see comes from lib/requirementResolve.ts, like the payload and
// the discrepancy report.

import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { writeAudit } from "./audit";
import type { ReqNode } from "./types";
import { normalizeCode } from "./import/normalizeCode";
import { collectCourseCodes, parseRequirement } from "./import/requirementParser";
import { renderRegistroExpr } from "./registro/requirements";
import { parseCoreqText, resolveRequirement, detailsOk, type ReqField } from "./requirementResolve";
import { apiDetailsOf, loadRegistroDictionary, requirementCandidates } from "./requirementSources";
import { compareTrees } from "./discrepancy/compare";

export type { ReqField };

const FIELD_ES: Record<ReqField, string> = { prereq: "prerrequisitos", coreq: "correquisitos" };
const TEXT_COL = { prereq: "prereqText", coreq: "coreqText" } as const;
const TREE_COL = { prereq: "prereqTree", coreq: "coreqTree" } as const;
const OVERRIDE_COL = { prereq: "prereqOverride", coreq: "coreqOverride" } as const;

/** "iele 1010 y (mate 1203 or mate-1214*)" → "IELE 1010 Y (MATE 1203 O MATE 1214*)". */
export function normalizeRequirementInput(text: string): string {
  return text
    .toUpperCase()
    .replace(/\bAND\b/g, "Y")
    .replace(/\bOR\b/g, "O")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ParsedInput {
  text: string;
  tree: ReqNode | null;
  /** the tree rendered back, so the admin sees how it was read */
  interpreted: string;
  error?: string;
}

/** Parse an admin-typed requirement. Empty text = "no requirement". The parser
 * skips tokens it doesn't know, so every code typed must survive the parse. */
export function parseRequirementInput(field: ReqField, raw: string): ParsedInput {
  const text = normalizeRequirementInput(raw ?? "");
  if (!text) return { text: "", tree: null, interpreted: "" };
  const tree = field === "prereq" ? parseRequirement(text) : parseCoreqText(text);
  const interpreted = renderRegistroExpr(tree);
  if (!tree) {
    return { text, tree, interpreted, error: `No se pudo interpretar "${raw}". Usa códigos como "IELE 1010", unidos con Y / O y paréntesis.` };
  }
  const typed = [...text.matchAll(/\b([A-ZÑ]{3,5})\s*-?\s*(\d{3,4}[A-Z]?)\b/g)].map((m) => normalizeCode(m[1] + m[2]));
  const parsed = collectCourseCodes(tree);
  const lost = typed.filter((c) => !parsed.has(c));
  if (lost.length) {
    return { text, tree, interpreted, error: `Se interpretó como "${interpreted}" y se perdieron ${lost.join(", ")}. Revisa los conectores (Y / O) y los paréntesis.` };
  }
  return { text, tree, interpreted };
}

const rowInclude = {
  catalog: { select: { slug: true, programName: true, variantLabel: true, status: true, term: true } },
  course: { include: { offerings: true } },
} satisfies Prisma.CatalogCourseInclude;

type Row = Prisma.CatalogCourseGetPayload<{ include: typeof rowInclude }>;

/** The plan rows of a course. Archived plans only when named in `plans`. */
async function loadRows(code: string, plans?: string[]): Promise<Row[]> {
  const normalized = normalizeCode(code);
  if (!normalized) return [];
  return prisma.catalogCourse.findMany({
    where: {
      isPlaceholder: false,
      course: { normalizedCode: normalized },
      catalog: plans?.length ? { slug: { in: plans } } : { status: { not: "archived" } },
    },
    include: rowInclude,
    orderBy: [{ catalog: { slug: "asc" } }, { sortIndex: "asc" }],
  });
}

export interface FieldView {
  /** the plan's own value (seed, official load, admin edits) */
  document: string;
  override: boolean;
  /** pinned against official re-loads */
  pinned: boolean;
  /** the live API for the plan's term: null = no usable data */
  api: { text: string; term: string } | null;
  /** what students get, after the precedence */
  studentsSee: { text: string; source: string; overridden: boolean };
  /** document vs API: null when the API has no data */
  relationToApi: "same" | "soft-only" | "different" | null;
}

export interface PlanView {
  plan: string;
  planName: string;
  status: string;
  term: string;
  catalogCourseId: number;
  prereq: FieldView;
  coreq: FieldView;
}

export interface CourseView {
  code: string;
  name: string;
  plans: PlanView[];
}

const SOURCE_ES: Record<string, string> = {
  api: "API oficial (este semestre)",
  document: "documento del plan",
  registro: "Registro",
  "api-history": "API de otro semestre",
  none: "ninguna fuente",
};

function apiSide(row: Row, field: ReqField): { tree: ReqNode | null; text: string; term: string } | null {
  const off = row.course?.offerings.find((o) => o.term === row.catalog.term);
  if (!off) return null;
  const d = apiDetailsOf(off);
  const tree = field === "prereq" ? d.apiPrereqTree : d.apiCoreqTree;
  if (tree) return { tree, text: field === "prereq" ? (d.apiPrereqText ?? "") : renderRegistroExpr(tree), term: d.term };
  const confirmedNone = field === "prereq" ? detailsOk(d) && !d.apiPrereqText : detailsOk(d);
  return confirmedNone ? { tree: null, text: "", term: d.term } : null;
}

function relation(api: { tree: ReqNode | null } | null, tree: ReqNode | null): FieldView["relationToApi"] {
  return api ? compareTrees(api.tree, tree).relation : null;
}

function viewOf(row: Row, registro: Awaited<ReturnType<typeof loadRegistroDictionary>>): PlanView {
  const code = row.course?.normalizedCode ?? "";
  const off = row.course?.offerings.find((o) => o.term === row.catalog.term) ?? null;
  const cand = requirementCandidates(
    row,
    off,
    registro.get(code) ?? null,
    (row.course?.offerings ?? []).filter((o) => o.term !== row.catalog.term)
  );
  const locked = (row.lockedFields as string[] | null) ?? [];
  const field = (f: ReqField): FieldView => {
    const r = resolveRequirement(f, cand);
    const api = apiSide(row, f);
    return {
      document: row[TEXT_COL[f]] ?? "",
      override: row[OVERRIDE_COL[f]],
      pinned: locked.includes(TEXT_COL[f]),
      api: api ? { text: api.text, term: api.term } : null,
      studentsSee: { text: r.text, source: SOURCE_ES[r.source ?? "none"], overridden: !!r.overridden },
      relationToApi: relation(api, (row[TREE_COL[f]] as ReqNode | null) ?? null),
    };
  };
  return {
    plan: row.catalog.slug,
    planName: [row.catalog.programName, row.catalog.variantLabel].filter(Boolean).join(" · "),
    status: row.catalog.status,
    term: row.catalog.term,
    catalogCourseId: row.id,
    prereq: field("prereq"),
    coreq: field("coreq"),
  };
}

async function viewRows(rows: Row[]): Promise<PlanView[]> {
  const registro = await loadRegistroDictionary(rows.map((r) => r.course?.normalizedCode ?? "").filter(Boolean));
  return rows.map((r) => viewOf(r, registro));
}

export async function getCourseRequirements(code: string, plans?: string[]): Promise<CourseView | null> {
  const rows = await loadRows(code, plans);
  if (rows.length === 0) return null;
  return { code: normalizeCode(code), name: rows[0].name, plans: await viewRows(rows) };
}

export interface CourseMatch {
  code: string;
  name: string;
  plans: string[];
}

/** Courses of the pensum plans by code or name (accent-insensitive on name). */
export async function searchCourses(query: string, limit = 20): Promise<CourseMatch[]> {
  const q = query.trim();
  if (!q) return [];
  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const code = normalizeCode(q);
  const rows = await prisma.catalogCourse.findMany({
    where: { isPlaceholder: false, courseId: { not: null }, catalog: { status: { not: "archived" } } },
    select: { name: true, catalog: { select: { slug: true } }, course: { select: { normalizedCode: true } } },
  });
  const byCode = new Map<string, CourseMatch>();
  const needle = fold(q);
  for (const r of rows) {
    const c = r.course?.normalizedCode ?? "";
    if (!(code && c.includes(code)) && !fold(r.name).includes(needle)) continue;
    const m = byCode.get(c) ?? { code: c, name: r.name, plans: [] };
    if (!m.plans.includes(r.catalog.slug)) m.plans.push(r.catalog.slug);
    byCode.set(c, m);
  }
  return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code)).slice(0, limit);
}

/** If `self` required `prereqs`, would the plan's prerequisites (its own
 * document values, as in the map editor) lead back to `self`? Returns the
 * closed path, or null. */
async function prereqCyclePath(catalogId: number, self: string, prereqs: string[]): Promise<string[] | null> {
  const rows = await prisma.catalogCourse.findMany({
    where: { catalogId, isPlaceholder: false, courseId: { not: null } },
    select: { prereqTree: true, course: { select: { normalizedCode: true } } },
  });
  const graph = new Map<string, string[]>();
  for (const r of rows) {
    const c = r.course?.normalizedCode;
    if (c && c !== self) graph.set(c, [...collectCourseCodes((r.prereqTree as ReqNode | null) ?? null)]);
  }
  return findPathBack(graph, self, prereqs);
}

/** Breadth-first from each new prerequisite along "requires" edges; a path that
 * reaches `self` closes a cycle. Exported for tests. */
export function findPathBack(graph: Map<string, string[]>, self: string, prereqs: string[]): string[] | null {
  const parent = new Map<string, string>();
  const queue = prereqs.filter((p) => p !== self);
  for (const p of queue) parent.set(p, self);
  while (queue.length) {
    const cur = queue.shift()!;
    for (const next of graph.get(cur) ?? []) {
      if (next === self) {
        // self requires p0, p0 requires … cur, cur requires self
        const chain: string[] = [];
        for (let at = cur; at !== self; at = parent.get(at)!) chain.push(at);
        return [self, ...chain.reverse(), self];
      }
      if (!parent.has(next)) {
        parent.set(next, cur);
        queue.push(next);
      }
    }
  }
  return null;
}

export interface SetRequirementInput {
  code: string;
  field: ReqField;
  text: string;
  /** plan slugs; default every non-archived plan with the course */
  plans?: string[];
  /** true: the new value beats the API · false: API keeps priority · undefined: keep each row's flag */
  override?: boolean;
  dryRun?: boolean;
  actor: string;
  /** recorded in the audit entry, e.g. "mcp" */
  via?: string;
}

export interface SetRequirementResult {
  saved: boolean;
  /** true when nothing was written because the admin must choose `override` */
  needsDecision: boolean;
  interpreted: string;
  warnings: string[];
  error?: string;
  plans: PlanView[];
}

/**
 * Write a course's prerequisite / corequisite text in its plans. When the new
 * value differs from the live API and the caller did not decide `override`,
 * nothing is saved: the result explains the difference so the admin chooses.
 */
export async function setCourseRequirement(input: SetRequirementInput): Promise<SetRequirementResult> {
  const { field } = input;
  const what = FIELD_ES[field];
  const rows = await loadRows(input.code, input.plans);
  const fail = (error: string, interpreted = ""): SetRequirementResult => ({
    saved: false, needsDecision: false, interpreted, warnings: [], error, plans: [],
  });
  if (rows.length === 0) {
    return fail(`El curso ${input.code} no está en ${input.plans?.length ? `los planes ${input.plans.join(", ")}` : "ningún plan activo"}.`);
  }
  if (input.plans?.length) {
    const found = new Set(rows.map((r) => r.catalog.slug));
    const missing = input.plans.filter((p) => !found.has(p));
    if (missing.length) return fail(`El curso no está en: ${missing.join(", ")}.`);
  }

  const parsed = parseRequirementInput(field, input.text);
  if (parsed.error) return fail(parsed.error, parsed.interpreted);

  const warnings: string[] = [];
  const self = normalizeCode(input.code);
  const codes = [...collectCourseCodes(parsed.tree)];
  if (codes.includes(self)) return fail(`El curso no puede ser ${what === "prerrequisitos" ? "prerrequisito" : "correquisito"} de sí mismo.`, parsed.interpreted);
  if (codes.length) {
    const known = new Set(
      (await prisma.course.findMany({ where: { normalizedCode: { in: codes } }, select: { normalizedCode: true } })).map((c) => c.normalizedCode)
    );
    const unknown = codes.filter((c) => !known.has(c));
    if (unknown.length) warnings.push(`Códigos que no están en la base de datos (¿error de digitación?): ${unknown.join(", ")}.`);
  }

  // a prerequisite cycle would make both courses unreachable in the planner
  // (the map editor refuses them too); corequisites are mutual by nature
  if (field === "prereq" && codes.length) {
    for (const r of rows) {
      const path = await prereqCyclePath(r.catalogId, self, codes);
      if (path) return fail(`Ciclo de prerrequisitos en ${r.catalog.slug}: ${path.join(" → ")}.`, parsed.interpreted);
    }
  }

  // how the new value compares with the API, plan by plan
  const differing: string[] = [];
  for (const r of rows) {
    const api = apiSide(r, field);
    const rel = relation(api, parsed.tree);
    if (api && rel !== "same") {
      differing.push(
        `${r.catalog.slug}: la API (${api.term}) dice "${api.text || "ninguno"}"` + (rel === "soft-only" ? " (solo cambia el marcador *)" : "")
      );
    }
  }
  if (differing.length) {
    warnings.push(`El valor nuevo ("${parsed.interpreted || "ninguno"}") difiere de la API oficial en ${differing.length} plan(es):\n- ${differing.join("\n- ")}`);
  }

  const before = await viewRows(rows);
  if (differing.length && input.override === undefined && !input.dryRun) {
    warnings.push(
      `No se guardó nada. Decide: override=true para que los estudiantes vean tu valor en lugar de la API, u override=false para guardarlo solo como respaldo (los estudiantes seguirán viendo la API).`
    );
    return { saved: false, needsDecision: true, interpreted: parsed.interpreted, warnings, plans: before };
  }
  if (input.override === false && differing.length) {
    warnings.push(`Se guarda como respaldo: donde la API tiene datos, los estudiantes seguirán viendo los de la API.`);
  }
  if (input.dryRun) {
    return { saved: false, needsDecision: false, interpreted: parsed.interpreted, warnings, plans: before };
  }

  for (const r of rows) {
    const data: Prisma.CatalogCourseUpdateInput = {
      [TEXT_COL[field]]: parsed.text || null,
      [TREE_COL[field]]: (parsed.tree ?? Prisma.JsonNull) as unknown as Prisma.InputJsonValue,
      manuallyEdited: true,
    };
    if (input.override !== undefined) data[OVERRIDE_COL[field]] = input.override;
    const updated = await prisma.catalogCourse.update({ where: { id: r.id }, data });
    await writeAudit({
      actor: input.actor,
      action: "course.update",
      entityType: "CatalogCourse",
      entityId: r.id,
      before: { [TEXT_COL[field]]: r[TEXT_COL[field]], [OVERRIDE_COL[field]]: r[OVERRIDE_COL[field]] },
      after: {
        [TEXT_COL[field]]: updated[TEXT_COL[field]],
        [OVERRIDE_COL[field]]: updated[OVERRIDE_COL[field]],
        plan: r.catalog.slug,
        ...(input.via ? { via: input.via } : {}),
      },
    });
  }
  const after = await viewRows(await loadRows(input.code, input.plans));
  return { saved: true, needsDecision: false, interpreted: parsed.interpreted, warnings, plans: after };
}

export interface SetOverrideInput {
  code: string;
  field: ReqField;
  enabled: boolean;
  plans?: string[];
  actor: string;
  via?: string;
}

/** Turn the admin override on or off without touching the text. */
export async function setRequirementOverride(input: SetOverrideInput): Promise<{ changed: number; warnings: string[]; error?: string; plans: PlanView[] }> {
  const { field } = input;
  const rows = await loadRows(input.code, input.plans);
  if (rows.length === 0) return { changed: 0, warnings: [], error: `El curso ${input.code} no está en ningún plan activo.`, plans: [] };
  const warnings: string[] = [];
  let changed = 0;
  for (const r of rows) {
    if (r[OVERRIDE_COL[field]] === input.enabled) continue;
    if (input.enabled && !r[TEXT_COL[field]]) {
      warnings.push(`${r.catalog.slug}: el documento está vacío, así que los estudiantes no verán ${FIELD_ES[field]} en este plan.`);
    }
    await prisma.catalogCourse.update({ where: { id: r.id }, data: { [OVERRIDE_COL[field]]: input.enabled, manuallyEdited: true } });
    await writeAudit({
      actor: input.actor,
      action: "course.update",
      entityType: "CatalogCourse",
      entityId: r.id,
      before: { [OVERRIDE_COL[field]]: r[OVERRIDE_COL[field]] },
      after: { [OVERRIDE_COL[field]]: input.enabled, plan: r.catalog.slug, ...(input.via ? { via: input.via } : {}) },
    });
    changed++;
  }
  return { changed, warnings, plans: await viewRows(await loadRows(input.code, input.plans)) };
}
