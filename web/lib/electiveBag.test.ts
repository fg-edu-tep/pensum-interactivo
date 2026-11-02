import test from "node:test";
import assert from "node:assert/strict";
import { boxText, layoutBag, migrateToBag, spanText, splitText, bagCourseId, type BagItem } from "./electiveBag";

const BOXES = ["B1", "B2", "B3", "B4"]; // 8 elective credits
const items = (...credits: number[]): BagItem[] =>
  credits.map((c, i) => ({ key: "ABC"[i] ?? `X${i}`, code: null, title: "ABC"[i] ?? `X${i}`, credits: c }));
const rows = (credits: number[]) => {
  const l = layoutBag(BOXES, items(...credits));
  return { text: BOXES.map((b) => boxText(l.boxes.get(b)!)), l };
};

// the spec's table (Pensum IELE review 2026-10-29, §5.1)
test("3, 1, 4 → 8/8", () => {
  assert.deepEqual(rows([3, 1, 4]).text, ["A · A", "A (cont.) · B", "C · C", "C (cont.) · C (cont.)"]);
});
test("4, 1, 3 → 8/8", () => {
  assert.deepEqual(rows([4, 1, 3]).text, ["A · A", "A (cont.) · A (cont.)", "B · C", "C (cont.) · C (cont.)"]);
});
test("3, 3, 2 → 8/8", () => {
  assert.deepEqual(rows([3, 3, 2]).text, ["A · A", "A (cont.) · B", "B (cont.) · B (cont.)", "C · C"]);
});
test("2, 4, 1 → 7/8, 1 cr libre", () => {
  const r = rows([2, 4, 1]);
  assert.deepEqual(r.text, ["A · A", "B · B", "B (cont.) · B (cont.)", "C · libre"]);
  assert.equal(r.l.capacity - r.l.used, 1);
});
test("4, 4, 3 → 8/8 + C 3 cr excedente", () => {
  const r = rows([4, 4, 3]);
  assert.deepEqual(r.text, ["A · A", "A (cont.) · A (cont.)", "B · B", "B (cont.) · B (cont.)"]);
  assert.equal(r.l.overflow, 3);
  assert.deepEqual(r.l.items.get("C"), { inBag: 0, overflow: 3, boxes: [] });
});
test("3, 3, 3 → 8/8 + C 1 cr excedente, split", () => {
  const r = rows([3, 3, 3]);
  assert.deepEqual(r.text, ["A · A", "A (cont.) · B", "B (cont.) · B (cont.)", "C · C"]);
  assert.equal(r.l.overflow, 1);
  assert.equal(splitText(r.l.items.get("C")), "2 cr en electivas + 1 cr excedente");
});

test("any sequence: 3, 2, 4, 1, 4, 1, 4 never overlaps and conserves credits", () => {
  const seq = [3, 2, 4, 1, 4, 1, 4];
  const its: BagItem[] = seq.map((c, i) => ({ key: `k${i}`, code: null, title: `T${i}`, credits: c }));
  const many = ["B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8"]; // double program: 16 cr
  const l = layoutBag(many, its);
  const filled = [...l.boxes.values()].flat().filter(Boolean).length;
  assert.equal(filled, 16);
  assert.equal(l.overflow, seq.reduce((a, b) => a + b, 0) - 16);
  for (const it of its) {
    const p = l.items.get(it.key)!;
    assert.equal(p.inBag + p.overflow, it.credits);
  }
});

test("removing a course moves the later ones up (reflow)", () => {
  const all = items(3, 1, 4);
  const without = layoutBag(BOXES, all.filter((i) => i.key !== "A"));
  assert.deepEqual(BOXES.map((b) => boxText(without.boxes.get(b)!)), ["B · C", "C (cont.) · C (cont.)", "C (cont.) · libre", "libre · libre"]);
});

test("boxes seen without a course are skipped", () => {
  const l = layoutBag(BOXES, items(4), new Set(["B1"]));
  assert.deepEqual(BOXES.map((b) => boxText(l.boxes.get(b)!)), ["libre · libre", "A · A", "A (cont.) · A (cont.)", "libre · libre"]);
});

test("tooltip and split wording", () => {
  assert.equal(spanText(3), "Esta materia vale 3 créditos: ocupa 1½ casillas");
  assert.equal(spanText(4), "Esta materia vale 4 créditos: ocupa 2 casillas");
  assert.equal(spanText(1), "Esta materia vale 1 crédito: ocupa ½ casilla");
  assert.equal(splitText({ inBag: 3, overflow: 0, boxes: [] }), null);
});

test("older saves become bag items, state moves from the boxes to the item", () => {
  const m = migrateToBag(
    BOXES,
    { B1: { code: "IELE3336", title: "Automatización", credits: 3, electiveId: 7, halves: ["B1#0", "B1#1", "B2#0"] }, "ph-efi-s6-1": { code: null, title: "x", credits: 3 } },
    new Set(["B1", "B2", "B4"]),
    new Map([["B1", "202710"]])
  )!;
  assert.equal(m.items.length, 1);
  assert.equal(m.items[0].key, "e7");
  assert.ok(m.approved.has(bagCourseId("e7")) && !m.approved.has("B1") && !m.approved.has("B2"));
  assert.ok(m.approved.has("B4")); // a box seen without a course stays
  assert.equal(m.planned.get(bagCourseId("e7")), "202710");
  assert.ok("ph-efi-s6-1" in m.assignments && !("B1" in m.assignments));
});
