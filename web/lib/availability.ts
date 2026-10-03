import type {
  AvailabilityStatus,
  CatalogRules,
  Course,
  ReqNode,
  UnlockRelation,
} from "./types";
import { collectCourseCodes } from "./import/requirementParser";

// Appendix A of the product doc, adapted to the AND/OR/COURSE tree shape
// produced by the build-time requirement parser.

// Requirements that reference a code outside this catalog (a language exam,
// a placement equivalency, another department's course we don't have data
// for) can never be marked approved through this app. An AND branch made
// entirely of such codes is treated as vacuously satisfied (informational
// only, shown as text, never blocking). An OR branch is treated the same
// way ONLY when every alternative is external - if at least one in-catalog
// alternative exists, an external alternative must not let the OR
// "shortcut" to satisfied, or every course with an out-of-catalog variant
// would show as trivially available.
function hasCatalogLeaf(node: ReqNode, catalogCodes: Set<string>): boolean {
  if (node.op === "COURSE") return catalogCodes.has(node.code!);
  return (node.items ?? []).some((it) => hasCatalogLeaf(it, catalogCodes));
}

/** Registro marks a prerequisite with a trailing `*` ("soft") when it may be
 * taken the SAME term. `concurrentOk(code)` says whether that co-enrolment is
 * actually possible right now (the course's own prerequisites are met); when
 * omitted, soft codes are treated like hard ones. */
export type ConcurrentOk = (code: string) => boolean;

export function satisfied(
  node: ReqNode | null,
  approved: Set<string>,
  catalogCodes: Set<string>,
  concurrentOk?: ConcurrentOk
): boolean {
  if (!node) return true;
  if (node.op === "COURSE") {
    if (!catalogCodes.has(node.code!)) return true; // out-of-catalog: informational only
    if (approved.has(node.code!)) return true;
    return !!node.soft && !!concurrentOk?.(node.code!);
  }
  const items = node.items ?? [];
  if (node.op === "AND") return items.every((it) => satisfied(it, approved, catalogCodes, concurrentOk));
  // OR: ignore alternatives with no in-catalog leaf at all, unless none of
  // them have one (fully external OR, vacuously satisfied).
  const relevant = items.filter((it) => hasCatalogLeaf(it, catalogCodes));
  if (relevant.length === 0) return true;
  return relevant.some((it) => satisfied(it, approved, catalogCodes, concurrentOk));
}

/** Minimal (best-effort) set of in-catalog course codes that would need to
 * be approved to satisfy this node. For OR nodes, picks the branch with the
 * fewest missing courses rather than solving globally-optimal set cover. */
export function missingCodes(
  node: ReqNode | null,
  approved: Set<string>,
  catalogCodes: Set<string>,
  concurrentOk?: ConcurrentOk
): Set<string> {
  if (!node) return new Set();
  if (node.op === "COURSE") {
    if (!catalogCodes.has(node.code!)) return new Set();
    if (approved.has(node.code!)) return new Set();
    if (node.soft && concurrentOk?.(node.code!)) return new Set();
    return new Set([node.code!]);
  }
  const items = node.items ?? [];
  if (node.op === "AND") {
    const out = new Set<string>();
    for (const item of items) {
      if (satisfied(item, approved, catalogCodes, concurrentOk)) continue;
      for (const c of missingCodes(item, approved, catalogCodes, concurrentOk)) out.add(c);
    }
    return out;
  }
  // OR
  const relevant = items.filter((it) => hasCatalogLeaf(it, catalogCodes));
  if (relevant.length === 0) return new Set();
  if (relevant.some((it) => satisfied(it, approved, catalogCodes, concurrentOk))) return new Set();
  let best: Set<string> | null = null;
  for (const item of relevant) {
    const m = missingCodes(item, approved, catalogCodes, concurrentOk);
    if (!best || m.size < best.size) best = m;
  }
  return best ?? new Set();
}

/** Relationship of a *selected* course to a course it helps unlock — see
 *  `UnlockRelation` in ./types. "sole" when approving only the selected course
 *  clears the dependent's prerequisites; "among" for a partial contribution. */
