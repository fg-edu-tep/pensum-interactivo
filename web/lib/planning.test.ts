import test from "node:test";
import assert from "node:assert/strict";
import type { Course } from "./types";
import { parseRequirement } from "./import/requirementParser";
import { catalogCodesOf } from "./availability";
import { planner, stepZero, wouldEnable, enabledBy, type PlanContext } from "./planning";

const course = (id: string, prereq = "", p: Partial<Course> = {}): Course => {
  const tree = parseRequirement(prereq);
  return {
    id, code: id, codeNormalized: id, name: id, credits: 3, semester: 1, type: "nucleo", isPlaceholder: false,
    prereqText: prereq, coreqText: "", prereqTree: tree, prereqCourseIds: [], prereqExternal: [],
    coreqTree: null, coreqCourseIds: [], coreqExternal: [], ...p,
  };
};

// the meeting's case: Elementos and TEM take Variable Compleja as a "*" (same-term) prerequisite
const VC = course("MATE2210", "MATE 1207");
const CALC3 = course("MATE1207");
const ELEM = course("IELE2100", "IELE 1002 Y MATE 2210*");
const TEM = course("IELE2002", "IELE 1002 Y MATE 2210*");
const FUND = course("IELE1002");
const SEN = course("IELE2500");
const PROB = course("IIND2106");
const COM = course("IELE2402", "IELE 2500 Y IIND 2106");
const IHM = course("IELE3720", "", { minCredits: 60, minCreditsSemesters: 4 });
const courses = [VC, CALC3, ELEM, TEM, FUND, SEN, PROB, COM, IHM];
const ctx = (approved: string[], cart: string[]): PlanContext => ({
  approved: new Set(approved), cart: new Set(cart), courses, catalogCodes: catalogCodesOf(courses),
});

test("a '*' prerequisite in the cart makes the course available NOW (same semester)", () => {
  const base = ["MATE1207", "IELE1002"];
  assert.equal(planner(ctx(base, [])).state(ELEM), "blocked");
  assert.equal(planner(ctx(base, ["MATE2210"])).state(ELEM), "now");
  const z = stepZero(ctx(base, ["MATE2210"]));
  assert.deepEqual(z.sameSemester.map((x) => x.course.id).sort(), ["IELE2002", "IELE2100"]);
  assert.deepEqual(z.sameSemester[0].by.fromCart.map((c) => c.id), ["MATE2210"]);
});

test("approved + cart completing a requirement makes it available NEXT semester, with who enables it", () => {
  const z = stepZero(ctx(["IELE2500"], ["IIND2106"]));
  assert.deepEqual(z.nextSemester.map((x) => x.course.id), ["IELE2402"]);
  const by = z.nextSemester[0].by;
  assert.deepEqual([by.fromApproved.map((c) => c.id), by.fromCart.map((c) => c.id)], [["IELE2500"], ["IIND2106"]]);
});

test("courses already available with an empty cart are not listed", () => {
  const z = stepZero(ctx(["IELE2500", "IIND2106"], ["IELE1002"]));
  assert.ok(!z.sameSemester.some((x) => x.course.id === "IELE2402"));
  assert.ok(!z.nextSemester.some((x) => x.course.id === "IELE2402"));
});

test("credit requirement: credits(A) for now, credits(A) + credits(C) for next", () => {
  const ids = courses.filter((c) => c.id !== "IELE3720").map((c) => c.id);
  // 8 courses × 3 = 24 approved: blocked
  assert.equal(planner(ctx(ids, [])).state(IHM), "blocked");
  const big = course("BIG", "", { credits: 40 });
  const all = [...courses, big];
  const c2: PlanContext = { approved: new Set(ids), cart: new Set(["BIG"]), courses: all, catalogCodes: catalogCodesOf(all) };
  assert.equal(planner(c2).state(IHM), "next"); // 24 + 40 ≥ 60 only with the cart
  const c3: PlanContext = { ...c2, approved: new Set([...ids, "BIG"]), cart: new Set() };
  assert.equal(planner(c3).state(IHM), "now");
});

test("Qué se me habilita: what adding a course opens, split now / next", () => {
  const w = wouldEnable(VC, ctx(["MATE1207", "IELE1002"], []));
  assert.deepEqual(w.sameSemester.map((x) => x.course.id).sort(), ["IELE2002", "IELE2100"]);
  const w2 = wouldEnable(PROB, ctx(["IELE2500"], []));
  assert.deepEqual(w2.nextSemester.map((x) => x.course.id), ["IELE2402"]);
});

test("enabledBy lists the requirement courses in the cart and among the approved", () => {
  const by = enabledBy(COM, ctx(["IELE2500"], ["IIND2106"]));
  assert.deepEqual([by.fromApproved.length, by.fromCart.length], [1, 1]);
});

// ---- release gate 1 (2026-10-29): cart warnings ----
import { cartWarnings, restrictionFor } from "./planning";

const F2 = course("FISI1528");
const FE = course("IELE2206", "IELE 1002 Y FISI 1528*", { concurrentPrereqIds: ["FISI1528"] });
const OPT = course("IELE3006", "IIND 2106 Y IELE 2009");
const CC = course("IELE2009");
const gateCourses = [FUND, F2, FE, PROB, OPT, CC];
const gctx = (approved: string[], cart: string[]): PlanContext => ({
  approved: new Set(approved), cart: new Set(cart), courses: gateCourses, catalogCodes: catalogCodesOf(gateCourses),
});

test("Optimización without Probabilidad: listed with what it misses", () => {
  const w = cartWarnings(gctx(["IELE2009"], ["IELE3006"]));
  assert.equal(w.length, 1);
  assert.equal(w[0].course.id, "IELE3006");
  assert.deepEqual(w[0].missing.map((c) => c.id), ["IIND2106"]);
});

test("removing a corequisite from the cart flags the course that needed it (§3.3)", () => {
  // Fundamentos de electrónica with Física 2 in the cart: fine
  assert.deepEqual(cartWarnings(gctx(["IELE1002"], ["IELE2206", "FISI1528"])), []);
  // Física 2 taken out: Fundamentos needs it approved OR in the cart
  const w = cartWarnings(gctx(["IELE1002"], ["IELE2206"]));
  assert.equal(w.length, 1);
  assert.deepEqual(w[0].together.map((c) => c.id), ["FISI1528"]);
  assert.deepEqual(w[0].missing, []);
});

test("Registro's program restriction: MAIA courses closed to IELE/IELC, open when they list the program", () => {
  const maia = { programRestriction: "INCLUYE MAEST.INTELIGENCIA ARTIFICIAL", levelRestriction: null };
  assert.ok(restrictionFor(maia, "IELE"));
  assert.equal(restrictionFor({ programRestriction: "INCLUYE INGENIERIA ELECTRONICA & INCLUYE INGENIERIA ELECTRICA" }, "IELC"), null);
  assert.equal(restrictionFor({ levelRestriction: "INCLUYE MAGISTER" }, "IELE"), "posgrado");
  // master's plans aren't judged by the undergraduate rule
  assert.equal(restrictionFor(maia, "MIELE"), null);
  const M = course("MAIA4100", "", maia);
  const p = planner({ approved: new Set(), cart: new Set(), courses: [M], catalogCodes: new Set(["MAIA4100"]), programCode: "IELE" });
  assert.equal(p.state(M), "blocked");
});
