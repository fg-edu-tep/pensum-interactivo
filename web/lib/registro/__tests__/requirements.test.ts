import test from "node:test";
import assert from "node:assert/strict";
import { parseRequirement } from "../../import/requirementParser";
import { isTokenCode, parseCoreq, referencedCodes, renderRegistroExpr, rewriteTree, sameTree } from "../requirements";

const tree = (s: string) => parseRequirement(s);

test("isTokenCode: exam tokens yes, real codes no", () => {
  for (const t of ["ENGL7", "INLE4", "RLEC1", "RLEN1"]) assert.equal(isTokenCode(t), true, t);
  for (const t of ["IELE2100", "IELE1118L", "MATE1207", "ISIS1221"]) assert.equal(isTokenCode(t), false, t);
});

test("referencedCodes: prereq + hyphenated coreq, soft markers stripped", () => {
  const s = referencedCodes("(MATE 1207* O MATE 1208) Y IELE 2100", "IELE-1118L");
  assert.deepEqual([...s].sort(), ["IELE1118L", "IELE2100", "MATE1207", "MATE1208"]);
});

test("referencedCodes: fused exam tokens are picked up", () => {
  const s = referencedCodes("IIND 2106 Y (LENG 2999 O ENGL7  O RLEC1 )", "");
  assert.ok(s.has("ENGL7") && s.has("RLEC1") && s.has("LENG2999"));
});

test("render ∘ parse round-trips the real-file expressions (tree-equal)", () => {
  const samples = [
    "MATE 1203 O MATE 1204",
    "(IELE 1002 O IELE 1006 O IELE 1010) Y (MATE 1207 O MATE 1208 O MATE 1257) Y (MATE 2210* O MATE 2211*) Y (FISI 1028 O FISI 1528)",
    "IELE 1082 Y (IELE 2100 O IELE 2206)",
    "IELE 2100 Y (LENG 2999 O LENG 1156 O ENGL7  O RLEC1 ) Y (MATE 1207 O MATE 1208 O MATE 1257) Y (FISI 1029 O FISI 1528)",
    "IELE 3200* Y IELE 2402* Y IELE 2300* Y IELE 2009* Y IELE 2100* Y IIND 2401*",
    "IELE 2206",
  ];
  for (const s of samples) {
    const t = tree(s);
    const back = tree(renderRegistroExpr(t));
    assert.ok(sameTree(t, back), `round trip failed for: ${s}\n→ ${renderRegistroExpr(t)}`);
  }
});

test("render: null -> empty string; single code has no parens", () => {
  assert.equal(renderRegistroExpr(null), "");
  assert.equal(renderRegistroExpr(tree("IELE 2206")), "IELE 2206");
});

test("render: mixed operators get parentheses, same operators flatten", () => {
  assert.equal(renderRegistroExpr(tree("IELE 1001 Y IELE 1002 Y IELE 1003")), "IELE 1001 Y IELE 1002 Y IELE 1003");
  assert.equal(
    renderRegistroExpr(tree("IELE 1001 Y (IELE 1002 O IELE 1003)")),
    "IELE 1001 Y (IELE 1002 O IELE 1003)"
  );
  // ((A Y B) O C) must keep its parens; (A Y (B Y C)) must not gain any
  assert.equal(renderRegistroExpr(tree("(IELE 1001 Y IELE 1002) O IELE 1003")), "(IELE 1001 Y IELE 1002) O IELE 1003");
  assert.equal(renderRegistroExpr(tree("IELE 1001 Y (IELE 1002 Y IELE 1003)")), "IELE 1001 Y IELE 1002 Y IELE 1003");
});

test("rewriteTree: replace swaps the code and keeps the soft flag", () => {
  const t = rewriteTree(tree("IELE 1006* Y MATE 1207"), new Map([["IELE1006", "IELE1002"]]), new Set())!;
  assert.equal(renderRegistroExpr(t), "IELE 1002* Y MATE 1207");
});

test("rewriteTree: drop removes a leaf and collapses the parent", () => {
  const t = rewriteTree(tree("IELE 1002 Y (FISI 1028 O FISI 1528)"), new Map(), new Set(["FISI1028"]))!;
  assert.equal(renderRegistroExpr(t), "IELE 1002 Y FISI 1528");
});

test("rewriteTree: dropping every leaf -> null; dropping a whole OR group collapses the AND", () => {
  assert.equal(rewriteTree(tree("IELE 1002"), new Map(), new Set(["IELE1002"])), null);
  const t = rewriteTree(tree("IELE 1002 Y (LENG 1501 O LENG 1512)"), new Map(), new Set(["LENG1501", "LENG1512"]))!;
  assert.equal(renderRegistroExpr(t), "IELE 1002");
});

test("rewriteTree: a replace that duplicates an alternative collapses it (FISI 1028 O FISI 1528, 1028→1528)", () => {
  const t = rewriteTree(tree("IELE 1002 Y (FISI 1028 O FISI 1528)"), new Map([["FISI1028", "FISI1528"]]), new Set())!;
  assert.equal(renderRegistroExpr(t), "IELE 1002 Y FISI 1528");
});

test("rewriteTree: dedupe keeps the HARD requirement when soft and hard collide", () => {
  const hardWins = rewriteTree(tree("FISI 1028* O FISI 1528"), new Map([["FISI1028", "FISI1528"]]), new Set())!;
  assert.equal(renderRegistroExpr(hardWins), "FISI 1528");
  const bothSoft = rewriteTree(tree("FISI 1028* O FISI 1528*"), new Map([["FISI1028", "FISI1528"]]), new Set())!;
  assert.equal(renderRegistroExpr(bothSoft), "FISI 1528*");
  const hardFirst = rewriteTree(tree("FISI 1028 O FISI 1528*"), new Map([["FISI1028", "FISI1528"]]), new Set())!;
  assert.equal(renderRegistroExpr(hardFirst), "FISI 1528");
});

test("rewriteTree: identical nested groups are collapsed too", () => {
  const t = rewriteTree(tree("(MATE 1207 Y MATE 1214) O (MATE 1207 Y MATE 1214) O IELE 1002"), new Map(), new Set())!;
  assert.equal(renderRegistroExpr(t), "(MATE 1207 Y MATE 1214) O IELE 1002");
});

test("rewriteTree: untouched tree is returned structurally equal", () => {
  const t = tree("IELE 1001 Y (IELE 1002 O IELE 1003)");
  assert.ok(sameTree(t, rewriteTree(t, new Map(), new Set())));
});

test("parseCoreq: hyphenated lab companions parse (same convention as persistCatalog)", () => {
  const t = parseCoreq("IELE-1118L")!;
  assert.equal(t.op, "COURSE");
  assert.equal(t.code, "IELE1118L");
  assert.equal(parseCoreq(""), null);
  assert.equal(parseCoreq(undefined), null);
});