export function unlockRelation(
  dependent: Course,
  selectedCode: string,
  catalogCodes: Set<string>
): UnlockRelation {
  if (!dependent.prereqTree) return null;
  const codes = collectCourseCodes(dependent.prereqTree);
  if (!codes.has(selectedCode)) return null;
  // Would approving *only* the selected course clear the dependent's prereqs?
  if (satisfied(dependent.prereqTree, new Set([selectedCode]), catalogCodes)) {
    return "sole";
  }
  // Otherwise it's a genuine partial contribution.
  const stillMissing = missingCodes(
    dependent.prereqTree,
    new Set([selectedCode]),
    catalogCodes
  );
  return stillMissing.size === 0 ? "sole" : "among";
}

export interface CourseAvailability {
  status: AvailabilityStatus;
  missing: string[]; // PREREQUISITE codes still needed (must be approved first)
  /** in-catalog COREQUISITES that aren't approved and can't be taken this term
   * either (their own prereqs are unmet) — they hold this course back too */
  coreqBlockers: string[];
  /** human labels of unmet admin progression rules — non-empty ⇒ course is
   * locked regardless of prereq status */
  gateReasons: string[];
}

export function catalogCodesOf(courses: Course[]): Set<string> {
  return new Set(courses.map((c) => c.codeNormalized));
}

export interface RuleContext {
  rules?: CatalogRules;
  attestationsMet?: Set<string>;
  /** total approved credits (creditsSummary().done) — for minCredits gates */
  approvedCredits?: number;
}

function safeRegex(src: string): RegExp | null {
  try {
    return new RegExp(src);
  } catch {
    return null;
  }
}

function courseMatches(
  course: Course,
  sel: { codeRegex?: string; semesters?: number[]; ids?: string[] }
): boolean {
  if (sel.ids?.includes(course.id)) return true;
  if (sel.semesters?.includes(course.semester)) return true;
  if (sel.codeRegex) {
    const re = safeRegex(sel.codeRegex);
    if (re && re.test(course.codeNormalized)) return true;
  }
  return false;
}

/** Unmet admin-rule labels for a course. Empty ⇒ not locked by rules. */
export function evaluateGates(
  course: Course,
  approved: Set<string>,
  allCourses: Course[],
  ctx: RuleContext
): string[] {
  const rules = ctx.rules;
  if (!rules || course.isPlaceholder) return [];
  const met = ctx.attestationsMet ?? new Set<string>();
  const reasons: string[] = [];

  // attestation auto-gates: any prereq code matching the regex locks the course
  for (const att of rules.attestations ?? []) {
    if (!att.autoGatePrereqRegex || met.has(att.id)) continue;
    const re = safeRegex(att.autoGatePrereqRegex);
    if (!re) continue;
    const codes = collectCourseCodes(course.prereqTree);
    if ([...codes].some((c) => re.test(c))) reasons.push(att.label);
  }

  // explicit gate rules
  for (const gate of rules.gates ?? []) {
    if (!courseMatches(course, gate.appliesTo)) continue;
    const c = gate.condition;
    let unmet = false;

    if (c.allApprovedMatching) {
      const re = safeRegex(c.allApprovedMatching);
      if (re) {
        const targets = allCourses.filter(
          (x) => !x.isPlaceholder && re.test(x.codeNormalized)
        );
        if (targets.some((x) => !approved.has(x.id))) unmet = true;
      }
    }
    if (!unmet && typeof c.maxApprovedSemester === "number") {
      const targets = allCourses.filter(
        (x) => !x.isPlaceholder && x.semester <= c.maxApprovedSemester!
      );
      if (targets.some((x) => !approved.has(x.id))) unmet = true;
    }
    if (!unmet && typeof c.minCredits === "number") {
      if ((ctx.approvedCredits ?? 0) < c.minCredits) unmet = true;
    }
    if (!unmet && c.attestationId) {
      if (!met.has(c.attestationId)) unmet = true;
    }

    if (unmet) reasons.push(gate.label);
  }

  return reasons;
}

/**
 * Prerequisites must be *approved* before a course can be taken. Corequisites
 * only need to be taken the same term (or earlier) — so an un-approved coreq
 * blocks a course ONLY when the coreq itself can't be taken this term.
 */
