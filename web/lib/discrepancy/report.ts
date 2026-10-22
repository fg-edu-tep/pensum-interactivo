// Discrepancy report: for every course, which source decides what STUDENTS see
// for prerequisites / corequisites, and whether the admin-controlled "document"
// data (CatalogCourse.prereqText/Tree — seed, registro wizard, manual edits)
// disagrees with the official API data (CourseOffering.api*, synced per term).
//
// The governance is NOT re-implemented here: both this report and the student
// payload (lib/catalogPayload.ts) call lib/requirementResolve.ts, the one place
// the priority is written down (live API for the catalog's term → document →
// Registro upload → API data of another term; empty sources are skipped). The
// equivalence is still locked by lib/discrepancy/__tests__/payloadEquivalence.test.ts.
//
// `governor` stays two-valued for the alerts: "api" when the live API for the
// catalog's term decides, "document" otherwise (the document or, when it is
// empty, one of the secondary sources — `source` says which).
//
// Pure: no I/O.

import type { ReqNode, RequirementSource } from "../types";
import { renderRegistroExpr } from "../registro/requirements";
import { resolveRequirement, type ApiDetails, type RegistroEntry } from "../requirementResolve";
import { compareTrees } from "./compare";

export type Field = "prereq" | "coreq";
export type Governor = "api" | "document";

export type Status =
  | "match" // document == API (or both empty)
  | "soft-only" // same requirement, only the '*' markers differ
  | "differs" // the document asks for something different from the API
  | "doc-hidden" // API says "no requirement", document has one -> students see none
  | "api-only" // API has a requirement, document is empty
  | "unverified"; // no usable API data: the document governs and cannot be checked

export type Severity = "warn" | "info" | "ok";

export type UnverifiedReason =
  | "no-offering" // no CourseOffering row for the catalog's term
  | "not-offered" // the API confirms zero sections this term
  | "sync-failed" // the offering sync errored
  | "no-details" // offering exists but courseDetails was never fetched
  | "details-failed" // courseDetails fetch errored
  | "api-unparsed"; // API returned requirement text we could not parse

/** Who most likely put the document value there. */
export type Cause = "pinned" | "edited" | "imported";

export interface OfferingInput {
  offered: boolean;
  syncError: string | null;
  detailsSyncedAt: string | null;
  detailsError: string | null;
  apiPrereqText: string | null;
  apiPrereqTree: ReqNode | null;
  apiCoreqTree: ReqNode | null;
}

export interface CourseInput {
  catalogCourseId: number;
  displayCode: string;
  code: string;
  name: string;
  docPrereqText: string | null;
  docPrereqTree: ReqNode | null;
  docCoreqText: string | null;
  docCoreqTree: ReqNode | null;
  manuallyEdited: boolean;
  lockedFields: string[];
  /** the offering for the CATALOG's term (null when there is none) */
  offering: OfferingInput | null;
  /** secondary sources used when the API and the document have nothing */
  registro?: RegistroEntry | null;
  history?: ApiDetails[];
}

export interface FieldReport {
  field: Field;
  /** who decides what students see */
  governor: Governor;
  /** the exact source students get (null: no source has data) */
  source: RequirementSource;
  sourceTerm: string | null;
  status: Status;
  severity: Severity;
  /** the tree students actually get (same as catalogPayload) */
  visible: ReqNode | null;
  visibleText: string;
  apiText: string;
  documentText: string;
  onlyInApi: string[];
  onlyInDocument: string[];
  cause: Cause;
  unverifiedReason?: UnverifiedReason;
  /** ISO time of the API details this comparison used */
  apiSyncedAt: string | null;
}

export interface CourseReport {
  catalogCourseId: number;
  displayCode: string;
  code: string;
  name: string;
  prereq: FieldReport;
  coreq: FieldReport;
}

export function detailsFetched(o: OfferingInput | null): boolean {
  return !!o?.detailsSyncedAt && !o?.detailsError;
}

function currentDetails(o: OfferingInput | null): ApiDetails | null {
  return o
    ? {
        term: "",
        detailsSyncedAt: o.detailsSyncedAt,
        detailsError: o.detailsError,
        apiPrereqText: o.apiPrereqText,
        apiPrereqTree: o.apiPrereqTree,
        apiCoreqTree: o.apiCoreqTree,
      }
    : null;
}

