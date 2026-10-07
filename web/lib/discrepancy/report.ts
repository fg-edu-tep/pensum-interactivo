// Discrepancy report: for every course, which source decides what STUDENTS see
// for prerequisites / corequisites, and whether the admin-controlled "document"
// data (CatalogCourse.prereqText/Tree — seed, registro wizard, manual edits)
// disagrees with the official API data (CourseOffering.api*, synced per term).
//
// The governance below is a deliberate MIRROR of lib/catalogPayload.ts (the
// student payload builder), which is intentionally left untouched. The
// equivalence is locked by lib/discrepancy/__tests__/payloadEquivalence.test.ts,
// which runs both against the same database and fails if they ever diverge.
//
// Precedence (confirmed as intended behaviour — "prefer API, only fall back to
// the document"):
//   prereq: apiTree ?? (detailsFetched && no apiText ? NONE : documentTree)
//   coreq : apiTree ?? (detailsFetched ? NONE : documentTree)
//   detailsFetched = detailsSyncedAt set && no detailsError, for catalog.term
//
// Pure: no I/O.

import type { ReqNode } from "../types";
import { renderRegistroExpr } from "../registro/requirements";
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
}

export interface FieldReport {
  field: Field;
  /** who decides what students see */
  governor: Governor;
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

/** The exact tree students get — mirrors lib/catalogPayload.ts. */
export function effectiveTree(
  field: Field,
  o: OfferingInput | null,
  docTree: ReqNode | null
): { tree: ReqNode | null; governor: Governor } {
  const fetched = detailsFetched(o);
  if (field === "prereq") {
    const apiTree = o?.apiPrereqTree ?? null;
    if (apiTree) return { tree: apiTree, governor: "api" };
    if (fetched && !o?.apiPrereqText) return { tree: null, governor: "api" };
    return { tree: docTree, governor: "document" };
  }
  const apiTree = o?.apiCoreqTree ?? null;
  if (apiTree) return { tree: apiTree, governor: "api" };
  if (fetched) return { tree: null, governor: "api" };
  return { tree: docTree, governor: "document" };
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
  const { tree: visible, governor } = effectiveTree(field, o, docTree);

  // The TEXT the student payload shows is chosen differently from the tree:
  //   prereqText = apiPrereqTree ? apiText : document text   (even when the API says "none")
  //   coreqText  = always the document's coreqText
  // Mirrored as-is (payload intentionally untouched); see docs/admin-discrepancies.md
  // "Known inconsistencies in the student payload".
  const visibleText = field === "prereq" ? (apiTree ? apiText : docText) : docText;

  const base = {
    field,
    governor,
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

/**
 * One-sentence explanation of what students see. Pure so it is unit-tested and
 * identical on every surface.
 *
 * Corequisites need an extra caveat: the explorer draws them from the tree
 * (API first) but the enrolment basket prints the DOCUMENT's coreqText as a chip
 * regardless of who governs (components/explorer/BasketModal.tsx), so a
 * document coreq that disagrees with the API can still reach students there.
 */
export function headlineFor(f: Pick<FieldReport, "field" | "status" | "unverifiedReason" | "documentText">): string {
  const what = FIELD_NAME[f.field];
  const basket =
    f.field === "coreq" && f.documentText.trim()
      ? " Ojo: la canasta de inscripción sigue mostrando el texto del documento como nota de correquisito."
      : "";
  switch (f.status) {
    case "differs":
      return `Los estudiantes ven los ${what} oficiales de la API, no los del documento.${basket}`;
    case "doc-hidden":
      return `La API confirma que este curso no tiene ${what}; los del documento no se aplican en el mapa.${basket}`;
    case "api-only":
      return `La API tiene ${what} y el documento está vacío. Los estudiantes ven los de la API.`;
    case "soft-only":
      return `Mismos ${what}; solo difiere el marcador * (concurrente).`;
    case "unverified":
      return `Sin datos oficiales (${f.unverifiedReason ? UNVERIFIED_LABEL[f.unverifiedReason] : "sin datos"}): los estudiantes ven el documento tal cual.`;
    case "match":
      return `Los ${what} coinciden con la API.`;
  }
}