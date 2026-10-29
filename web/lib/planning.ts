// Future planning: what the student can take NOW and what they will be able
// to take NEXT semester, given what they approved (A) and what is in the
// cart for the semester being planned (C). One evaluator for checkout step 0,
// the market, "Qué se me habilita" and the elective slots — so the word
// "habilitar" means one thing everywhere (agreed with the coordinator,
// 2026-10-29):
//
//   now     every prerequisite is in A; every corequisite is in A ∪ C
//   next    not now, and every prerequisite AND corequisite is in A ∪ C
//   blocked otherwise
//
// "Corequisite" here = an in-plan corequisite course, or a prerequisite that
// Registro marks with "*" (may be taken the same term, e.g. MATE 2210* for
// Elementos de Sistemas Eléctricos). Requirements are boolean trees (AND/OR),
// not plain subsets. Credit rules — admin gates and the "excluye semestres
// 1–n" restriction turned into `minCredits` — use credits(A) for now and
// credits(A ∪ C) for next. Pure: no I/O.

import type { CatalogRules, Course } from "./types";
import { creditPending, evaluateGates, missingCodes, satisfied } from "./availability";
import { collectCourseCodes } from "./import/requirementParser";

export type PlanState = "approved" | "inCart" | "now" | "next" | "blocked";

export interface PlanContext {
  approved: Set<string>;
  cart: Set<string>;
  courses: Course[];
  catalogCodes: Set<string>;
  rules?: CatalogRules;
  attestationsMet?: Set<string>;
}

export function creditsOf(ids: Set<string>, courses: Course[]): number {
  let n = 0;
  for (const c of courses) if (ids.has(c.id)) n += c.credits;
  return n;
}

export interface RequirementCheck {
  ok: boolean;
  /** in-plan prerequisite codes still missing (must be approved) */
  missing: string[];
  /** in-plan corequisites (or "*" prerequisites) not in hand nor in the cart */
  coMissing: string[];
  /** credits still short of `course.minCredits`, if any */
  creditsShort: number;
  /** unmet admin gates */
  gateReasons: string[];
}

/** Requirements of `course` against `have` (counts as approved), `together`
 * (may be taken the same term) and `credits` (approved credits). */
export function checkRequirements(
  course: Course,
  have: Set<string>,
  together: Set<string>,
  credits: number,
  ctx: Pick<PlanContext, "courses" | "catalogCodes" | "rules" | "attestationsMet">
): RequirementCheck {
  const concurrentOk = (code: string) => together.has(code);
  const prereqOk = satisfied(course.prereqTree, have, ctx.catalogCodes, concurrentOk);
  const missing = prereqOk ? [] : [...missingCodes(course.prereqTree, have, ctx.catalogCodes, concurrentOk)];
  const coMissing = course.coreqCourseIds.filter((id) => !together.has(id));
  let creditsShort = typeof course.minCredits === "number" ? Math.max(0, course.minCredits - credits) : 0;
  // an admin's optional credit threshold on a slot type ("Desbloqueo por créditos")
  if (creditsShort === 0 && creditPending(course, { rules: ctx.rules, approvedCredits: credits })) creditsShort = 1;
  const gateReasons = ctx.rules
    ? evaluateGates(course, have, ctx.courses, { rules: ctx.rules, attestationsMet: ctx.attestationsMet, approvedCredits: credits })
    : [];
  return {
    ok: prereqOk && coMissing.length === 0 && creditsShort === 0 && gateReasons.length === 0,
    missing,
    coMissing,
    creditsShort,
    gateReasons,
  };
}