/** The exact tree/text students get (lib/requirementResolve.ts, as the payload). */
export function effectiveTree(
  field: Field,
  o: OfferingInput | null,
  docTree: ReqNode | null,
  extra: { docText?: string | null; registro?: RegistroEntry | null; history?: ApiDetails[] } = {}
): { tree: ReqNode | null; governor: Governor; source: RequirementSource; sourceTerm: string | null; text: string } {
  const docText = extra.docText ?? null;
  const r = resolveRequirement(field, {
    current: currentDetails(o),
    document:
      field === "prereq"
        ? { prereqText: docText, prereqTree: docTree, coreqText: null, coreqTree: null }
        : { prereqText: null, prereqTree: null, coreqText: docText, coreqTree: docTree },
    registro: extra.registro ?? null,
    history: extra.history ?? [],
  });
  return {
    tree: r.tree,
    governor: r.source === "api" ? "api" : "document",
    source: r.source,
    sourceTerm: r.source === "api" ? null : r.sourceTerm,
    text: r.text,
  };
}

function unverifiedReason(o: OfferingInput | null, field: Field): UnverifiedReason {
  if (!o) return "no-offering";
  if (!o.offered) return "not-offered";
  if (o.syncError) return "sync-failed";
  if (!o.detailsSyncedAt) return "no-details";
  if (o.detailsError) return "details-failed";
  if (field === "prereq" && o.apiPrereqText && !o.apiPrereqTree) return "api-unparsed";
  return "no-details";
}

function causeOf(c: CourseInput, field: Field): Cause {
  const lockName = field === "prereq" ? "prereqText" : "coreqText";
  if (c.lockedFields.includes(lockName)) return "pinned";
  if (c.manuallyEdited) return "edited";
  return "imported";
}

const SEVERITY: Record<Status, Severity> = {
  match: "ok",
  "soft-only": "info",
  "api-only": "info",
  unverified: "info",
  differs: "warn",
  "doc-hidden": "warn",
};

export function reportField(c: CourseInput, field: Field): FieldReport {
  const o = c.offering;
  const docTree = field === "prereq" ? c.docPrereqTree : c.docCoreqTree;
  const docText = (field === "prereq" ? c.docPrereqText : c.docCoreqText) ?? "";
  const apiTree = field === "prereq" ? (o?.apiPrereqTree ?? null) : (o?.apiCoreqTree ?? null);
  const apiText = field === "prereq" ? (o?.apiPrereqText ?? "") : renderRegistroExpr(apiTree);
  const { tree: visible, governor, source, sourceTerm, text: visibleText } = effectiveTree(field, o, docTree, {
    docText,
    registro: c.registro,
    history: c.history,
  });

  const base = {
    field,
    governor,
    source,
    sourceTerm,
    visible,
    visibleText,
    apiText,
    documentText: docText,
    cause: causeOf(c, field),
    apiSyncedAt: o?.detailsSyncedAt ?? null,
    onlyInApi: [] as string[],
    onlyInDocument: [] as string[],
  };

  if (governor === "document") {
    return { ...base, status: "unverified", severity: SEVERITY.unverified, unverifiedReason: unverifiedReason(o, field) };
  }

  // the API governs: compare its tree with the document's
  if (apiTree) {
    if (!docTree) return { ...base, status: "api-only", severity: SEVERITY["api-only"], onlyInApi: [...collect(apiTree)] };
    const cmp = compareTrees(apiTree, docTree);
    const status: Status = cmp.relation === "same" ? "match" : cmp.relation === "soft-only" ? "soft-only" : "differs";
    return { ...base, status, severity: SEVERITY[status], onlyInApi: cmp.onlyInApi, onlyInDocument: cmp.onlyInDocument };
  }
  // API confirmed "no requirement"
  if (docTree) return { ...base, status: "doc-hidden", severity: SEVERITY["doc-hidden"], onlyInDocument: [...collect(docTree)] };
  return { ...base, status: "match", severity: SEVERITY.match };
}

function collect(t: ReqNode | null, out = new Set<string>()): Set<string> {
  if (!t) return out;
  if (t.op === "COURSE") {
    if (t.code) out.add(t.code);
  } else for (const it of t.items ?? []) collect(it, out);
  return out;
}

