import test from "node:test";
import assert from "node:assert/strict";
import { parseRequirement } from "../../import/requirementParser";
import { treeToModel } from "../model";
import { BatchError, planBatch, planNodes, type PlanRow } from "../plan";
import { orderVersion, rowVersion } from "../version";
import { findPrereqCycle } from "../validate";

let n = 0;
function row(code: string | null, semester: number, sortIndex: number, p: Partial<PlanRow> = {}): PlanRow {
  return {
    id: ++n, code, semester, sortIndex, prereqText: null, coreqText: null,
    prereqTree: null, coreqTree: null, lockedFields: [], ...p,
  };
}
const model = (s: string) => treeToModel(parseRequirement(s));
const order = (rows: PlanRow[]) => [...rows].sort((a, b) => a.sortIndex - b.sortIndex).map((r) => r.code);
function plan() {
  // sem1: A B   sem2: C D   sem3: E
  return [row("AAAA1001", 1, 0), row("BBBB1002", 1, 1), row("CCCC1003", 2, 2), row("DDDD1004", 2, 3), row("EEEE1005", 3, 4)];
}

test("move within a semester reorders only the affected rows", () => {
  const rows = plan();
  const r = planBatch(rows, [{ op: "move", courseId: rows[1].id, semester: 1, position: 0 }]);
  assert.deepEqual(order(r.rows), ["BBBB1002", "AAAA1001", "CCCC1003", "DDDD1004", "EEEE1005"]);
  assert.deepEqual([...r.changed.keys()].sort(), [rows[0].id, rows[1].id].sort());
  assert.deepEqual(r.changed.get(rows[1].id), []); // order only -> nothing to pin
});

test("move across semesters pins suggestedSemester, keeps the sortIndex set, no collisions", () => {
  const rows = plan();
  const r = planBatch(rows, [{ op: "move", courseId: rows[0].id, semester: 2, position: 1 }]);
  assert.equal(r.rows.find((x) => x.id === rows[0].id)!.semester, 2);
  assert.deepEqual(order(r.rows), ["BBBB1002", "CCCC1003", "AAAA1001", "DDDD1004", "EEEE1005"]);
  assert.deepEqual(r.rows.map((x) => x.sortIndex).sort(), [0, 1, 2, 3, 4]);
  assert.deepEqual(r.changed.get(rows[0].id), ["suggestedSemester"]);
});

test("move to an empty semester lands before the first later semester; position is clamped", () => {
  const rows = plan();
  const r = planBatch(rows, [{ op: "move", courseId: rows[0].id, semester: 5, position: 0 }]);
  assert.deepEqual(order(r.rows).at(-1), "AAAA1001");
  const r2 = planBatch(rows, [{ op: "move", courseId: rows[4].id, semester: 1, position: 99 }]);
  assert.deepEqual(order(r2.rows), ["AAAA1001", "BBBB1002", "EEEE1005", "CCCC1003", "DDDD1004"]);
  const gap = plan();
  const r3 = planBatch(gap, [{ op: "move", courseId: gap[0].id, semester: 3, position: 5 }]);
  assert.equal(order(r3.rows).indexOf("AAAA1001"), 4);
});

test("a no-op move is rejected as an empty batch result (nothing changed)", () => {
  const rows = plan();
  const r = planBatch(rows, [{ op: "move", courseId: rows[0].id, semester: 1, position: 0 }]);
  assert.equal(r.changed.size, 0);
});

test("bad ops throw BatchError", () => {
  const rows = plan();
  const bad = (f: () => unknown) => assert.throws(f, BatchError);
  bad(() => planBatch(rows, []));
  bad(() => planBatch(rows, [{ op: "move", courseId: 99999, semester: 1, position: 0 }]));
  bad(() => planBatch(rows, [{ op: "move", courseId: rows[0].id, semester: 0, position: 0 }]));
  bad(() => planBatch(rows, [{ op: "move", courseId: rows[0].id, semester: 1, position: -1 }]));
  bad(() => planBatch(rows, [{ op: "setRequirement", courseId: rows[0].id, kind: "prereq", model: { groups: [{ alts: [{ kind: "leaf", code: "bad code", soft: false }] }] } }]));
});

test("setRequirement writes text + tree together and pins the field; coreq works too", () => {
  const rows = plan();
  const r = planBatch(rows, [
    { op: "setRequirement", courseId: rows[2].id, kind: "prereq", model: model("AAAA 1001 Y (BBBB 1002 O DDDD 1004)") },
    { op: "setRequirement", courseId: rows[2].id, kind: "coreq", model: model("CCCC 1003L") },
  ]);
  const c = r.rows.find((x) => x.id === rows[2].id)!;
  assert.equal(c.prereqText, "AAAA 1001 Y (BBBB 1002 O DDDD 1004)");
  assert.equal(c.prereqTree?.op, "AND");
  assert.equal(c.coreqText, "CCCC 1003L");
  assert.deepEqual(r.changed.get(rows[2].id)!.sort(), ["coreqText", "prereqText"]);
});

test("setRequirement to the same meaning is a no-op; emptying clears text and tree", () => {
  const tree = parseRequirement("AAAA 1001 Y BBBB 1002");
  const rows = [row("AAAA1001", 1, 0), row("CCCC1003", 2, 1, { prereqText: "BBBB 1002 Y AAAA 1001", prereqTree: tree })];
  const same = planBatch(rows, [{ op: "setRequirement", courseId: rows[1].id, kind: "prereq", model: model("AAAA 1001 Y BBBB 1002") }]);
  assert.equal(same.changed.size, 0);
  const cleared = planBatch(rows, [{ op: "setRequirement", courseId: rows[1].id, kind: "prereq", model: { groups: [] } }]);
  const c = cleared.rows[1];
  assert.equal(c.prereqText, null);
  assert.equal(c.prereqTree, null);
});

test("planBatch never mutates its input", () => {
  const rows = plan();
  const snap = JSON.stringify(rows);
  planBatch(rows, [{ op: "move", courseId: rows[0].id, semester: 3, position: 0 }]);
  assert.equal(JSON.stringify(rows), snap);
});

test("versions: change on any editable field, ignore lockedFields order", () => {
  const a = row("AAAA1001", 1, 0, { lockedFields: ["x", "y"] });
  assert.equal(rowVersion(a), rowVersion({ ...a, lockedFields: ["y", "x"] }));
  assert.notEqual(rowVersion(a), rowVersion({ ...a, semester: 2 }));
  assert.notEqual(rowVersion(a), rowVersion({ ...a, prereqText: "X" }));
  const rows = plan();
  assert.notEqual(orderVersion(rows), orderVersion(rows.map((r, i) => (i ? r : { ...r, semester: 9 }))));
});

test("planNodes: placeholders excluded; edge from tree; cycle detectable", () => {
  const rows = [
    row("AAAA1001", 1, 0, { prereqTree: parseRequirement("BBBB 1002") }),
    row("BBBB1002", 2, 1, { prereqTree: parseRequirement("AAAA 1001") }),
    row(null, 2, 2),
  ];
  const nodes = planNodes(rows);
  assert.equal(nodes.length, 2);
  assert.ok(findPrereqCycle(nodes));
});