/** Builds the per-context sets once; `state()` is then cheap per course. */
export function planner(ctx: PlanContext) {
  const both = new Set([...ctx.approved, ...ctx.cart]);
  const creditsA = creditsOf(ctx.approved, ctx.courses);
  const creditsAC = creditsA + creditsOf(ctx.cart, ctx.courses);

  const now = (c: Course) => checkRequirements(c, ctx.approved, both, creditsA, ctx);
  const next = (c: Course) => checkRequirements(c, both, both, creditsAC, ctx);

  function state(c: Course): PlanState {
    if (ctx.approved.has(c.id)) return "approved";
    if (ctx.cart.has(c.id)) return "inCart";
    if (now(c).ok) return "now";
    if (next(c).ok) return "next";
    return "blocked";
  }

  /** Same evaluation ignoring the course's own cart membership — for the
   * colour of a course already in the cart, and the cart warning. */
  function stateIgnoringCart(c: Course): "approved" | "now" | "next" | "blocked" {
    if (ctx.approved.has(c.id)) return "approved";
    if (now(c).ok) return "now";
    if (next(c).ok) return "next";
    return "blocked";
  }

  return { state, stateIgnoringCart, now, next, creditsA, creditsAC };
}

export interface EnabledBy {
  /** cart courses in the requirement expression */
  fromCart: Course[];
  /** approved courses in the requirement expression */
  fromApproved: Course[];
}

/** The courses that enable `course`: those of its requirement expression
 * (prerequisites, "*" prerequisites, in-plan corequisites) that are in the
 * cart, plus the approved ones that complete it. */
export function enabledBy(course: Course, ctx: PlanContext): EnabledBy {
  const byCode = new Map(ctx.courses.map((c) => [c.codeNormalized, c]));
  const byId = new Map(ctx.courses.map((c) => [c.id, c]));
  const refs = new Set<Course>();
  for (const code of collectCourseCodes(course.prereqTree)) {
    const c = byCode.get(code);
    if (c) refs.add(c);
  }
  for (const id of course.coreqCourseIds) {
    const c = byId.get(id);
    if (c) refs.add(c);
  }
  const list = [...refs];
  return {
    fromCart: list.filter((c) => ctx.cart.has(c.id)),
    fromApproved: list.filter((c) => ctx.approved.has(c.id)),
  };
}

export interface StepZero {
  /** available THIS semester only because of a corequisite in the cart */
  sameSemester: { course: Course; by: EnabledBy }[];
  /** available NEXT semester: requirements met by approved + cart */
  nextSemester: { course: Course; by: EnabledBy }[];
}

/** Checkout step 0. Slots and requirement nodes are left out (they have no
 * requirements of their own; elective slots have their own rule). */
export function stepZero(ctx: PlanContext): StepZero {
  const withCart = planner(ctx);
  const empty = planner({ ...ctx, cart: new Set() });
  const out: StepZero = { sameSemester: [], nextSemester: [] };
  for (const c of ctx.courses) {
    if (c.isPlaceholder || ctx.approved.has(c.id) || ctx.cart.has(c.id)) continue;
    const s = withCart.state(c);
    if (s === "now" && empty.state(c) !== "now") out.sameSemester.push({ course: c, by: enabledBy(c, ctx) });
    else if (s === "next") out.nextSemester.push({ course: c, by: enabledBy(c, ctx) });
  }
  return out;
}

/** What adding `course` to the cart would open, compared with the cart alone
 * ("Qué se me habilita"): this same semester (by corequisite) and next. */
export function wouldEnable(course: Course, ctx: PlanContext): StepZero {
  if (ctx.approved.has(course.id) || ctx.cart.has(course.id)) {
    // already counted: what it enables is what the current plan enables through it
    const base = { ...ctx, cart: new Set([...ctx.cart].filter((id) => id !== course.id)), approved: new Set([...ctx.approved].filter((id) => id !== course.id)) };
    return wouldEnable(course, base);
  }
  const before = planner(ctx);
  const withIt: PlanContext = { ...ctx, cart: new Set([...ctx.cart, course.id]) };
  const after = planner(withIt);
  const out: StepZero = { sameSemester: [], nextSemester: [] };
  for (const c of ctx.courses) {
    if (c.isPlaceholder || c.id === course.id || ctx.approved.has(c.id) || ctx.cart.has(c.id)) continue;
    const was = before.state(c);
    const is = after.state(c);
    if (is === was) continue;
    if (is === "now") out.sameSemester.push({ course: c, by: enabledBy(c, withIt) });
    else if (is === "next" && was === "blocked") out.nextSemester.push({ course: c, by: enabledBy(c, withIt) });
  }
  return out;
}
