import test from "node:test";
import assert from "node:assert/strict";
import { findPrereqCycle, hasErrors, validatePlan, wouldCreateCycle, type PlanNode } from "../validate";

const n = (code: string, semester: number, prereqs: string[] = [], coreqs: string[] = []): PlanNode => ({
  code, semester, prereqs, coreqs,
});

test("no cycle in a chain / diamond", () => {
  assert.equal(findPrereqCycle([n("A", 1), n("B", 2, ["A"]), n("C", 3, ["B"])]), null);
  assert.equal(findPrereqCycle([n("A", 1), n("B", 2, ["A"]), n("C", 2, ["A"]), n("D", 3, ["B", "C"])]), null);
});

test("finds 2-cycle and long cycle with a closed path", () => {
  assert.deepEqual(findPrereqCycle([n("A", 1, ["B"]), n("B", 2, ["A"])]), ["A", "B", "A"]);
  const c = findPrereqCycle([n("X", 1), n("A", 1, ["B"]), n("B", 2, ["C"]), n("C", 3, ["A"])])!;
  assert.equal(c[0], c[c.length - 1]);
  assert.equal(c.length, 4);
});

test("external codes are not nodes and never cycle", () => {
  assert.equal(findPrereqCycle([n("A", 1, ["EXT1"])]), null);
});

test("wouldCreateCycle", () => {
  const plan = [n("A", 1), n("B", 2, ["A"]), n("C", 3, ["B"])];
  assert.ok(wouldCreateCycle(plan, "A", "C"));
  assert.equal(wouldCreateCycle(plan, "C", "A"), null);
  assert.deepEqual(wouldCreateCycle(plan, "A", "A"), ["A", "A"]);
  assert.equal(plan[0].prereqs.length, 0, "input untouched");
});

test("validatePlan: errors vs warnings", () => {
  const plan = [n("A", 1, ["A"]), n("B", 0, ["ZZZ"]), n("C", 1, ["D"]), n("D", 3)];
  const issues = validatePlan(plan, { dictionary: new Set(["OK"]) });
  const kinds = issues.map((i) => i.kind).sort();
  assert.deepEqual(kinds, ["bad-semester", "prereq-after-dependent", "self-reference", "unknown-code"]);
  assert.ok(hasErrors(issues));
  assert.equal(issues.find((i) => i.kind === "unknown-code")!.severity, "warning");
});

test("validatePlan: self-reference alone is not also reported as a cycle", () => {
  const issues = validatePlan([n("A", 1, ["A"])]);
  assert.deepEqual(issues.map((i) => i.kind), ["self-reference"]);
});

test("validatePlan: coreq cycles are allowed, coreq self-reference is not", () => {
  assert.equal(hasErrors(validatePlan([n("A", 1, [], ["B"]), n("B", 1, [], ["A"])])), false);
  assert.ok(hasErrors(validatePlan([n("A", 1, [], ["A"])])));
});

test("validatePlan: unknown only warned when a dictionary exists; sort collisions error", () => {
  assert.equal(validatePlan([n("A", 1, ["Q"])]).length, 0);
  const i = validatePlan([n("A", 1)], { sortIndexes: [0, 1, 1] });
  assert.deepEqual(i.map((x) => x.kind), ["sort-collision"]);
});

import { isKnownCode } from "../validate";
test("isKnownCode: plan, dictionary, exam tokens and lab companions are known; strangers are not", () => {
  const plan = new Set(["FISI1518"]);
  const dict = new Set(["MATE1203"]);
  assert.ok(isKnownCode("FISI1518", plan, dict));
  assert.ok(isKnownCode("MATE1203", plan, dict));
  assert.ok(isKnownCode("ENGL7", plan, dict), "exam token");
  assert.ok(isKnownCode("FISI1518P", plan, dict), "companion of a plan course");
  assert.ok(isKnownCode("MATE1203L", plan, dict), "companion of a dictionary course");
  assert.equal(isKnownCode("ZZZZ9999", plan, dict), false);
  assert.equal(isKnownCode("ZZZZ9999L", plan, dict), false, "companion of an unknown base");
  assert.ok(isKnownCode("ZZZZ9999", plan, null), "no dictionary = nothing to check");
});
