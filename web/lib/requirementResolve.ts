// Which source decides a course's prerequisites / corequisites — the ONE place
// the priority is written down. The student payload (lib/catalogPayload.ts) and
// the admin discrepancy report (lib/discrepancy/report.ts) both call this, so
// what admins are told always matches what students see.
//
// Priority (first source that HAS data wins; an empty source is skipped, never
// treated as "no requirement"):
//   1. api          live course details for the catalog's term. When the
//                   details were fetched and list no requirement, that is data:
//                   the course has none (for prereqs, only when the API text is
//                   empty — unparseable text falls through).
//   2. document     CatalogCourse.prereqText/coreqText: the seed, PLANES.xlsx
//                   imports, the Registro wizard and admin edits.
//   3. registro     the Registro dictionary (RegistroCourse) of the latest
//                   applied upload — or, when none was applied yet, the latest
//                   one not discarded.
//   4. api-history  course details synced for another term (most recent first),
//                   e.g. a course only taught in first semesters.
//   none of them → no requirement shown, source null.
//
// Pure: no I/O.

import type { ReqNode, RequirementSource } from "./types";
import { parseRequirement } from "./import/requirementParser";
import { renderRegistroExpr } from "./registro/requirements";

export type ReqField = "prereq" | "coreq";

export interface ApiDetails {
  term: string;
  detailsSyncedAt: Date | string | null;
  detailsError: string | null;
  apiPrereqText: string | null;
  apiPrereqTree: ReqNode | null;
  apiCoreqTree: ReqNode | null;
}

export interface RegistroEntry {
  period: string;
  prereqText: string | null;
  coreqText: string | null;
}

export interface RequirementCandidates {
  /** the offering for the CATALOG's term (null when there is none) */
  current: ApiDetails | null;
  document: {
    prereqText: string | null;
    prereqTree: ReqNode | null;
    coreqText: string | null;
    coreqTree: ReqNode | null;
  };
  registro?: RegistroEntry | null;
  /** offerings of OTHER terms, any order (sorted newest first here) */
  history?: ApiDetails[];
}

export interface ResolvedRequirement {
  tree: ReqNode | null;
  /** the expression as shown to students; always the winning source's */
  text: string;
  source: RequirementSource;
  /** the term/period the data belongs to, when the source has one */
  sourceTerm: string | null;
}

export function detailsOk(o: ApiDetails | null | undefined): boolean {
  return !!o?.detailsSyncedAt && !o?.detailsError;
}

/** Coreq codes in the Registro export are hyphenated lab companions
 * ("IELE-1118L"); a space lets the tokenizer read "<PREFIX> <number><letter>". */
export function parseCoreqText(text: string | null | undefined): ReqNode | null {
  return parseRequirement((text ?? "").replace(/-/g, " "));
}

function apiTree(o: ApiDetails, field: ReqField): ReqNode | null {
  return (field === "prereq" ? o.apiPrereqTree : o.apiCoreqTree) ?? null;
}

function apiText(o: ApiDetails, field: ReqField, tree: ReqNode | null): string {
  return field === "prereq" ? (o.apiPrereqText ?? "") : renderRegistroExpr(tree);
}

const NONE: ResolvedRequirement = { tree: null, text: "", source: null, sourceTerm: null };

export function resolveRequirement(field: ReqField, c: RequirementCandidates): ResolvedRequirement {
  // 1. live API, this term
  const cur = c.current;
  if (cur) {
    const t = apiTree(cur, field);
    if (t) return { tree: t, text: apiText(cur, field, t), source: "api", sourceTerm: cur.term };
    const confirmedNone = field === "prereq" ? detailsOk(cur) && !cur.apiPrereqText : detailsOk(cur);
    if (confirmedNone) return { tree: null, text: "", source: "api", sourceTerm: cur.term };
  }

  // 2. the plan's own document data
  const docText = (field === "prereq" ? c.document.prereqText : c.document.coreqText) ?? "";
  const docTree = (field === "prereq" ? c.document.prereqTree : c.document.coreqTree) ?? null;
  if (docTree) return { tree: docTree, text: docText.trim(), source: "document", sourceTerm: null };

  // 3. the Registro dictionary
  const reg = c.registro;
  if (reg) {
    const text = ((field === "prereq" ? reg.prereqText : reg.coreqText) ?? "").trim();
    const tree = field === "prereq" ? parseRequirement(text) : parseCoreqText(text);
    if (tree) return { tree, text, source: "registro", sourceTerm: reg.period || null };
  }

  // 4. the API data of another term, newest first
  const hist = [...(c.history ?? [])].filter(detailsOk).sort((a, b) => b.term.localeCompare(a.term));
  for (const h of hist) {
    const t = apiTree(h, field);
    if (t) return { tree: t, text: apiText(h, field, t), source: "api-history", sourceTerm: h.term };
  }

  return NONE;
}