export function courseAvailability(
  course: Course,
  approved: Set<string>,
  catalogCodes: Set<string>,
  allCourses?: Course[],
  ruleCtx?: RuleContext
): CourseAvailability {
  if (approved.has(course.id)) {
    return { status: "approved", missing: [], coreqBlockers: [], gateReasons: [] };
  }

  // admin progression rules lock a course outright, regardless of prereqs
  const gateReasons =
    allCourses && ruleCtx?.rules
      ? evaluateGates(course, approved, allCourses, ruleCtx)
      : [];
  if (gateReasons.length > 0) {
    return { status: "blocked", missing: [], coreqBlockers: [], gateReasons };
  }

  // A soft ("*") prerequisite can be co-enrolled, but only if that course is
  // itself takeable this term (its own hard prerequisites met).
  const byCode = allCourses ? new Map(allCourses.map((c) => [c.codeNormalized, c])) : null;
  const concurrentOk: ConcurrentOk | undefined = byCode
    ? (code) => {
        const co = byCode.get(code);
        return !!co && co.id !== course.id && satisfied(co.prereqTree, approved, catalogCodes);
      }
    : undefined;

  const prereqOk = satisfied(course.prereqTree, approved, catalogCodes, concurrentOk);
  const missing = prereqOk
    ? []
    : [...missingCodes(course.prereqTree, approved, catalogCodes, concurrentOk)];

  // A coreq is fine if it's already approved, or if it could be co-enrolled
  // this term (its own prerequisites are met).
  const coreqBlockers: string[] = [];
  if (allCourses && course.coreqCourseIds.length > 0) {
    const byId = new Map(allCourses.map((c) => [c.id, c]));
    for (const coId of course.coreqCourseIds) {
      const co = byId.get(coId);
      if (!co) continue;
      if (approved.has(co.id)) continue;
      if (satisfied(co.prereqTree, approved, catalogCodes)) continue;
      coreqBlockers.push(co.codeNormalized);
    }
  }

  if (prereqOk && coreqBlockers.length === 0) {
    return { status: "available", missing: [], coreqBlockers: [], gateReasons: [] };
  }

  const blockCount = missing.length + coreqBlockers.length;
  return {
    status: blockCount <= 1 ? "one-away" : "blocked",
    missing,
    coreqBlockers,
    gateReasons: [],
  };
}

export function creditsSummary(courses: Course[], approved: Set<string>) {
  const total = courses.reduce((sum, c) => sum + c.credits, 0);
  const done = courses
    .filter((c) => approved.has(c.id))
    .reduce((sum, c) => sum + c.credits, 0);
  return { done, total };
}

/** Longest remaining prerequisite chain among not-yet-approved courses,
 * counted in number of courses (a rough "min semesters left" proxy). */
export function criticalPathLength(
  courses: Course[],
  approved: Set<string>
): number {
  const byId = new Map(courses.map((c) => [c.id, c]));
  const memo = new Map<string, number>();
  const visiting = new Set<string>();

  function longest(id: string): number {
    if (approved.has(id)) return 0;
    if (memo.has(id)) return memo.get(id)!;
    if (visiting.has(id)) return 0; // guard against accidental cycles
    visiting.add(id);
    const course = byId.get(id);
    const deps = course?.prereqCourseIds ?? [];
    let best = 0;
    for (const dep of deps) {
      if (!byId.has(dep)) continue;
      best = Math.max(best, longest(dep));
    }
    const result = 1 + best;
    visiting.delete(id);
    memo.set(id, result);
    return result;
  }

  let max = 0;
  for (const c of courses) {
    if (c.isPlaceholder) continue;
    max = Math.max(max, longest(c.id));
  }
  return max;
}

/** All courses whose prerequisite/corequisite chain includes `id`
 * (transitive downstream impact set). */
export function downstreamOf(courses: Course[], id: string): Set<string> {
  const dependents = new Map<string, string[]>();
  for (const c of courses) {
    for (const dep of c.prereqCourseIds) {
      if (!dependents.has(dep)) dependents.set(dep, []);
      dependents.get(dep)!.push(c.id);
    }
  }
  const out = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const next of dependents.get(cur) ?? []) {
      if (!out.has(next)) {
        out.add(next);
        stack.push(next);
      }
    }
  }
  return out;
}

/** All transitive prerequisites of `id` (upstream chain, all hops). */
export function upstreamOf(courses: Course[], id: string): Set<string> {
  const byId = new Map(courses.map((c) => [c.id, c]));
  const out = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    const course = byId.get(cur);
    for (const dep of course?.prereqCourseIds ?? []) {
      if (!out.has(dep)) {
        out.add(dep);
        stack.push(dep);
      }
    }
  }
  return out;
}
