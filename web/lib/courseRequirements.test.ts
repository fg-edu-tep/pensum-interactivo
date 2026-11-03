import test from "node:test";
import assert from "node:assert/strict";
import { findPathBack, normalizeRequirementInput, parseRequirementInput } from "./courseRequirements";

test("cycle: MATE 1203 requiring MATE 1214, which requires MATE 1203, is found with its path", () => {
  const g = new Map([["MATE1214", ["MATE1203"]], ["MATE1201", []]]);
  assert.deepEqual(findPathBack(g, "MATE1203", ["MATE1201", "MATE1214"]), ["MATE1203", "MATE1214", "MATE1203"]);
});

test("cycle: found through intermediate courses; none when the chain never comes back", () => {
  const g = new Map([["B", ["C"]], ["C", ["D"]], ["D", ["A"]], ["X", ["Y"]]]);
  assert.deepEqual(findPathBack(g, "A", ["X", "B"]), ["A", "B", "C", "D", "A"]);
  assert.equal(findPathBack(g, "A", ["X"]), null);
});

test("input is normalized: lowercase, AND/OR, spacing", () => {
  assert.equal(normalizeRequirementInput("  iele 1010 and (mate 1203   or mate 1214*) "), "IELE 1010 Y (MATE 1203 O MATE 1214*)");
});

test("lowercase y / o are read as connectors", () => {
  const p = parseRequirementInput("prereq", "iele 1010 y (mate 1203 o mate 1214)");
  assert.equal(p.error, undefined);
  assert.equal(p.interpreted, "IELE 1010 Y (MATE 1203 O MATE 1214)");
});

test("empty = no requirement", () => {
  const p = parseRequirementInput("prereq", "   ");
  assert.deepEqual([p.text, p.tree, p.error], ["", null, undefined]);
});

test("a code the parser drops is an error, not a silent partial save", () => {
  const p = parseRequirementInput("prereq", "IELE 1010 IELE 2010");
  assert.ok(p.error);
  assert.match(p.error!, /IELE2010/);
});

test("unparseable text is an error", () => {
  assert.ok(parseRequirementInput("prereq", "aprobar cálculo").error);
});

test("corequisites accept Registro's hyphenated lab codes", () => {
  const p = parseRequirementInput("coreq", "IELE-1118L");
  assert.equal(p.error, undefined);
  assert.equal(p.interpreted, "IELE 1118L");
});

test("the * (may be taken at the same time) survives", () => {
  assert.equal(parseRequirementInput("prereq", "FISI 1018*").interpreted, "FISI 1018*");
});