export function reportCourse(c: CourseInput): CourseReport {
  return {
    catalogCourseId: c.catalogCourseId,
    displayCode: c.displayCode,
    code: c.code,
    name: c.name,
    prereq: reportField(c, "prereq"),
    coreq: reportField(c, "coreq"),
  };
}

export interface Summary {
  courses: number;
  warn: number;
  info: number;
  /** fields decided by the API */
  apiGoverned: number;
  /** fields decided by the document (nothing to compare against) */
  documentGoverned: number;
  byStatus: Record<Status, number>;
}

export function summarize(reports: CourseReport[]): Summary {
  const byStatus: Record<Status, number> = {
    match: 0, "soft-only": 0, differs: 0, "doc-hidden": 0, "api-only": 0, unverified: 0,
  };
  let warn = 0, info = 0, apiGoverned = 0, documentGoverned = 0;
  for (const r of reports) {
    for (const f of [r.prereq, r.coreq]) {
      byStatus[f.status]++;
      if (f.severity === "warn") warn++;
      else if (f.severity === "info" && f.status !== "unverified") info++;
      if (f.governor === "api") apiGoverned++;
      else documentGoverned++;
    }
  }
  return { courses: reports.length, warn, info, apiGoverned, documentGoverned, byStatus };
}

/** Human labels (Spanish) shared by every surface so wording stays consistent. */
export const STATUS_LABEL: Record<Status, string> = {
  match: "Coincide",
  "soft-only": "Solo difiere el marcador *",
  differs: "Difiere de la API",
  "doc-hidden": "El documento tiene un requisito que la API no",
  "api-only": "La API tiene un requisito que el documento no",
  unverified: "Sin datos de la API",
};

export const CAUSE_LABEL: Record<Cause, string> = {
  pinned: "campo fijado 🔒",
  edited: "editado a mano",
  imported: "importado",
};

export const UNVERIFIED_LABEL: Record<UnverifiedReason, string> = {
  "no-offering": "sin registro de oferta para este semestre",
  "not-offered": "no se dicta este semestre",
  "sync-failed": "falló la sincronización con la API",
  "no-details": "aún no se traen los requisitos de la API",
  "details-failed": "falló la consulta de requisitos a la API",
  "api-unparsed": "la API devolvió un texto que no se pudo interpretar",
};

const FIELD_NAME = { prereq: "prerrequisitos", coreq: "correquisitos" } as const;

function termShort(t: string | null | undefined): string {
  return t && /^\d{6}$/.test(t) ? `${t.slice(0, 4)}-${t.slice(4, 5)}` : t ?? "";
}

/** What students see when the API of the catalog's term has nothing. */
function fallbackClause(f: Partial<Pick<FieldReport, "source" | "sourceTerm">>): string {
  if (f.source === "registro")
    return `el documento está vacío, los estudiantes ven los del Registro${f.sourceTerm ? ` (${termShort(f.sourceTerm)})` : ""}`;
  if (f.source === "api-history")
    return `el documento está vacío, los estudiantes ven los de la API de ${termShort(f.sourceTerm)}`;
  if (f.source === null) return "ninguna fuente tiene datos: los estudiantes no ven requisitos";
  return "los estudiantes ven el documento tal cual";
}

/**
 * One-sentence explanation of what students see. Pure so it is unit-tested and
 * identical on every surface. (Every student surface, the enrolment basket
 * included, now shows the text of the source that won.)
 */
export function headlineFor(
  f: Pick<FieldReport, "field" | "status" | "unverifiedReason" | "documentText"> &
    Partial<Pick<FieldReport, "source" | "sourceTerm">>
): string {
  const what = FIELD_NAME[f.field];
  switch (f.status) {
    case "differs":
      return `Los estudiantes ven los ${what} oficiales de la API, no los del documento.`;
    case "doc-hidden":
      return `La API confirma que este curso no tiene ${what}; los del documento no se aplican en el mapa.`;
    case "api-only":
      return `La API tiene ${what} y el documento está vacío. Los estudiantes ven los de la API.`;
    case "soft-only":
      return `Mismos ${what}; solo difiere el marcador * (concurrente).`;
    case "unverified":
      return `Sin datos oficiales (${f.unverifiedReason ? UNVERIFIED_LABEL[f.unverifiedReason] : "sin datos"}): ${fallbackClause(f)}.`;
    case "match":
      return `Los ${what} coinciden con la API.`;
  }
}