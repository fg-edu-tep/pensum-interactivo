import test from "node:test";
import assert from "node:assert/strict";
import type { Course } from "./types";
import { boxCredits, boxHalves, electiveBoxIds, migrateAssignments, ownerOf, placeHalves, type Assignments } from "./electiveBoxes";

const box = (id: string, semester: number) =>
  ({ id, code: "IELE ELECTIVA", codeNormalized: id, name: "ELECTIVA IELE", credits: 2, semester, type: "electiva", isPlaceholder: true, placeholderKind: "ELECTIVA", prereqText: "", coreqText: "", prereqTree: null, prereqCourseIds: [], prereqExternal: [], coreqTree: null, coreqCourseIds: [], coreqExternal: [] }) as Course;
// B1, B2 in semester 7; B3, B4 in semester 8 (listed out of order on purpose)
const courses = [box("B3", 8), box("B1", 7), box("B4", 8), box("B2", 7)];
const ids = electiveBoxIds(courses);

function assign(as: Assignments, anchor: string, title: string, credits: number): Assignments {
  const { halves, overflow } = placeHalves(ids, as, anchor, credits);
  return { ...as, [anchor]: { code: null, title, credits, halves, overflow } };
}
const view = (as: Assignments) =>
  ids.map((b) => boxHalves(ids, as).get(b)!.map((h) => (h ? `${h.title}${h.cont ? "+" : ""}` : "-")).join("/"));

test("boxes are in pensum order", () => assert.deepEqual(ids, ["B1", "B2", "B3", "B4"]));

test("2 + 2 + 2 + 2", () => {
  let as: Assignments = {};
  for (const [b, t] of [["B1", "A"], ["B2", "B"], ["B3", "C"], ["B4", "D"]]) as = assign(as, b, t, 2);
  assert.deepEqual(view(as), ["A/A+", "B/B+", "C/C+", "D/D+"]);
});

test("4 + 4", () => {
  let as = assign({}, "B1", "A", 4);
  as = assign(as, "B3", "B", 4);
  assert.deepEqual(view(as), ["A/A+", "A+/A+", "B/B+", "B+/B+"]);
});

test("3 + 3 + 2 (a box shared by two courses)", () => {
  let as = assign({}, "B1", "A", 3);
  as = assign(as, "B2", "B", 3);
  as = assign(as, "B4", "C", 2);
  assert.deepEqual(view(as), ["A/A+", "A+/B", "B+/B+", "C/C+"]);
});

test("4 + 3 leaves one half empty: 7 of 8", () => {
  let as = assign({}, "B1", "A", 4);
  as = assign(as, "B3", "B", 3);
  assert.deepEqual(view(as), ["A/A+", "A+/A+", "B/B+", "B+/-"]);
  const cr = boxCredits(ids, as);
  assert.equal(ids.reduce((s, b) => s + cr.get(b)!, 0), 7);
});

test("overflow: fewer free halves than credits", () => {
  let as = assign({}, "B1", "A", 4);
  as = assign(as, "B3", "B", 4);
  const { halves, overflow } = placeHalves(ids, as, "B4", 3);
  assert.deepEqual([halves.length, overflow], [0, 3]);
});

test("removing a course doesn't move the others (no reflow)", () => {
  let as = assign({}, "B1", "A", 3);
  as = assign(as, "B2", "B", 3);
  const { B1: _drop, ...rest } = as;
  void _drop;
  assert.deepEqual(view(rest), ["-/-", "-/B", "B+/B+", "-/-"]);
  assert.equal(ownerOf("B3", rest), "B2");
});

test("older one-box assignments are migrated to halves in box order", () => {
  const legacy: Assignments = { B2: { code: null, title: "X", credits: 4 }, B1: { code: null, title: "Y", credits: 2 } };
  assert.deepEqual(view(migrateAssignments(ids, legacy)), ["Y/Y+", "X/X+", "X+/X+", "-/-"]);
});
