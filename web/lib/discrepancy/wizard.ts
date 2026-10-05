// Registro-wizard ↔ discrepancy glue (pure).
//
//  - annotateCourse: for each planned prereq/coreq change, who governs what
//    students see, and would the NEW value agree with the official API?
//  - apiMentions: for a code the registro lacks ("ref-missing"), which courses'
//    official API expressions still list it. If the API still lists it, the code
//    is NOT retired — it just has no row in the term window — and dropping it
//    would make the document differ from what students see.

import { parseRequirement, collectCourseCodes } from "../import/requirementParser";
import type { CourseLinkPlan } from "../registro/analyze";
import { parseCoreq, renderRegistroExpr } from "../registro/requirements";
import type { UnresolvedItem } from "../registro/types";
import { compareTrees } from "./compare";
import { effectiveTree, type CourseInput, type Governor } from "./report";

export interface StudentImpact {
  field: "prereqText" | "coreqText";
  /** who decides what students see for this field */
  governor: Governor;
  /** the official expression (empty when none) */
  apiText: string;
  /** true = the new document value agrees with the API; false = it would differ; null = nothing to compare (document governs) */
  newMatchesApi: boolean | null;
}

export function annotateCourse(plan: CourseLinkPlan, input: CourseInput | undefined): StudentImpact[] {
  if (!input) return [];
  const out: StudentImpact[] = [];
  for (const ch of plan.changes) {
    if (ch.field !== "prereqText" && ch.field !== "coreqText") continue;
    const field = ch.field === "prereqText" ? "prereq" : "coreq";
    const o = input.offering;
    const { governor } = effectiveTree(field, o, field === "prereq" ? input.docPrereqTree : input.docCoreqTree);
    const apiTree = field === "prereq" ? (o?.apiPrereqTree ?? null) : (o?.apiCoreqTree ?? null);
    const apiText = field === "prereq" ? (o?.apiPrereqText ?? "") : renderRegistroExpr(apiTree);
    let newMatchesApi: boolean | null = null;
    if (governor === "api") {
      const text = ch.after == null ? "" : String(ch.after);
      const newTree = field === "prereq" ? parseRequirement(text) : parseCoreq(text);
      newMatchesApi = compareTrees(apiTree, newTree).relation !== "different";
    }
    out.push({ field: ch.field, governor, apiText, newMatchesApi });
  }
  return out;
}

/** code -> courses (display codes) whose official API prereq/coreq expression lists it */
export function apiMentions(items: UnresolvedItem[], inputs: CourseInput[]): Record<string, string[]> {
  const wanted = new Set(items.filter((i) => i.kind === "ref-missing" && i.code).map((i) => i.code!));
  const out: Record<string, Set<string>> = {};
  for (const inp of inputs) {
    const o = inp.offering;
    if (!o) continue;
    const codes = new Set<string>();
    collectCourseCodes(o.apiPrereqTree, codes);
    collectCourseCodes(o.apiCoreqTree, codes);
    for (const c of codes) {
      if (wanted.has(c)) (out[`ref-missing:${c}`] ??= new Set()).add(inp.displayCode);
    }
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v].sort()]));
}
