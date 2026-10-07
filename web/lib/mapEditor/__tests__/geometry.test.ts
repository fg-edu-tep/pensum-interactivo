import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GEO, layoutPlan, slotFromPoint, cardX, cardY } from "../geometry";
import { docEdges, mergeApiEdges, type EdgeRow } from "../edges";
import { parseRequirement } from "../../import/requirementParser";
import { treeToModel } from "../model";

const STUDENT = resolve(process.cwd(), "components/explorer/MapCanvas.tsx");

test("parity: constants equal the student canvas constants (read from source)", () => {
  const src = readFileSync(STUDENT, "utf8");
  const read = (name: string) => Number(new RegExp(`const ${name} = (\\d+);`).exec(src)![1]);
  assert.equal(read("COL_PITCH"), GEO.COL_PITCH);
  assert.equal(read("ROW_PITCH"), GEO.ROW_PITCH);
  assert.equal(read("CARD_W"), GEO.CARD_W);
  assert.equal(read("CARD_H"), GEO.CARD_H);
  assert.equal(read("BAND_HEADER_H"), GEO.BAND_HEADER_H);
  assert.equal(read("INSET_X"), GEO.INSET_X);
  assert.equal(read("INSET_TOP"), GEO.INSET_TOP);
});

test("parity: card positions equal the student formula, band height too", () => {
  // student: x = INSET_X + (sem-1)*COL_PITCH; y = INSET_TOP + BAND_HEADER_H + row*ROW_PITCH
  const rows = [
    { id: 1, semester: 1, sortIndex: 0 }, { id: 2, semester: 1, sortIndex: 1 }, { id: 3, semester: 1, sortIndex: 2 },
    { id: 4, semester: 2, sortIndex: 3 }, { id: 5, semester: 4, sortIndex: 5 }, { id: 6, semester: 4, sortIndex: 4 },
  ];
  const l = layoutPlan(rows);
  assert.deepEqual(l.positions.get(2), { x: 20, y: 16 + 52 + 70, semester: 1, row: 1 });
  assert.deepEqual(l.positions.get(4), { x: 20 + 168, y: 68, semester: 2, row: 0 });
  assert.deepEqual(l.positions.get(6), { x: 20 + 3 * 168, y: 68, semester: 4, row: 0 }, "row follows sortIndex");
  assert.equal(l.maxRows, 3);
  assert.equal(l.bandHeight, 52 + 3 * 70 + 16);
  assert.deepEqual(l.semesters, [1, 2, 3, 4]);
  assert.deepEqual(layoutPlan(rows, { spare: true }).semesters, [1, 2, 3, 4, 5]);
});

test("slotFromPoint snaps, clamps, and ignores the moving card", () => {
  const rows = [
    { id: 1, semester: 1, sortIndex: 0 }, { id: 2, semester: 1, sortIndex: 1 }, { id: 3, semester: 2, sortIndex: 2 },
  ];
  assert.deepEqual(slotFromPoint(rows, 1, cardX(2) + 10, cardY(0) + 5), { semester: 2, row: 0 });
  assert.deepEqual(slotFromPoint(rows, 1, cardX(2), cardY(5)), { semester: 2, row: 1 }, "clamped to count");
  assert.deepEqual(slotFromPoint(rows, 3, cardX(1), cardY(1)), { semester: 1, row: 1 });
  assert.deepEqual(slotFromPoint(rows, 1, -500, -500), { semester: 1, row: 0 });
  assert.equal(slotFromPoint(rows, 1, 99999, 0).semester, 3, "one spare column");
  assert.deepEqual(slotFromPoint(rows, 2, cardX(1), cardY(9)), { semester: 1, row: 1 }, "own semester excludes itself");
});

const row = (id: number, code: string | null, p = "", c = ""): EdgeRow => ({
  id, code, prereq: treeToModel(parseRequirement(p)), coreq: treeToModel(parseRequirement(c)),
});

test("docEdges: AND / OR group metadata, externals skipped, complex flagged", () => {
  const rows = [
    row(1, "AAAA1001"), row(2, "BBBB1002"), row(3, "CCCC1003"),
    row(4, "DDDD1004", "AAAA 1001 Y (BBBB 1002 O CCCC 1003) Y ZZZZ 9999"),
    row(5, "EEEE1005", "(AAAA 1001 Y BBBB 1002) O CCCC 1003", "AAAA 1001"),
  ];
  const e = docEdges(rows);
  const of = (t: number) => e.filter((x) => x.target === t && x.kind === "prereq");
  assert.equal(of(4).length, 3, "ZZZZ9999 is not a plan course");
  assert.deepEqual(of(4).map((x) => [x.group, x.groupSize]), [[0, 1], [1, 2], [1, 2]]);
  assert.equal(of(5).length, 3);
  assert.equal(of(5).filter((x) => x.complex).length, 2);
  assert.equal(e.filter((x) => x.kind === "coreq").length, 1);
  assert.equal(new Set(e.map((x) => x.id)).size, e.length, "ids unique");
});

test("mergeApiEdges: agreeing edges drawn once, API-only edges added, doc-only stay", () => {
  const rows = [row(1, "AAAA1001"), row(2, "BBBB1002"), row(3, "CCCC1003", "AAAA 1001 Y BBBB 1002")];
  const doc = docEdges(rows);
  const api = new Map([[3, { prereq: parseRequirement("AAAA 1001"), coreq: parseRequirement("BBBB 1002") }]]);
  const m = mergeApiEdges(doc, rows, api);
  assert.deepEqual(m.doc.map((e) => e.agrees), [true, false]);
  assert.deepEqual(m.api.map((e) => [e.kind, e.source, e.layer]), [["coreq", 2, "api"]]);
});
